import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withTenantContext, withPlatformAdminContext } from "../db.js";
import { requirePlatformAdmin } from "../auth/rbac.js";
import { appendAuditLog } from "../audit/auditLog.js";

const createEntitySchema = z.object({
  legalName: z.string().min(1),
  registrationNumber: z.string().min(1),
  entityType: z.enum(["INSURANCE", "LEASING", "FACTORING", "MORTGAGE_FINANCE", "MICROFINANCE", "BROKERAGE"]),
});

/**
 * Entity onboarding — Platform Admin only (PRD section 2: operator-side,
 * never holds standing access to an entity's governance data once
 * onboarded). Creates the Entity row and its single Board shell; board
 * composition itself is filled in afterward entirely through Capacity
 * resolutions (spec section 3 / PRD 5.2).
 */
export async function registerEntityRoutes(app: FastifyInstance): Promise<void> {
  app.post("/entities", { preHandler: [app.authenticate, requirePlatformAdmin] }, async (request, reply) => {
    const body = createEntitySchema.parse(request.body);

    // withPlatformAdminContext (not withoutTenantContext): Postgres RLS
    // evaluates RETURNING against the SELECT policy too, and at insert time
    // no tenant context exists yet for the not-yet-created entity — the
    // platform-admin SELECT branch is what makes the RETURNING row visible.
    const entity = await withPlatformAdminContext((tx) => tx.entity.create({ data: body }));

    await withTenantContext(entity.id, async (tx) => {
      // Synthetic founding meeting + agenda item — see Board.foundingAgendaItemId
      // comment in schema.prisma for why this exists.
      const foundingMeeting = await tx.meeting.create({
        data: { entityId: entity.id, type: "BOARD", scheduledAt: new Date(), status: "CLOSED" },
      });
      const foundingAgendaItem = await tx.agendaItem.create({
        data: { meetingId: foundingMeeting.id, order: 0, title: "Initial constitution of the board", description: "Entity onboarding" },
      });
      await tx.board.create({ data: { entityId: entity.id, foundingAgendaItemId: foundingAgendaItem.id } });
      await appendAuditLog(tx, {
        entityId: entity.id,
        actorUserId: request.user.sub,
        action: "ENTITY_ONBOARDED",
        tableName: "Entity",
        recordId: entity.id,
        afterData: body,
      });
    });

    return reply.code(201).send(entity);
  });

  app.get("/entities", { preHandler: [app.authenticate, requirePlatformAdmin] }, async (_request, reply) => {
    const entities = await withPlatformAdminContext((tx) => tx.entity.findMany({ orderBy: { createdAt: "desc" } }));
    return reply.send(entities);
  });
}
