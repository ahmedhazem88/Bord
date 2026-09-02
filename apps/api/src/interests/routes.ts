import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withTenantContext } from "../db.js";
import { requireCapability, requireEntityAccess } from "../auth/rbac.js";
import { appendAuditLog } from "../audit/auditLog.js";

/**
 * Interest registry (Epic 9) — spec section 9: every capacity holder keeps
 * a standing declared-interests record (related entities, competing
 * directorships, family/ownership ties), re-confirmed at appointment
 * (regulatory/obligations.ts seeds the reminder) and annually. Reading
 * these against a specific agenda item — the auto-flag-and-default-to-
 * Recused half of the spec requirement — lives in agenda/review.ts and
 * resolutions/voting.ts, since that's where an agenda item's or a
 * resolution's text is actually available to match against.
 */

const declareSchema = z.object({
  relatedEntityName: z.string().min(1),
  natureOfInterest: z.string().min(1),
});

export async function registerInterestRoutes(app: FastifyInstance): Promise<void> {
  // Always self — "capacity holder" declares their own interests; no role
  // grants declaring on someone else's behalf (spec section 9).
  app.post(
    "/entities/:entityId/capacities/:capacityId/interest-declarations",
    { preHandler: [app.authenticate, requireEntityAccess()] },
    async (request, reply) => {
      const { entityId, capacityId } = request.params as { entityId: string; capacityId: string };
      const body = declareSchema.parse(request.body);

      const declaration = await withTenantContext(entityId, async (tx) => {
        const capacity = await tx.capacity.findUniqueOrThrow({ where: { id: capacityId } });
        if (capacity.userId !== request.user.sub) {
          throw Object.assign(new Error("can only declare your own interests"), { statusCode: 403 });
        }
        const created = await tx.interestDeclaration.create({
          data: { capacityId, declaredByUserId: request.user.sub, relatedEntityName: body.relatedEntityName, natureOfInterest: body.natureOfInterest },
        });
        await appendAuditLog(tx, {
          entityId,
          actorUserId: request.user.sub,
          action: "INTEREST_DECLARED",
          tableName: "InterestDeclaration",
          recordId: created.id,
          afterData: body,
        });
        return created;
      });

      return reply.code(201).send(declaration);
    },
  );

  app.get(
    "/entities/:entityId/capacities/:capacityId/interest-declarations",
    { preHandler: [app.authenticate, requireEntityAccess()] },
    async (request, reply) => {
      const { entityId, capacityId } = request.params as { entityId: string; capacityId: string };
      const declarations = await withTenantContext(entityId, (tx) =>
        tx.interestDeclaration.findMany({ where: { capacityId }, orderBy: { dateDeclared: "desc" } }),
      );
      return reply.send(declarations);
    },
  );

  // Every active declaration across the entity — what the Chairman/Secretary
  // actually need to cross-check an agenda item against before a meeting
  // (agenda/review.ts calls this same query internally too).
  app.get(
    "/entities/:entityId/interest-declarations",
    { preHandler: [app.authenticate, requireCapability("agenda:set")] },
    async (request, reply) => {
      const { entityId } = request.params as { entityId: string };
      const declarations = await withTenantContext(entityId, (tx) =>
        tx.interestDeclaration.findMany({
          where: { capacity: { entityId }, active: true },
          include: { capacity: { select: { role: true } }, declaredByUser: { select: { fullName: true } } },
          orderBy: { dateDeclared: "desc" },
        }),
      );
      return reply.send(declarations);
    },
  );

  app.post(
    "/entities/:entityId/interest-declarations/:declarationId/deactivate",
    { preHandler: [app.authenticate, requireEntityAccess()] },
    async (request, reply) => {
      const { entityId, declarationId } = request.params as { entityId: string; declarationId: string };
      const updated = await withTenantContext(entityId, async (tx) => {
        const declaration = await tx.interestDeclaration.findUniqueOrThrow({ where: { id: declarationId }, include: { capacity: true } });
        if (declaration.capacity.userId !== request.user.sub) {
          throw Object.assign(new Error("can only withdraw your own interest declarations"), { statusCode: 403 });
        }
        const result = await tx.interestDeclaration.update({ where: { id: declarationId }, data: { active: false } });
        await appendAuditLog(tx, { entityId, actorUserId: request.user.sub, action: "INTEREST_DECLARATION_WITHDRAWN", tableName: "InterestDeclaration", recordId: declarationId });
        return result;
      });
      return reply.send(updated);
    },
  );
}
