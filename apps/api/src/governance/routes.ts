import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { withTenantContext } from "../db.js";
import { requireEntityAccess, requireRole, requirePlatformAdmin } from "../auth/rbac.js";
import { appendAuditLog } from "../audit/auditLog.js";
import { createResolution, passResolution } from "../resolutions/engine.js";
import { validateBoardComposition, type BoardMemberSnapshot } from "./composition.js";

async function currentBoardMembers(tx: Prisma.TransactionClient, entityId: string): Promise<BoardMemberSnapshot[]> {
  const now = new Date();
  const capacities = await tx.capacity.findMany({
    where: { entityId, active: true, startDate: { lte: now }, OR: [{ endDate: null }, { endDate: { gt: now } }] },
    include: { user: { select: { gender: true } } },
  });
  return capacities.map((c) => ({ capacityId: c.id, role: c.role, gender: c.user.gender }));
}

export async function registerGovernanceRoutes(app: FastifyInstance): Promise<void> {
  // Read-only check — lets the UI show violations live as the structure is built, before finalizing.
  app.get("/entities/:entityId/governance/board/validate", { preHandler: [app.authenticate, requireEntityAccess()] }, async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const result = await withTenantContext(entityId, async (tx) => {
      const board = await tx.board.findUniqueOrThrow({ where: { entityId } });
      const members = await currentBoardMembers(tx, entityId);
      return validateBoardComposition(members, { chairMdSeparationExceptionApproved: board.chairMdSeparationExceptionApproved });
    });
    return reply.send(result);
  });

  // Epic 3 AC: finalizing (persisting a compliant snapshot) is blocked outright on violation.
  app.post(
    "/entities/:entityId/governance/board/finalize",
    { preHandler: [app.authenticate, requireRole("CHAIRMAN", "CORPORATE_SECRETARY", "COMPLIANCE_OFFICER")] },
    async (request, reply) => {
      const { entityId } = request.params as { entityId: string };
      const result = await withTenantContext(entityId, async (tx) => {
        const board = await tx.board.findUniqueOrThrow({ where: { entityId } });
        const members = await currentBoardMembers(tx, entityId);
        const check = validateBoardComposition(members, { chairMdSeparationExceptionApproved: board.chairMdSeparationExceptionApproved });

        await tx.board.update({ where: { entityId }, data: { lastValidatedAt: new Date(), lastValidationPassed: check.valid } });
        await appendAuditLog(tx, {
          entityId,
          actorUserId: request.user.sub,
          action: "BOARD_STRUCTURE_FINALIZE_ATTEMPTED",
          tableName: "Board",
          recordId: board.id,
          afterData: check,
        });
        return check;
      });

      if (!result.valid) {
        return reply.code(422).send({ error: "board composition is not compliant", violations: result.violations });
      }
      return reply.send({ finalized: true });
    },
  );

  const seedSchema = z.object({
    userId: z.string(),
    role: z.enum([
      "CHAIRMAN",
      "VICE_CHAIRMAN",
      "MANAGING_DIRECTOR",
      "CORPORATE_SECRETARY",
      "EXECUTIVE_BOARD_MEMBER",
      "NON_EXECUTIVE_BOARD_MEMBER",
      "INDEPENDENT_BOARD_MEMBER",
      "COMPLIANCE_OFFICER",
    ]),
  });

  // Bootstrap-only path: seeds the first board capacities through the same
  // Resolution Engine everything else uses (via the founding agenda item
  // created at onboarding), rather than writing Capacity directly. Closes
  // itself once the board has passed composition validation at least once —
  // after that, every change must go through a real convened meeting.
  app.post(
    "/entities/:entityId/governance/board/seed-initial-capacity",
    { preHandler: [app.authenticate, requirePlatformAdmin] },
    async (request, reply) => {
      const { entityId } = request.params as { entityId: string };
      const body = seedSchema.parse(request.body);

      const result = await withTenantContext(entityId, async (tx) => {
        const board = await tx.board.findUniqueOrThrow({ where: { entityId } });
        if (board.lastValidationPassed) {
          throw Object.assign(new Error("bootstrap window closed: board has already passed composition validation once"), {
            statusCode: 409,
          });
        }
        if (!board.foundingAgendaItemId) {
          throw Object.assign(new Error("entity has no founding agenda item on record"), { statusCode: 500 });
        }

        const resolution = await createResolution(tx, {
          entityId,
          agendaItemId: board.foundingAgendaItemId,
          type: "BOARD_APPOINTMENT",
          title: `Initial appointment — ${body.role}`,
          description: "Bootstrap appointment during entity onboarding.",
          requiredMajority: "N/A_BOOTSTRAP",
          actorUserId: request.user.sub,
        });

        const passed = await passResolution(tx, resolution.id, request.user.sub, {
          type: "BOARD_APPOINTMENT",
          userId: body.userId,
          role: body.role,
        });

        // Bootstrap-only: normally activation waits on the Epic 2
        // verification review by a Compliance Officer, but a brand-new
        // entity has no Compliance Officer yet either. Platform Admin's
        // act of seeding this capacity during onboarding stands in for that
        // first review, logged explicitly as such.
        const snapshot = passed.preResolutionSnapshot as { capacityId: string };
        await tx.capacity.update({
          where: { id: snapshot.capacityId },
          data: { verificationStatus: "APPROVED", active: true, reviewedByUserId: request.user.sub, reviewedAt: new Date() },
        });
        await appendAuditLog(tx, {
          entityId,
          actorUserId: request.user.sub,
          action: "BOOTSTRAP_CAPACITY_AUTO_ACTIVATED",
          tableName: "Capacity",
          recordId: snapshot.capacityId,
          afterData: { reason: "onboarding bootstrap seed, no Compliance Officer exists yet" },
        });

        return passed;
      });

      return reply.code(201).send(result);
    },
  );

  app.get("/entities/:entityId/governance/committees", { preHandler: [app.authenticate, requireEntityAccess()] }, async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const committees = await withTenantContext(entityId, (tx) =>
      tx.committee.findMany({ where: { entityId, dissolvedAt: null }, include: { memberships: { where: { endDate: null } } } }),
    );
    return reply.send(committees);
  });
}
