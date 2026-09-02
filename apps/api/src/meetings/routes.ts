import type { FastifyInstance } from "fastify";
import type { GovernanceRole, Prisma } from "@prisma/client";
import { z } from "zod";
import { can, grantsFor, BOARD_ROLES } from "@bord/shared";
import { withTenantContext } from "../db.js";
import { requireCapability, requireEntityAccess } from "../auth/rbac.js";
import { appendAuditLog } from "../audit/auditLog.js";
import { computeQuorum, getMeetingRoster, resolveQuorumRules } from "./quorum.js";
import { createMeetingRequest, escalateMeetingRequest, markMeetingRequestCalled, MeetingRequestError } from "./requests.js";
import { reviewAgendaItem } from "../agenda/review.js";
import { createResolution, type ResolutionEffectPayload } from "../resolutions/engine.js";
import { requiredMajorityForType } from "../resolutions/majority.js";

/**
 * Epic 5 (Meeting & Conferencing).
 * Built here: scheduling (including OGM/EGM second meetings), agenda items,
 * attendance/RSVP recording, the context-based live quorum calculator that
 * blocks the meeting from staying QUORATE once attendance drops below
 * threshold, and the convocation-rights MeetingRequest workflow (1/3 board
 * threshold + 10-day Chairman window; 5%/10% GA capital threshold +
 * 1-month board window) — including the initiator's own submitted agenda,
 * carried on the request and materialized into the review queue once the
 * meeting exists. Also the Secretary's agenda-preparation tool: board/
 * committee members propose items (agenda:propose), each auto-reviewed
 * against the entity's governing documents and applicable regulatory rules
 * (see agenda/review.ts), landing in a PROPOSED queue the Secretary/
 * Chairman confirms or rejects into the final CONFIRMED agenda — plus the
 * meeting "pack" bundling that confirmed agenda, its supporting documents,
 * quorum, and roster (the pull-based equivalent of "sent with the
 * invitations": this build has no push/email infrastructure). Also
 * off-agenda-item blocking: once the Secretary/Chairman locks the agenda,
 * the ordinary set/propose endpoints refuse new items, and only the
 * Chairman's mid-meeting flag or a confirmed 100%-unanimous addition
 * (every currently-attending capacity affirmatively confirming) can add one
 * — see the /agenda/lock and /agenda-items/unanimous-addition* endpoints.
 * Also GA meeting roles: the Chairman appoints a secretary and exactly two
 * vote counters for an OGM/EGM (PUT .../ga-roles). Also proxy grant/revoke
 * (POST/DELETE .../proxies): eligibility depends on the entity's legal form
 * (Entity.legalForm) — JSC allows any grantee, LLC only another
 * quota-holder — and a non-board grantor can't appoint a sitting board
 * member. Granting one marks the grantor's own attendance PROXY immediately
 * so the existing quorum/capital calculation picks up their shares with no
 * change to quorum.ts; actually casting a vote on the grantor's behalf is
 * resolutions/voting.ts's castVote with onBehalfOfCapacityId. Voting itself
 * lives in resolutions/voting.ts, since a vote is cast against a
 * Resolution, not a Meeting.
 * NOT built yet: virtual-attendance recording-retention enforcement,
 * actually notifying GAFI/the regulator on escalation (out-of-platform act
 * — this records that the window lapsed, nothing more), and hard-enforcing
 * the entity's auditor's mandatory GA attendance (the AUDITOR role and its
 * OGM convocation right exist — see meetings/requests.ts — but nothing yet
 * blocks a GA meeting from proceeding without the auditor present).
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

const gaRolesSchema = z.object({
  secretaryCapacityId: z.string(),
  voteCounterCapacityIds: z.array(z.string()).length(2, "exactly two vote counters are required (spec section 6)"),
});

const grantProxySchema = z.object({
  granteeCapacityId: z.string(),
  expiresAt: z.string().datetime().optional(),
});

const addAgendaItemSchema = z.object({
  order: z.number().int().nonnegative(),
  title: z.string().min(1),
  description: z.string().optional(),
  // Spec section 5: once the agenda is locked, the Chairman alone may still
  // add a serious issue arising mid-meeting — flagged and logged separately
  // from the pre-set agenda. Only honored below if the caller actually
  // holds the CHAIRMAN capacity; anyone else setting this is ignored.
  chairmanOffAgendaFlag: z.boolean().default(false),
});

const proposeAgendaItemSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
});

const unanimousAdditionSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
});

const confirmAgendaItemSchema = z.object({
  order: z.number().int().nonnegative().optional(),
});

const rejectAgendaItemSchema = z.object({
  reason: z.string().min(1),
});

const meetingRequestSchema = z.object({
  type: z.enum(["BOARD", "OGM", "EGM"]),
  requestorCapacityIds: z.array(z.string()).min(1),
  // The initiator's own agenda, submitted alongside the request — see
  // MeetingRequest.proposedAgenda.
  proposedAgenda: z.array(z.object({ title: z.string().min(1), description: z.string().optional() })).optional(),
});

const rsvpSchema = z.object({
  capacityId: z.string(),
  mode: z.enum(["IN_PERSON", "VIRTUAL", "PROXY", "ABSENT"]),
});

export async function registerMeetingRoutes(app: FastifyInstance): Promise<void> {
  // Committee chairmanship isn't a capacity role — it's a per-committee
  // CommitteeMembership.isChair flag, independent of whatever board role
  // the chair otherwise holds (a NON_EXECUTIVE_BOARD_MEMBER who chairs the
  // Audit Committee is the common case, not someone whose base capacity
  // role is literally COMMITTEE_CHAIR). So the privileges matrix can only
  // gate the entity-wide full-scope roles here; requireEntityAccess just
  // proves entity standing, and the real scheduling authority — full scope
  // vs "chairs this specific committee" — is resolved against the request
  // body inside the handler.
  app.post("/entities/:entityId/meetings", { preHandler: [app.authenticate, requireEntityAccess()] }, async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const body = scheduleMeetingSchema.parse(request.body);

    const meeting = await withTenantContext(entityId, async (tx) => {
      const callerCapacity = await tx.capacity.findFirst({
        where: { userId: request.user.sub, entityId, active: true, verificationStatus: "APPROVED" },
        select: { id: true, role: true },
      });
      const hasFullScope = callerCapacity
        ? grantsFor(callerCapacity.role as GovernanceRole, "meeting:schedule").some((g) => g.scope === "full")
        : false;

      if (!hasFullScope) {
        if (body.type !== "COMMITTEE" || !body.committeeId || !callerCapacity) {
          throw Object.assign(new Error("role does not grant 'meeting:schedule' at this entity"), { statusCode: 403 });
        }
        const chairs = await tx.committeeMembership.findFirst({
          where: { committeeId: body.committeeId, capacityId: callerCapacity.id, isChair: true, endDate: null },
        });
        if (!chairs) {
          throw Object.assign(new Error("you are not the chair of this committee"), { statusCode: 403 });
        }
      }

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

  // GA meeting roles (spec section 6): every OGM/EGM requires a secretary
  // and exactly two vote counters, appointed by the meeting chairman — a
  // narrow, specific right, so checked directly against the CHAIRMAN
  // capacity rather than the general agenda:set/meeting:schedule grants
  // (a Vice Chairman or Secretary running the meeting doesn't get this one).
  app.put(
    "/entities/:entityId/meetings/:meetingId/ga-roles",
    { preHandler: [app.authenticate, requireEntityAccess()] },
    async (request, reply) => {
      const { entityId, meetingId } = request.params as { entityId: string; meetingId: string };
      const body = gaRolesSchema.parse(request.body);
      if (body.voteCounterCapacityIds[0] === body.voteCounterCapacityIds[1]) {
        return reply.code(400).send({ error: "the two vote counters must be different capacities" });
      }

      const meeting = await withTenantContext(entityId, async (tx) => {
        const current = await tx.meeting.findUniqueOrThrow({ where: { id: meetingId } });
        if (current.type !== "OGM" && current.type !== "EGM") {
          throw Object.assign(new Error("GA roles only apply to OGM/EGM meetings"), { statusCode: 400 });
        }
        const callerCapacity = await tx.capacity.findFirst({
          where: { userId: request.user.sub, entityId, active: true, verificationStatus: "APPROVED", role: "CHAIRMAN" },
        });
        if (!callerCapacity) {
          throw Object.assign(new Error("only the Chairman appoints GA meeting roles"), { statusCode: 403 });
        }
        const referencedIds = [body.secretaryCapacityId, ...body.voteCounterCapacityIds];
        const referencedCount = await tx.capacity.count({ where: { id: { in: referencedIds }, entityId } });
        if (referencedCount !== referencedIds.length) {
          throw Object.assign(new Error("secretary/vote-counter capacities must belong to this entity"), { statusCode: 400 });
        }

        const updated = await tx.meeting.update({
          where: { id: meetingId },
          data: { gaSecretaryCapacityId: body.secretaryCapacityId, gaVoteCounterCapacityIds: body.voteCounterCapacityIds },
        });
        await appendAuditLog(tx, {
          entityId,
          actorUserId: request.user.sub,
          action: "GA_MEETING_ROLES_APPOINTED",
          tableName: "Meeting",
          recordId: meetingId,
          afterData: body,
        });
        return updated;
      });

      return reply.send(meeting);
    },
  );

  // Proxy grant (spec section 6): a GA member appoints someone to attend
  // and vote in their place at a specific OGM/EGM. Eligibility depends on
  // the entity's legal form — JSC allows any grantee (shareholder or not,
  // since the 2018 amendment); LLC quota-holders may only appoint another
  // quota-holder. Either way, a grantor who doesn't themselves sit on the
  // board may not appoint a sitting board member as their proxy. Marks the
  // grantor's own attendance PROXY immediately so the existing
  // quorum/capital calculation (which already treats PROXY as present)
  // picks up their shares without any change to quorum.ts.
  app.post(
    "/entities/:entityId/meetings/:meetingId/proxies",
    { preHandler: [app.authenticate, requireCapability("proxy:grant_revoke")] },
    async (request, reply) => {
      const { entityId, meetingId } = request.params as { entityId: string; meetingId: string };
      const body = grantProxySchema.parse(request.body);

      const proxy = await withTenantContext(entityId, async (tx) => {
        const [meeting, entity] = await Promise.all([
          tx.meeting.findUniqueOrThrow({ where: { id: meetingId } }),
          tx.entity.findUniqueOrThrow({ where: { id: entityId } }),
        ]);
        if (meeting.type !== "OGM" && meeting.type !== "EGM") {
          throw Object.assign(new Error("proxies only apply to OGM/EGM meetings"), { statusCode: 400 });
        }

        const grantorCapacity = await tx.capacity.findFirst({
          where: { userId: request.user.sub, entityId, role: "GA_MEMBER", active: true, verificationStatus: "APPROVED" },
        });
        if (!grantorCapacity) {
          throw Object.assign(new Error("you must hold an active GA member capacity to grant a proxy"), { statusCode: 403 });
        }
        const granteeCapacity = await tx.capacity.findFirst({
          where: { id: body.granteeCapacityId, entityId, active: true, verificationStatus: "APPROVED" },
        });
        if (!granteeCapacity) {
          throw Object.assign(new Error("grantee capacity not found (or not active) at this entity"), { statusCode: 400 });
        }
        if (granteeCapacity.id === grantorCapacity.id) {
          throw Object.assign(new Error("cannot appoint yourself as your own proxy"), { statusCode: 400 });
        }
        if (entity.legalForm === "LLC" && granteeCapacity.role !== "GA_MEMBER") {
          throw Object.assign(new Error("LLC quota-holders may only appoint another quota-holder as proxy — no third-party proxies"), { statusCode: 403 });
        }
        if (BOARD_ROLES.includes(granteeCapacity.role)) {
          const grantorAlsoOnBoard = await tx.capacity.findFirst({
            where: { userId: request.user.sub, entityId, role: { in: [...BOARD_ROLES] }, active: true, verificationStatus: "APPROVED" },
          });
          if (!grantorAlsoOnBoard) {
            throw Object.assign(
              new Error("a shareholder who does not sit on the board may not appoint a sitting board member as their proxy"),
              { statusCode: 403 },
            );
          }
        }

        const created = await tx.proxy.create({
          data: {
            meetingId,
            grantorCapacityId: grantorCapacity.id,
            granteeCapacityId: granteeCapacity.id,
            expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          },
        });
        await tx.meetingAttendance.upsert({
          where: { meetingId_capacityId: { meetingId, capacityId: grantorCapacity.id } },
          create: { meetingId, capacityId: grantorCapacity.id, mode: "PROXY", checkedInAt: new Date() },
          update: { mode: "PROXY", checkedInAt: new Date() },
        });
        await appendAuditLog(tx, {
          entityId,
          actorUserId: request.user.sub,
          action: "PROXY_GRANTED",
          tableName: "Proxy",
          recordId: created.id,
          afterData: { grantorCapacityId: grantorCapacity.id, granteeCapacityId: granteeCapacity.id },
        });
        return created;
      });

      return reply.code(201).send(proxy);
    },
  );

  // Revoke: only the grantor, and only before it's been voted against.
  app.delete(
    "/entities/:entityId/meetings/:meetingId/proxies/:proxyId",
    { preHandler: [app.authenticate, requireCapability("proxy:grant_revoke")] },
    async (request, reply) => {
      const { entityId, proxyId } = request.params as { entityId: string; meetingId: string; proxyId: string };

      await withTenantContext(entityId, async (tx) => {
        const proxy = await tx.proxy.findUniqueOrThrow({ where: { id: proxyId }, include: { grantorCapacity: true, votes: true } });
        if (proxy.grantorCapacity.userId !== request.user.sub) {
          throw Object.assign(new Error("only the grantor can revoke their own proxy"), { statusCode: 403 });
        }
        if (proxy.votes.length > 0) {
          throw Object.assign(new Error("cannot revoke a proxy that has already been voted against"), { statusCode: 409 });
        }
        await tx.proxy.delete({ where: { id: proxyId } });
        await appendAuditLog(tx, { entityId, actorUserId: request.user.sub, action: "PROXY_REVOKED", tableName: "Proxy", recordId: proxyId });
      });

      return reply.code(204).send();
    },
  );

  // Set directly by the Secretary/Chairman/VC/MD — already final, so it's
  // CONFIRMED and self-reviewed immediately, unlike a board member's
  // agenda:propose submission below.
  app.post(
    "/entities/:entityId/meetings/:meetingId/agenda-items",
    { preHandler: [app.authenticate, requireCapability("agenda:set")] },
    async (request, reply) => {
      const { entityId, meetingId } = request.params as { entityId: string; meetingId: string };
      const body = addAgendaItemSchema.parse(request.body);

      const item = await withTenantContext(entityId, async (tx) => {
        const meeting = await tx.meeting.findUniqueOrThrow({ where: { id: meetingId } });

        // Off-agenda blocking (spec section 5): once locked, nothing new
        // lands on the agenda except the Chairman's own mid-meeting flag.
        let isOffAgendaAddition = false;
        if (meeting.agendaLockedAt) {
          const callerCapacity = await tx.capacity.findFirst({
            where: { userId: request.user.sub, entityId, active: true, verificationStatus: "APPROVED" },
            select: { role: true },
          });
          if (!body.chairmanOffAgendaFlag || callerCapacity?.role !== "CHAIRMAN") {
            throw Object.assign(
              new Error("the agenda is locked — only the Chairman may add an item now (flagged separately), or use the unanimous-addition path"),
              { statusCode: 409 },
            );
          }
          isOffAgendaAddition = true;
        }

        const complianceFlags = await reviewAgendaItem(tx, entityId, body.title, body.description);
        const created = await tx.agendaItem.create({
          data: {
            meetingId,
            order: body.order,
            title: body.title,
            description: body.description,
            isOffAgendaAddition,
            status: "CONFIRMED",
            reviewedByUserId: request.user.sub,
            reviewedAt: new Date(),
            complianceFlags: complianceFlags as unknown as Prisma.InputJsonValue,
            complianceReviewedAt: new Date(),
          },
        });
        await appendAuditLog(tx, {
          entityId,
          actorUserId: request.user.sub,
          action: isOffAgendaAddition ? "AGENDA_ITEM_CHAIRMAN_FLAGGED_OFF_AGENDA" : "AGENDA_ITEM_ADDED",
          tableName: "AgendaItem",
          recordId: created.id,
          afterData: { ...body, flagCount: complianceFlags.length },
        });
        return created;
      });

      return reply.code(201).send(item);
    },
  );

  // Secretary's agenda-preparation tool, part 1: any board/committee member
  // holding agenda:propose can submit an item for the Secretary/Chairman to
  // review — it lands PROPOSED, not on the agenda yet. Order is assigned
  // provisionally (appended to the end); confirm can reorder.
  app.post(
    "/entities/:entityId/meetings/:meetingId/agenda-items/propose",
    { preHandler: [app.authenticate, requireCapability("agenda:propose")] },
    async (request, reply) => {
      const { entityId, meetingId } = request.params as { entityId: string; meetingId: string };
      const body = proposeAgendaItemSchema.parse(request.body);

      const item = await withTenantContext(entityId, async (tx) => {
        const meeting = await tx.meeting.findUniqueOrThrow({ where: { id: meetingId } });
        if (meeting.agendaLockedAt) {
          throw Object.assign(
            new Error("the agenda is locked — pre-meeting proposals are closed; use the Chairman's off-agenda flag or the unanimous-addition path instead"),
            { statusCode: 409 },
          );
        }
        const proposerCapacity = await tx.capacity.findFirst({
          where: { userId: request.user.sub, entityId, active: true, verificationStatus: "APPROVED" },
          select: { id: true },
        });
        const maxOrder = await tx.agendaItem.aggregate({ where: { meetingId }, _max: { order: true } });
        const complianceFlags = await reviewAgendaItem(tx, entityId, body.title, body.description);

        const created = await tx.agendaItem.create({
          data: {
            meetingId,
            order: (maxOrder._max.order ?? -1) + 1,
            title: body.title,
            description: body.description,
            status: "PROPOSED",
            proposedByCapacityId: proposerCapacity?.id,
            complianceFlags: complianceFlags as unknown as Prisma.InputJsonValue,
            complianceReviewedAt: new Date(),
          },
        });
        await appendAuditLog(tx, {
          entityId,
          actorUserId: request.user.sub,
          action: "AGENDA_ITEM_PROPOSED",
          tableName: "AgendaItem",
          recordId: created.id,
          afterData: { title: body.title, flagCount: complianceFlags.length },
        });
        return created;
      });

      return reply.code(201).send(item);
    },
  );

  // Secretary's agenda-preparation tool, part 2: the review queue — every
  // PROPOSED item (from agenda:propose or materialized from a
  // MeetingRequest's initiator agenda), with its compliance flags, for the
  // Secretary/Chairman to confirm or reject before the meeting.
  app.get(
    "/entities/:entityId/meetings/:meetingId/agenda-items/pending-review",
    { preHandler: [app.authenticate, requireCapability("agenda:set")] },
    async (request, reply) => {
      const { entityId, meetingId } = request.params as { entityId: string; meetingId: string };
      const items = await withTenantContext(entityId, (tx) =>
        tx.agendaItem.findMany({
          where: { meetingId, status: "PROPOSED" },
          include: { proposedByCapacity: { include: { user: { select: { fullName: true } } } } },
          orderBy: { createdAt: "asc" },
        }),
      );
      return reply.send(items);
    },
  );

  app.post(
    "/entities/:entityId/meetings/:meetingId/agenda-items/:itemId/confirm",
    { preHandler: [app.authenticate, requireCapability("agenda:set")] },
    async (request, reply) => {
      const { entityId, itemId } = request.params as { entityId: string; itemId: string };
      const body = confirmAgendaItemSchema.parse(request.body);

      const item = await withTenantContext(entityId, async (tx) => {
        const updated = await tx.agendaItem.update({
          where: { id: itemId },
          data: { status: "CONFIRMED", order: body.order, reviewedByUserId: request.user.sub, reviewedAt: new Date() },
        });
        await appendAuditLog(tx, { entityId, actorUserId: request.user.sub, action: "AGENDA_ITEM_CONFIRMED", tableName: "AgendaItem", recordId: itemId });

        // Hiring-sourced items (see hiring/routes.ts) carry the intended
        // appointment effect so confirming them actually starts the formal
        // appointment process — a DRAFT resolution ready for the board to
        // vote on — instead of just landing on the agenda with nothing to
        // vote against.
        if (updated.suggestedResolutionEffect) {
          const effect = updated.suggestedResolutionEffect as unknown as ResolutionEffectPayload;
          if (effect.type === "INITIAL_STRUCTURE") {
            throw Object.assign(new Error("a hiring-sourced agenda item cannot carry an INITIAL_STRUCTURE effect"), { statusCode: 500 });
          }
          await createResolution(tx, {
            entityId,
            agendaItemId: itemId,
            type: effect.type,
            title: updated.title,
            description: updated.description ?? updated.title,
            requiredMajority: requiredMajorityForType(effect.type),
            proposedEffect: effect,
            actorUserId: request.user.sub,
          });
        }

        return updated;
      });

      return reply.send(item);
    },
  );

  app.post(
    "/entities/:entityId/meetings/:meetingId/agenda-items/:itemId/reject",
    { preHandler: [app.authenticate, requireCapability("agenda:set")] },
    async (request, reply) => {
      const { entityId, itemId } = request.params as { entityId: string; itemId: string };
      const body = rejectAgendaItemSchema.parse(request.body);

      const item = await withTenantContext(entityId, async (tx) => {
        const updated = await tx.agendaItem.update({
          where: { id: itemId },
          data: { status: "REJECTED", rejectionReason: body.reason, reviewedByUserId: request.user.sub, reviewedAt: new Date() },
        });
        await appendAuditLog(tx, {
          entityId,
          actorUserId: request.user.sub,
          action: "AGENDA_ITEM_REJECTED",
          tableName: "AgendaItem",
          recordId: itemId,
          afterData: { reason: body.reason },
        });
        return updated;
      });

      return reply.send(item);
    },
  );

  // Publishes/finalizes the agenda ahead of the meeting — standing in for
  // "sent out with the invitations." Once locked, no new item may be added
  // except the Chairman's mid-meeting flag or a confirmed unanimous
  // addition (spec section 5).
  app.post(
    "/entities/:entityId/meetings/:meetingId/agenda/lock",
    { preHandler: [app.authenticate, requireCapability("agenda:set")] },
    async (request, reply) => {
      const { entityId, meetingId } = request.params as { entityId: string; meetingId: string };
      const meeting = await withTenantContext(entityId, async (tx) => {
        const current = await tx.meeting.findUniqueOrThrow({ where: { id: meetingId } });
        if (current.agendaLockedAt) {
          throw Object.assign(new Error("agenda is already locked"), { statusCode: 409 });
        }
        const updated = await tx.meeting.update({ where: { id: meetingId }, data: { agendaLockedAt: new Date() } });
        await appendAuditLog(tx, { entityId, actorUserId: request.user.sub, action: "AGENDA_LOCKED", tableName: "Meeting", recordId: meetingId });
        return updated;
      });
      return reply.send(meeting);
    },
  );

  // Live-meeting override, part 1: raises a matter for unanimous addition —
  // it does NOT land on the operative agenda yet (status PROPOSED) until
  // every currently-attending eligible capacity affirmatively confirms it
  // below. Only usable once the agenda is locked — before that, the
  // ordinary propose/set endpoints are the right path.
  app.post(
    "/entities/:entityId/meetings/:meetingId/agenda-items/unanimous-addition",
    { preHandler: [app.authenticate, requireCapability("agenda:set")] },
    async (request, reply) => {
      const { entityId, meetingId } = request.params as { entityId: string; meetingId: string };
      const body = unanimousAdditionSchema.parse(request.body);

      const item = await withTenantContext(entityId, async (tx) => {
        const meeting = await tx.meeting.findUniqueOrThrow({ where: { id: meetingId } });
        if (!meeting.agendaLockedAt) {
          throw Object.assign(new Error("agenda isn't locked yet — use the ordinary propose/set endpoints instead"), { statusCode: 409 });
        }
        const maxOrder = await tx.agendaItem.aggregate({ where: { meetingId }, _max: { order: true } });
        const complianceFlags = await reviewAgendaItem(tx, entityId, body.title, body.description);
        const created = await tx.agendaItem.create({
          data: {
            meetingId,
            order: (maxOrder._max.order ?? -1) + 1,
            title: body.title,
            description: body.description,
            status: "PROPOSED",
            isOffAgendaAddition: true,
            complianceFlags: complianceFlags as unknown as Prisma.InputJsonValue,
            complianceReviewedAt: new Date(),
          },
        });
        await appendAuditLog(tx, {
          entityId,
          actorUserId: request.user.sub,
          action: "UNANIMOUS_ADDITION_PROPOSED",
          tableName: "AgendaItem",
          recordId: created.id,
          afterData: { title: body.title },
        });
        return created;
      });

      return reply.code(201).send(item);
    },
  );

  // Live-meeting override, part 2: one attending capacity's affirmative
  // confirmation. The item becomes part of the real agenda (CONFIRMED) the
  // instant every capacity currently marked present (any non-ABSENT mode)
  // has confirmed — a genuine 100%-unanimous requirement, not a majority.
  app.post(
    "/entities/:entityId/meetings/:meetingId/agenda-items/:itemId/unanimous-addition/confirm",
    { preHandler: [app.authenticate, requireEntityAccess()] },
    async (request, reply) => {
      const { entityId, meetingId, itemId } = request.params as { entityId: string; meetingId: string; itemId: string };

      const result = await withTenantContext(entityId, async (tx) => {
        const item = await tx.agendaItem.findUniqueOrThrow({ where: { id: itemId } });
        if (item.meetingId !== meetingId) {
          throw Object.assign(new Error("agenda item does not belong to this meeting"), { statusCode: 400 });
        }
        if (!item.isOffAgendaAddition || item.status !== "PROPOSED") {
          throw Object.assign(new Error("this item isn't an open unanimous-addition proposal"), { statusCode: 409 });
        }

        const callerCapacity = await tx.capacity.findFirst({
          where: { userId: request.user.sub, entityId, active: true, verificationStatus: "APPROVED" },
          select: { id: true },
        });
        const attendance = await tx.meetingAttendance.findMany({ where: { meetingId }, select: { capacityId: true, mode: true } });
        const attendingCapacityIds = new Set(attendance.filter((a) => a.mode !== "ABSENT").map((a) => a.capacityId));
        if (!callerCapacity || !attendingCapacityIds.has(callerCapacity.id)) {
          throw Object.assign(new Error("only a capacity currently marked as attending this meeting can confirm"), { statusCode: 403 });
        }

        const confirmedIds = new Set(item.unanimousConfirmedByCapacityIds);
        confirmedIds.add(callerCapacity.id);
        const isUnanimous = [...attendingCapacityIds].every((id) => confirmedIds.has(id));

        const updated = await tx.agendaItem.update({
          where: { id: itemId },
          data: {
            unanimousConfirmedByCapacityIds: [...confirmedIds],
            ...(isUnanimous ? { status: "CONFIRMED", unanimousAdditionConfirmed: true, reviewedByUserId: request.user.sub, reviewedAt: new Date() } : {}),
          },
        });
        await appendAuditLog(tx, {
          entityId,
          actorUserId: request.user.sub,
          action: isUnanimous ? "UNANIMOUS_ADDITION_CONFIRMED" : "UNANIMOUS_ADDITION_PARTIALLY_CONFIRMED",
          tableName: "AgendaItem",
          recordId: itemId,
          afterData: { confirmedCount: confirmedIds.size, attendingCount: attendingCapacityIds.size, isUnanimous },
        });
        return updated;
      });

      return reply.send(result);
    },
  );

  // Re-runs the compliance review on demand — e.g. after a new
  // GoverningDocument is added, or a RegulatoryRule changes. Read-mostly
  // (only refreshes the cached flag list), so any entity member can trigger it.
  app.post(
    "/entities/:entityId/meetings/:meetingId/agenda-items/:itemId/review",
    { preHandler: [app.authenticate, requireEntityAccess()] },
    async (request, reply) => {
      const { entityId, itemId } = request.params as { entityId: string; itemId: string };
      const result = await withTenantContext(entityId, async (tx) => {
        const item = await tx.agendaItem.findUniqueOrThrow({ where: { id: itemId } });
        const complianceFlags = await reviewAgendaItem(tx, entityId, item.title, item.description);
        return tx.agendaItem.update({
          where: { id: itemId },
          data: { complianceFlags: complianceFlags as unknown as Prisma.InputJsonValue, complianceReviewedAt: new Date() },
        });
      });
      return reply.send(result);
    },
  );

  app.get("/entities/:entityId/meetings/:meetingId/agenda-items", { preHandler: [app.authenticate, requireEntityAccess()] }, async (request, reply) => {
    const { entityId, meetingId } = request.params as { entityId: string; meetingId: string };
    const items = await withTenantContext(entityId, (tx) => tx.agendaItem.findMany({ where: { meetingId }, orderBy: { order: "asc" } }));
    return reply.send(items);
  });

  // The "sent out with the invitations" bundle — everything an invited
  // member needs before the meeting: the finalized (CONFIRMED) agenda with
  // its compliance flags and attached supporting documents, plus live
  // quorum status and the attendance roster. Pull-based, not pushed (this
  // build has no email/push infrastructure — see compliance/routes.ts for
  // the same limitation elsewhere): a member fetches this once notified
  // out-of-band that the meeting was scheduled.
  app.get("/entities/:entityId/meetings/:meetingId/pack", { preHandler: [app.authenticate, requireEntityAccess()] }, async (request, reply) => {
    const { entityId, meetingId } = request.params as { entityId: string; meetingId: string };

    const pack = await withTenantContext(entityId, async (tx) => {
      const [meeting, agendaItems, quorum, attendance] = await Promise.all([
        tx.meeting.findUniqueOrThrow({ where: { id: meetingId } }),
        tx.agendaItem.findMany({
          where: { meetingId, status: "CONFIRMED" },
          include: { documents: true },
          orderBy: { order: "asc" },
        }),
        computeMeetingQuorum(tx, entityId, meetingId),
        tx.meetingAttendance.findMany({ where: { meetingId }, include: { capacity: { include: { user: { select: { fullName: true } } } } } }),
      ]);
      return { meeting, agendaItems, quorum, attendance };
    });

    return reply.send(pack);
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
    const body = meetingRequestSchema.parse(request.body);

    try {
      const result = await withTenantContext(entityId, async (tx) => {
        const requiredAction = body.type === "BOARD" ? "meeting:request_board" : "meeting:request_ga";
        const callerCapacity = await tx.capacity.findFirst({
          where: { userId: request.user.sub, entityId, active: true, verificationStatus: "APPROVED" },
          select: { role: true },
        });
        // The auditor's convocation right is OGM-only (Companies Law Art. 61
        // para. 3) and isn't in the coarse privilege matrix for that reason —
        // checked here directly instead of via `can()`.
        const isAuditorOgmRequest = body.type === "OGM" && callerCapacity?.role === "AUDITOR";
        if (!callerCapacity || (!can(callerCapacity.role as GovernanceRole, requiredAction) && !isAuditorOgmRequest)) {
          throw new MeetingRequestError(`role does not grant '${requiredAction}' at this entity`, 403);
        }
        return createMeetingRequest(tx, entityId, {
          type: body.type,
          requestorCapacityIds: body.requestorCapacityIds,
          actorUserId: request.user.sub,
          proposedAgenda: body.proposedAgenda,
        });
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
        const result = await withTenantContext(entityId, async (tx) => {
          const updatedRequest = await markMeetingRequestCalled(tx, requestId, request.user.sub, meetingId);

          // Materialize the initiator's submitted agenda (if any) into real
          // PROPOSED AgendaItem rows now that a Meeting exists — they land
          // in the same Secretary review queue as agenda:propose items.
          const proposedAgenda = (updatedRequest.proposedAgenda as { title: string; description?: string }[] | null) ?? [];
          if (proposedAgenda.length > 0) {
            const proposerCapacityId = updatedRequest.requestorCapacityIds[0] ?? null;
            const maxOrder = await tx.agendaItem.aggregate({ where: { meetingId }, _max: { order: true } });
            let nextOrder = (maxOrder._max.order ?? -1) + 1;
            for (const entry of proposedAgenda) {
              const complianceFlags = await reviewAgendaItem(tx, entityId, entry.title, entry.description);
              await tx.agendaItem.create({
                data: {
                  meetingId,
                  order: nextOrder++,
                  title: entry.title,
                  description: entry.description,
                  status: "PROPOSED",
                  proposedByCapacityId: proposerCapacityId,
                  meetingRequestId: requestId,
                  complianceFlags: complianceFlags as unknown as Prisma.InputJsonValue,
                  complianceReviewedAt: new Date(),
                },
              });
            }
          }

          return updatedRequest;
        });
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
