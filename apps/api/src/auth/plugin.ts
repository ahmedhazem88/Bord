import fastifyJwt from "@fastify/jwt";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { env } from "../env.js";

export interface AccessTokenPayload {
  sub: string; // userId
  isPlatformAdmin: boolean;
  // "mfa_setup" tokens are issued mid-login to a user whose role requires
  // MFA but hasn't enrolled yet — they authenticate nothing except the
  // enroll/confirm endpoints, breaking the otherwise-circular "you need a
  // session to enroll, but can't get a full session without MFA" bootstrap.
  scope: "full" | "mfa_setup";
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AccessTokenPayload;
    user: AccessTokenPayload;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateMfaSetup: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function registerAuthPlugin(app: FastifyInstance): Promise<void> {
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    // Short session lifetime — spec section 9.2 ("session timeouts short and
    // role-appropriate"). Role-specific shortening (e.g. Chairman) is a
    // follow-up once device binding for high-privilege roles is built.
    sign: { expiresIn: "30m" },
  });

  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      if (request.user.scope !== "full") {
        await reply.code(403).send({ error: "mfa_enrollment_required" });
      }
    } catch {
      await reply.code(401).send({ error: "unauthenticated" });
    }
  });

  // Accepts either a full session or an mfa_setup-scoped token — used only
  // by /auth/mfa/enroll and /auth/mfa/confirm.
  app.decorate("authenticateMfaSetup", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      await reply.code(401).send({ error: "unauthenticated" });
    }
  });
}
