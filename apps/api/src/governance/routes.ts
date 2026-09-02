import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { withTenantContext } from "../db.js";
import { requireEntityAccess, requireRole, requirePlatformAdmin } from "../auth/rbac.js";
import { appendAuditLog } from "../audit/auditLog.js";
import { createResolution, passResolution } from "../resolutions/engine.js";
import { validateBoardComposition, validateCommitteeComposition, type BoardMemberSnapshot, type CommitteeSnapshot } from "./composition.js";

async function currentBoardMembers(tx: Prisma.TransactionClient, entityId: string): Promise<BoardMemberSnapshot[]> {
  const now = new Date();
  const capacities = await tx.capacity.findMany({
    where: { entityId, active: true, startDate: { lte: now }, OR: [{ endDate: null }, { endDate: { gt: now } }] },
    include: { user: { select: { gender: true } } },
  });
  return capacities.map((c) => ({ capacityId: c.id, userId: c.userId, role: c.role, gender: c.user.gender }));
}

async function currentCommittees(tx: Prisma.TransactionClient, entityId: string): Promise<CommitteeSnapshot[]> {
  const committees = await tx.committee.findMany({
    where: { entityId, dissolvedAt: null },
    include: { memberships: { where: { endDate: null }, include: { capacity: { select: { role: true } } } } },
  });
  return committees.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    minIndependentCount: c.minIndependentCount,
    members: c.memberships.map((m) => ({ role: m.capacity.role, isChair: m.isChair })),
  }));
}

export async function registerGovernanceRoutes(app: FastifyInstance): Promise<void> {
  // Read-only check — lets the UI show violations live as the structure is built, before finalizing.
  app.get("/entities/:entityId/governance/board/validate", { preHandler: [app.authenticate, requireEntityAccess()] }, async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const result = await withTenantContext(entityId, async (tx) => {
      const board = await tx.board.findUniqueOrThrow({ where: { entityId } });
      const [members, committees] = await Promise.all([currentBoardMembers(tx, entityId), currentCommittees(tx, entityId)]);
      const boardCheck = validateBoardComposition(members, { chairMdSeparationExceptionApproved: board.chairMdSeparationExceptionApproved });
      const committeeCheck = validateCommitteeComposition(committees);
      return { valid: boardCheck.valid && committeeCheck.valid, violations: [...boardCheck.violations, ...committeeCheck.violations] };
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
        const [members, committees] = await Promise.all([currentBoardMembers(tx, entityId), currentCommittees(tx, entityId)]);
        const boardCheck = validateBoardComposition(members, { chairMdSeparationExceptionApproved: board.chairMdSeparationExceptionApproved });
        const committeeCheck = validateCommitteeComposition(committees);
        const check = { valid: boardCheck.valid && committeeCheck.valid, violations: [...boardCheck.violations, ...committeeCheck.violations] };

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

  const BOARD_ROLE_ENUM = z.enum([
    "CHAIRMAN",
    "VICE_CHAIRMAN",
    "MANAGING_DIRECTOR",
    "CORPORATE_SECRETARY",
    "EXECUTIVE_BOARD_MEMBER",
    "NON_EXECUTIVE_BOARD_MEMBER",
    "INDEPENDENT_BOARD_MEMBER",
    "COMPLIANCE_OFFICER",
  ]);

  const initialStructureSchema = z.object({
    boardAppointments: z.array(z.object({ userId: z.string(), role: BOARD_ROLE_ENUM })).min(1),
    gaMembers: z.array(z.object({ userId: z.string(), sharePercentage: z.number().min(0).max(100) })).default([]),
    committees: z
      .array(
        z.object({
          name: z.string().min(1),
          committeeType: z.enum(["AUDIT", "RISK", "REMUNERATION_AND_NOMINATION", "GOVERNANCE", "CUSTOM"]),
          charterMandate: z.string().min(1),
          quorumRule: z.string().min(1),
          minIndependentCount: z.number().int().nonnegative().default(0),
          memberUserIds: z.array(z.string()).min(1),
          chairUserId: z.string().optional(),
        }),
      )
      .default([]),
  });

  // Onboarding: establishes a company's ACTUAL current governance structure
  // (read off their real Articles of Association / bylaws / cap table) as
  // the baseline, in one bootstrap resolution — not built up one
  // BOARD_APPOINTMENT at a time. Still goes through the Resolution Engine
  // (via the founding agenda item created at entity onboarding), so the
  // audit trail starts from a real resolution rather than a direct write.
  // Closes itself once the board has passed composition validation at
  // least once — after that, every change must go through a real convened
  // meeting and its own resolution, same as before.
  app.post(
    "/entities/:entityId/governance/board/establish-initial-structure",
    { preHandler: [app.authenticate, requirePlatformAdmin] },
    async (request, reply) => {
      const { entityId } = request.params as { entityId: string };
      const body = initialStructureSchema.parse(request.body);

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

        const boardUserIds = new Set(body.boardAppointments.map((a) => a.userId));
        for (const c of body.committees) {
          for (const memberUserId of c.memberUserIds) {
            if (!boardUserIds.has(memberUserId)) {
              throw Object.assign(new Error(`committee "${c.name}" lists a member (${memberUserId}) who isn't among boardAppointments`), {
                statusCode: 400,
              });
            }
          }
        }

        const resolution = await createResolution(tx, {
          entityId,
          agendaItemId: board.foundingAgendaItemId,
          type: "INITIAL_STRUCTURE",
          title: "Initial governance structure (onboarding)",
          description: "Baseline board, committee, and GA structure established from the entity's onboarding documents.",
          requiredMajority: "N/A_BOOTSTRAP",
          actorUserId: request.user.sub,
        });

        return passResolution(tx, resolution.id, request.user.sub, { type: "INITIAL_STRUCTURE", ...body });
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
