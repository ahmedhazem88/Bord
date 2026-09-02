import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withTenantContext } from "../db.js";
import { requireCapability, requireEntityAccess } from "../auth/rbac.js";
import { appendAuditLog } from "../audit/auditLog.js";

/**
 * Epic 5 (Meeting & Conferencing) — scaffolded, not the full module.
 * Built here: scheduling, agenda items, RSVP/attendance recording.
 * NOT built yet (tracked as follow-up, kept out of this pass's scope per
 * the PRD's suggested build sequence, section 12): live quorum calculation
 * including proxies, the four-value vote tally wired to Resolution passage,
 * off-agenda-item blocking + 100%-unanimous-addition override, convocation-
 * rights threshold enforcement, virtual-attendance recording retention, and
 * minutes generation/e-signature.
 */

const scheduleMeetingSchema = z.object({
  type: z.enum(["BOARD", "COMMITTEE", "OGM", "EGM"]),
  scheduledAt: z.string().datetime(),
  location: z.string().optional(),
  isVirtual: z.boolean().default(false),
  committeeId: z.string().optional(),
});

const addAgendaItemSchema = z.object({
  order: z.number().int().nonnegative(),
  title: z.string().min(1),
  description: z.string().optional(),
});

const rsvpSchema = z.object({
  capacityId: z.string(),
  mode: z.enum(["IN_PERSON", "VIRTUAL", "PROXY", "ABSENT"]),
});

export async function registerMeetingRoutes(app: FastifyInstance): Promise<void> {
  app.post("/entities/:entityId/meetings", { preHandler: [app.authenticate, requireCapability("meeting:schedule")] }, async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const body = scheduleMeetingSchema.parse(request.body);

    const meeting = await withTenantContext(entityId, async (tx) => {
      const created = await tx.meeting.create({
        data: { entityId, type: body.type, scheduledAt: new Date(body.scheduledAt), location: body.location, isVirtual: body.isVirtual, committeeId: body.committeeId },
      });
      await appendAuditLog(tx, {
        entityId,
        actorUserId: request.user.sub,
        action: "MEETING_SCHEDULED",
        tableName: "Meeting",
        recordId: created.id,
        afterData: body,
      });
      return created;
    });

    return reply.code(201).send(meeting);
  });

  app.get("/entities/:entityId/meetings", { preHandler: [app.authenticate, requireEntityAccess()] }, async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const meetings = await withTenantContext(entityId, (tx) => tx.meeting.findMany({ where: { entityId }, orderBy: { scheduledAt: "desc" } }));
    return reply.send(meetings);
  });

  app.post(
    "/entities/:entityId/meetings/:meetingId/agenda-items",
    { preHandler: [app.authenticate, requireCapability("agenda:set")] },
    async (request, reply) => {
      const { entityId, meetingId } = request.params as { entityId: string; meetingId: string };
      const body = addAgendaItemSchema.parse(request.body);

      const item = await withTenantContext(entityId, async (tx) => {
        const created = await tx.agendaItem.create({ data: { meetingId, ...body } });
        await appendAuditLog(tx, {
          entityId,
          actorUserId: request.user.sub,
          action: "AGENDA_ITEM_ADDED",
          tableName: "AgendaItem",
          recordId: created.id,
          afterData: body,
        });
        return created;
      });

      return reply.code(201).send(item);
    },
  );

  app.get("/entities/:entityId/meetings/:meetingId/agenda-items", { preHandler: [app.authenticate, requireEntityAccess()] }, async (request, reply) => {
    const { entityId, meetingId } = request.params as { entityId: string; meetingId: string };
    const items = await withTenantContext(entityId, (tx) => tx.agendaItem.findMany({ where: { meetingId }, orderBy: { order: "asc" } }));
    return reply.send(items);
  });

  // Closes the cross-tenant hole (any authenticated user marking attendance
  // at an unrelated entity's meeting); it does not yet check that the caller
  // is either the attendee themselves or the Secretary recording on their
  // behalf — that finer-grained check is a follow-up, not covered here.
  app.put("/entities/:entityId/meetings/:meetingId/attendance", { preHandler: [app.authenticate, requireEntityAccess()] }, async (request, reply) => {
    const { entityId, meetingId } = request.params as { entityId: string; meetingId: string };
    const body = rsvpSchema.parse(request.body);

    const attendance = await withTenantContext(entityId, (tx) =>
      tx.meetingAttendance.upsert({
        where: { meetingId_capacityId: { meetingId, capacityId: body.capacityId } },
        create: { meetingId, capacityId: body.capacityId, mode: body.mode, checkedInAt: new Date() },
        update: { mode: body.mode, checkedInAt: new Date() },
      }),
    );

    return reply.send(attendance);
  });
}
