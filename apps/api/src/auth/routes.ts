import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { STRONG_MFA_ROLES, type GovernanceRole } from "@bord/shared";
import { prisma, withoutTenantContext } from "../db.js";
import { appendAuditLog } from "../audit/auditLog.js";
import { hashPassword, verifyPassword } from "./password.js";
import { generateMfaSecret, otpAuthUrl, verifyMfaToken } from "./mfa.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12, "Password must be at least 12 characters"),
  fullName: z.string().min(1),
  locale: z.enum(["ar", "en"]).default("ar"),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  mfaToken: z.string().optional(),
});

// Spec section 9.2: MFA is mandatory for every user — STRONG_MFA_ROLES only
// marks which roles additionally require a *stronger* factor (hardware key,
// never SMS) once more than one factor type exists. Today TOTP (an
// authenticator app, never SMS) is the only factor implemented, so it
// already satisfies the "never SMS" half of that requirement for everyone;
// what it does NOT yet do is differentiate a hardware-key-only path for the
// three strong-MFA roles — that's real follow-up work, not this fix.
async function userIsStrongMfaRole(userId: string): Promise<boolean> {
  const [platformAdmin, strongCapacity] = await Promise.all([
    prisma.platformAdmin.findUnique({ where: { userId } }),
    prisma.capacity.findFirst({
      where: { userId, active: true, role: { in: STRONG_MFA_ROLES.filter((r): r is GovernanceRole => r !== "PLATFORM_ADMIN") } },
    }),
  ]);
  return Boolean(platformAdmin) || Boolean(strongCapacity);
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/register", async (request, reply) => {
    const body = registerSchema.parse(request.body);

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      return reply.code(409).send({ error: "an account with this email already exists" });
    }

    const passwordHash = await hashPassword(body.password);

    const user = await withoutTenantContext(async (tx) => {
      const created = await tx.user.create({
        data: { email: body.email, passwordHash, fullName: body.fullName, locale: body.locale },
      });
      await appendAuditLog(tx, {
        entityId: null,
        actorUserId: created.id,
        action: "USER_REGISTERED",
        tableName: "User",
        recordId: created.id,
        afterData: { email: created.email, fullName: created.fullName },
      });
      return created;
    });

    return reply.code(201).send({ id: user.id, email: user.email, fullName: user.fullName });
  });

  app.post("/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });

    // Constant-shape response to avoid user enumeration via timing/shape.
    const invalid = () => reply.code(401).send({ error: "invalid credentials" });

    if (!user) return invalid();
    const passwordOk = await verifyPassword(user.passwordHash, body.password);
    if (!passwordOk) return invalid();

    // Mandatory for every user (spec 9.2) — not just the strong-MFA roles.
    if (!user.mfaEnabled) {
      const setupToken = app.jwt.sign({ sub: user.id, isPlatformAdmin: false, scope: "mfa_setup" }, { expiresIn: "10m" });
      const strongFactorRequired = await userIsStrongMfaRole(user.id);
      return reply.code(403).send({
        error: "mfa_enrollment_required",
        message: strongFactorRequired
          ? "This role requires a stronger multi-factor authentication before login can complete."
          : "Multi-factor authentication is required for every account before login can complete.",
        setupToken,
        strongFactorRequired,
      });
    }

    if (user.mfaEnabled) {
      if (!body.mfaToken) {
        return reply.code(401).send({ error: "mfa_token_required" });
      }
      if (!user.mfaSecret || !verifyMfaToken(user.mfaSecret, body.mfaToken)) {
        return invalid();
      }
    }

    const platformAdmin = await prisma.platformAdmin.findUnique({ where: { userId: user.id } });
    const token = app.jwt.sign({ sub: user.id, isPlatformAdmin: Boolean(platformAdmin), scope: "full" });

    await withoutTenantContext((tx) =>
      appendAuditLog(tx, {
        entityId: null,
        actorUserId: user.id,
        action: "USER_LOGIN",
        tableName: "User",
        recordId: user.id,
      }),
    );

    return reply.send({ token });
  });

  app.post("/auth/mfa/enroll", { preHandler: app.authenticateMfaSetup }, async (request, reply) => {
    const userId = request.user.sub;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.mfaEnabled) {
      return reply.code(409).send({ error: "mfa_already_enabled" });
    }
    const secret = generateMfaSecret();
    await prisma.user.update({ where: { id: userId }, data: { mfaSecret: secret } });
    return reply.send({ secret, otpAuthUrl: otpAuthUrl(secret, user.email) });
  });

  const confirmMfaSchema = z.object({ token: z.string() });

  app.post("/auth/mfa/confirm", { preHandler: app.authenticateMfaSetup }, async (request, reply) => {
    const { token } = confirmMfaSchema.parse(request.body);
    const userId = request.user.sub;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaSecret) {
      return reply.code(400).send({ error: "call /auth/mfa/enroll first" });
    }
    if (!verifyMfaToken(user.mfaSecret, token)) {
      return reply.code(401).send({ error: "invalid_token" });
    }
    await withoutTenantContext(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
      await appendAuditLog(tx, {
        entityId: null,
        actorUserId: userId,
        action: "MFA_ENABLED",
        tableName: "User",
        recordId: userId,
      });
    });
    return reply.send({ mfaEnabled: true });
  });
}
