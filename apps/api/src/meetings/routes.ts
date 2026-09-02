import type { FastifyInstance } from "fastify";
import type { GovernanceRole, Prisma } from "@prisma/client";
import { z } from "zod";
import { can } from "@bord/shared";
import { withTenantContext } from "../db.js";
import { requireCapability, requireEntityAccess } from "../auth/rbac.js";
import { appendAuditLog } from "../audit/auditLog.js";
import { computeQuorum, getMeetingRoster, resolveQuorumRules } from "./quorum.js";
import { createMeetingRequest, escalateMeetingRequest, markMeetingRequestCalled, MeetingRequestError } from "./requests.js";

/**
 * Epic 5 (Meeting & Conferencing).
 * Built here: scheduling (including OGM/EGM second meetings), agenda items,
 * attendance/RSVP recording, the context-based live quorum calculator that
 * blocks the meeting from staying QUORATE once attendance drops below
 * threshold, and the convocation-rights MeetingRequest workflow (1/3 board
 * threshold + 10-day Chairman window; 5%/10% GA capital threshold +
 * 1-month board window). Voting itself lives in resolutions/voting.ts,
 * since a vote is cast against a Resolution, not a Meeting.
 * NOT built yet: off-agenda-item blocking + 100%-unanimous-addition
 * override, virtual-attendance recording-retention enforcement, and
 * actually notifying GAFI/the regulator on escalation (out-of-platform act
 * — this records that the window lapsed, nothing more).
 */

const scheduleMeetingSchema = z.object({
  type: z.enum(["BOARD", "COMMITTEE", "OGM", "EGM"]),
  scheduledAt: z.string().datetime(),
  location: z.string().optional(),
  isVirtual: z.boolean().default(false),
  committeeId: z.string().optional(),
  // OGM second meeting: no new invitation, valid regardless of attendance.
  // EGM second meeting: within 30 days, valid at the lower capital floor.
  isSecondMeeting: z.boolean().default(false),
  firstMeetingId: z.string().optional(),
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
        data: {
          entityId,
          type: body.type,
          scheduledAt: new Date(body.scheduledAt),
          location: body.location,
          isVirtual: body.isVirtual,
          committeeId: body.committeeId,
          isSecondMeeting: body.isSecondMeeting,
          firstMeetingId: body.firstMeetingId,
        },
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

  // Live, context-based quorum status — Epic 5 AC.
  app.get("/entities/:entityId/meetings/:meetingId/quorum", { preHandler: [app.authenticate, requireEntityAccess()] }, async (request, reply) => {
    const { entityId, meetingId } = request.params as { entityId: string; meetingId: string };
    const result = await withTenantContext(entityId, (tx) => computeMeetingQuorum(tx, entityId, meetingId));
    return reply.send(result);
  });

  // Closes the cross-tenant hole (any authenticated user marking attendance
  // at an unrelated entity's meeting); it does not yet check that the caller
  // is either the attendee themselves or the Secretary recording on their
  // behalf — that finer-grained check is a follow-up, not covered here.
  //
  // Recomputes quorum on every change and flips Meeting.status between
  // QUORATE / QUORUM_LOST live — this is what makes "voting blocked the
  // instant quorum is lost mid-meeting" true instead of only checked at
  // vote-cast time (the voting engine checks it again independently too).
  app.put("/entities/:entityId/meetings/:meetingId/attendance", { preHandler: [app.authenticate, requireEntityAccess()] }, async (request, reply) => {
    const { entityId, meetingId } = request.params as { entityId: string; meetingId: string };
    const body = rsvpSchema.parse(request.body);

    const result = await withTenantContext(entityId, async (tx) => {
      const attendance = await tx.meetingAttendance.upsert({
        where: { meetingId_capacityId: { meetingId, capacityId: body.capacityId } },
        create: { meetingId, capacityId: body.capacityId, mode: body.mode, checkedInAt: new Date() },
        update: { mode: body.mode, checkedInAt: new Date() },
      });

      const quorum = await computeMeetingQuorum(tx, entityId, meetingId);
      const meeting = await tx.meeting.findUniqueOrThrow({ where: { id: meetingId } });
      const wasQuorate = meeting.status === "QUORATE";
      const nextStatus = quorum.met ? "QUORATE" : meeting.status === "IN_PROGRESS" || wasQuorate ? "QUORUM_LOST" : meeting.status;

      if (nextStatus !== meeting.status) {
        await tx.meeting.update({ where: { id: meetingId }, data: { status: nextStatus, quorumMet: quorum.met } });
        if (wasQuorate && !quorum.met) {
          await appendAuditLog(tx, {
            entityId,
            actorUserId: request.user.sub,
            action: "QUORUM_LOST",
            tableName: "Meeting",
            recordId: meetingId,
            afterData: quorum,
          });
        }
      } else if (meeting.quorumMet !== quorum.met) {
        await tx.meeting.update({ where: { id: meetingId }, data: { quorumMet: quorum.met } });
      }

      return { attendance, quorum };
    });

    return reply.send(result);
  });

  app.post(
    "/entities/:entityId/meetings/:meetingId/close",
    { preHandler: [app.authenticate, requireCapability("meeting:schedule")] },
    async (request, reply) => {
      const { entityId, meetingId } = request.params as { entityId: string; meetingId: string };
      const meeting = await withTenantContext(entityId, async (tx) => {
        const updated = await tx.meeting.update({ where: { id: meetingId }, data: { status: "CLOSED", closedAt: new Date() } });
        await appendAuditLog(tx, { entityId, actorUserId: request.user.sub, action: "MEETING_CLOSED", tableName: "Meeting", recordId: meetingId });
        return updated;
      });
      return reply.send(meeting);
    },
  );

  // ---- Convocation rights: the MeetingRequest workflow ----

  app.post("/entities/:entityId/meeting-requests", { preHandler: [app.authenticate, requireEntityAccess()] }, async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const body = z
      .object({ type: z.enum(["BOARD", "OGM", "EGM"]), requestorCapacityIds: z.array(z.string()).min(1) })
      .parse(request.body);

    try {
      const result = await withTenantContext(entityId, async (tx) => {
        const requiredAction = body.type === "BOARD" ? "meeting:request_board" : "meeting:request_ga";
        const callerCapacity = await tx.capacity.findFirst({
          where: { userId: request.user.sub, entityId, active: true, verificationStatus: "APPROVED" },
          select: { role: true },
        });
        if (!callerCapacity || !can(callerCapacity.role as GovernanceRole, requiredAction)) {
          throw new MeetingRequestError(`role does not grant '${requiredAction}' at this entity`, 403);
        }
        return createMeetingRequest(tx, entityId, { type: body.type, requestorCapacityIds: body.requestorCapacityIds, actorUserId: request.user.sub });
      });
      return reply.code(201).send(result);
    } catch (error) {
      if (error instanceof MeetingRequestError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });

  app.get("/entities/:entityId/meeting-requests", { preHandler: [app.authenticate, requireEntityAccess()] }, async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const requests = await withTenantContext(entityId, (tx) => tx.meetingRequest.findMany({ where: { entityId }, orderBy: { createdAt: "desc" } }));
    return reply.send(requests);
  });

  app.post(
    "/entities/:entityId/meeting-requests/:requestId/mark-called",
    { preHandler: [app.authenticate, requireCapability("meeting:schedule")] },
    async (request, reply) => {
      const { entityId, requestId } = request.params as { entityId: string; requestId: string };
      const { meetingId } = z.object({ meetingId: z.string() }).parse(request.body);
      try {
        const result = await withTenantContext(entityId, (tx) => markMeetingRequestCalled(tx, requestId, request.user.sub, meetingId));
        return reply.send(result);
      } catch (error) {
        if (error instanceof MeetingRequestError) return reply.code(error.statusCode).send({ error: error.message });
        throw error;
      }
    },
  );

  app.post(
    "/entities/:entityId/meeting-requests/:requestId/escalate",
    { preHandler: [app.authenticate, requireEntityAccess()] },
    async (request, reply) => {
      const { entityId, requestId } = request.params as { entityId: string; requestId: string };
      try {
        const result = await withTenantContext(entityId, (tx) => escalateMeetingRequest(tx, requestId, request.user.sub));
        return reply.send(result);
      } catch (error) {
        if (error instanceof MeetingRequestError) return reply.code(error.statusCode).send({ error: error.message });
        throw error;
      }
    },
  );
}

export async function computeMeetingQuorum(tx: Prisma.TransactionClient, entityId: string, meetingId: string) {
  const meeting = await tx.meeting.findUniqueOrThrow({ where: { id: meetingId } });
  const [roster, attendance, rules] = await Promise.all([
    getMeetingRoster(tx, entityId, meeting.type, meeting.committeeId),
    tx.meetingAttendance.findMany({ where: { meetingId }, select: { capacityId: true, mode: true } }),
    resolveQuorumRules(tx, entityId),
  ]);
  return computeQuorum(meeting.type, meeting.isSecondMeeting, roster, attendance, rules);
}
