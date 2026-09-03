import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withTenantContext } from "../db.js";
import { requireCapability, requireEntityAccess, requireRole } from "../auth/rbac.js";
import { appendAuditLog } from "../audit/auditLog.js";
import { generateMinutesContent } from "./generate.js";
import { seedMinutesSubmissionObligations } from "../regulatory/obligations.js";

/**
 * Board/GA minutes — spec section 6. Auto-generated from the meeting's own
 * record (only its CONFIRMED agenda — a proposal never accepted onto the
 * agenda has no business in the official minutes), then circulated for
 * member verification, dual-signed (Chairman + Secretary) once nobody has
 * an open objection, and submitted to the FRA (10 days) and, for OGM/EGM,
 * GAFI (1 month, alongside the chairman's Decree 270/2023 declaration —
 * the declaration text itself isn't generated here, just the submission
 * timestamp that would accompany it). The searchable directory (by date,
 * discussion point, keyword) is the GET /minutes endpoint below.
 *
 * State machine: DRAFT --circulate--> CIRCULATED --verify(APPROVED)*--> (no
 * open CHANGES_REQUESTED) --sign x2--> FINAL --submit--> SUBMITTED_*.
 * Regenerating the draft after CIRCULATED (typically prompted by a
 * CHANGES_REQUESTED verification) is a revision: it resets to DRAFT and
 * clears prior signatures/verifications, since those attested to content
 * that no longer exists.
 */

const draftSchema = z.object({
  discussionNotes: z.array(z.object({ agendaItemId: z.string(), notes: z.string() })).default([]),
  keywords: z.array(z.string()).default([]),
});

const verifySchema = z.object({
  decision: z.enum(["APPROVED", "CHANGES_REQUESTED"]),
  comments: z.string().optional(),
});

export async function registerMinutesRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/entities/:entityId/meetings/:meetingId/minutes",
    { preHandler: [app.authenticate, requireRole("CORPORATE_SECRETARY", "CHAIRMAN")] },
    async (request, reply) => {
      const { entityId, meetingId } = request.params as { entityId: string; meetingId: string };
      const body = draftSchema.parse(request.body);

      const minutes = await withTenantContext(entityId, async (tx) => {
        const [entity, meeting, agendaItems, attendance, existing] = await Promise.all([
          tx.entity.findUniqueOrThrow({ where: { id: entityId } }),
          tx.meeting.findUniqueOrThrow({ where: { id: meetingId } }),
          // Only the finalized agenda was actually discussed — a still-PROPOSED
          // or REJECTED item never made it onto the agenda the meeting ran, so
          // it has no business in the official minutes.
          tx.agendaItem.findMany({
            where: { meetingId, status: "CONFIRMED" },
            orderBy: { order: "asc" },
            include: { resolutions: { include: { votes: { include: { voterCapacity: { include: { user: true } } } } } } },
          }),
          tx.meetingAttendance.findMany({ where: { meetingId }, include: { capacity: { include: { user: true } } } }),
          tx.minutes.findUnique({ where: { meetingId } }),
        ]);

        if (existing && ["FINAL", "SUBMITTED_FRA", "SUBMITTED_GAFI"].includes(existing.status)) {
          throw Object.assign(new Error("minutes are already finalized/submitted and can no longer be revised"), { statusCode: 409 });
        }

        const extraNotes = new Map(body.discussionNotes.map((n) => [n.agendaItemId, n.notes]));
        const generated = generateMinutesContent(entity.legalName, meeting, attendance, agendaItems, extraNotes);
        const keywords = Array.from(new Set([...generated.keywords, ...body.keywords]));

        // Regenerating past DRAFT is a revision — most often prompted by a
        // member's CHANGES_REQUESTED verification. It starts the
        // circulate → verify cycle over: back to DRAFT, prior signatures and
        // verifications (which attested to the now-superseded content) are
        // cleared rather than left dangling against a different draft.
        const isRevision = Boolean(existing) && existing!.status !== "DRAFT";
        if (isRevision) {
          await tx.minutesVerification.deleteMany({ where: { minutesId: existing!.id } });
        }

        const created = await tx.minutes.upsert({
          where: { meetingId },
          create: {
            meetingId,
            entityId,
            content: generated.content,
            discussionPoints: generated.discussionPoints,
            keywords,
            status: "DRAFT",
          },
          update: {
            content: generated.content,
            discussionPoints: generated.discussionPoints,
            keywords,
            ...(isRevision
              ? {
                  status: "DRAFT" as const,
                  circulatedAt: null,
                  chairmanSignedAt: null,
                  chairmanSignedByUserId: null,
                  secretarySignedAt: null,
                  secretarySignedByUserId: null,
                }
              : {}),
          },
        });

        await appendAuditLog(tx, {
          entityId,
          actorUserId: request.user.sub,
          action: isRevision ? "MINUTES_REVISED" : "MINUTES_DRAFTED",
          tableName: "Minutes",
          recordId: created.id,
          afterData: { meetingId, keywords },
        });

        return created;
      });

      return reply.code(201).send(minutes);
    },
  );

  // Secretary/Chairman shares the draft for member review — the gate
  // between DRAFT and signature. Only a circulated draft can later be
  // signed (see the sign handler below).
  app.post(
    "/entities/:entityId/minutes/:minutesId/circulate",
    { preHandler: [app.authenticate, requireCapability("minutes:sign")] },
    async (request, reply) => {
      const { entityId, minutesId } = request.params as { entityId: string; minutesId: string };
      const result = await withTenantContext(entityId, async (tx) => {
        const existing = await tx.minutes.findUniqueOrThrow({ where: { id: minutesId } });
        if (existing.status !== "DRAFT") {
          throw Object.assign(new Error(`minutes must be DRAFT to circulate (currently ${existing.status})`), { statusCode: 409 });
        }
        const updated = await tx.minutes.update({ where: { id: minutesId }, data: { status: "CIRCULATED", circulatedAt: new Date() } });
        await appendAuditLog(tx, { entityId, actorUserId: request.user.sub, action: "MINUTES_CIRCULATED", tableName: "Minutes", recordId: minutesId });
        return updated;
      });
      return reply.send(result);
    },
  );

  // Any attendee (present in person, virtually, or by proxy — not an
  // ABSENT roster entry) may verify a circulated draft. One row per
  // capacity per revision; re-submitting updates the same row.
  app.post(
    "/entities/:entityId/minutes/:minutesId/verify",
    { preHandler: [app.authenticate, requireEntityAccess()] },
    async (request, reply) => {
      const { entityId, minutesId } = request.params as { entityId: string; minutesId: string };
      const body = verifySchema.parse(request.body);

      const result = await withTenantContext(entityId, async (tx) => {
        const minutes = await tx.minutes.findUniqueOrThrow({ where: { id: minutesId } });
        if (minutes.status !== "CIRCULATED") {
          throw Object.assign(new Error(`minutes must be CIRCULATED to verify (currently ${minutes.status})`), { statusCode: 409 });
        }
        const attendance = await tx.meetingAttendance.findFirst({
          where: { meetingId: minutes.meetingId, mode: { not: "ABSENT" }, capacity: { userId: request.user.sub, active: true, verificationStatus: "APPROVED" } },
        });
        if (!attendance) {
          throw Object.assign(new Error("only an attendee of the meeting may verify its minutes"), { statusCode: 403 });
        }

        const verification = await tx.minutesVerification.upsert({
          where: { minutesId_capacityId: { minutesId, capacityId: attendance.capacityId } },
          create: { minutesId, capacityId: attendance.capacityId, decision: body.decision, comments: body.comments },
          update: { decision: body.decision, comments: body.comments },
        });
        await appendAuditLog(tx, {
          entityId,
          actorUserId: request.user.sub,
          action: "MINUTES_VERIFIED",
          tableName: "MinutesVerification",
          recordId: verification.id,
          afterData: { decision: body.decision },
        });
        return verification;
      });

      return reply.send(result);
    },
  );

  // Who's verified, who hasn't, and whether signing is currently unblocked
  // — the roster is every attendee who wasn't ABSENT, cross-referenced
  // against submitted verifications for the current revision.
  app.get(
    "/entities/:entityId/minutes/:minutesId/verification-status",
    { preHandler: [app.authenticate, requireEntityAccess()] },
    async (request, reply) => {
      const { entityId, minutesId } = request.params as { entityId: string; minutesId: string };
      const result = await withTenantContext(entityId, async (tx) => {
        const minutes = await tx.minutes.findUniqueOrThrow({ where: { id: minutesId } });
        const [attendance, verifications] = await Promise.all([
          tx.meetingAttendance.findMany({
            where: { meetingId: minutes.meetingId, mode: { not: "ABSENT" } },
            include: { capacity: { include: { user: { select: { fullName: true } } } } },
          }),
          tx.minutesVerification.findMany({ where: { minutesId } }),
        ]);
        const byCapacity = new Map(verifications.map((v) => [v.capacityId, v]));
        const roster = attendance.map((a) => ({
          capacityId: a.capacityId,
          name: a.capacity.user.fullName,
          decision: byCapacity.get(a.capacityId)?.decision ?? ("PENDING" as const),
          comments: byCapacity.get(a.capacityId)?.comments ?? null,
        }));
        return {
          status: minutes.status,
          roster,
          hasOpenChangeRequests: roster.some((r) => r.decision === "CHANGES_REQUESTED"),
          allResponded: roster.every((r) => r.decision !== "PENDING"),
        };
      });
      return reply.send(result);
    },
  );

  app.post(
    "/entities/:entityId/minutes/:minutesId/sign",
    { preHandler: [app.authenticate, requireCapability("minutes:sign")] },
    async (request, reply) => {
      const { entityId, minutesId } = request.params as { entityId: string; minutesId: string };

      const result = await withTenantContext(entityId, async (tx) => {
        const signerCapacity = await tx.capacity.findFirst({
          where: { userId: request.user.sub, entityId, active: true, verificationStatus: "APPROVED", role: { in: ["CHAIRMAN", "CORPORATE_SECRETARY"] } },
        });
        if (!signerCapacity) {
          throw Object.assign(new Error("only the Chairman or Corporate Secretary sign minutes"), { statusCode: 403 });
        }

        const existing = await tx.minutes.findUniqueOrThrow({ where: { id: minutesId } });
        if (!existing.circulatedAt) {
          throw Object.assign(new Error("minutes must be circulated for member verification before signature"), { statusCode: 409 });
        }
        const openChangeRequest = await tx.minutesVerification.findFirst({ where: { minutesId, decision: "CHANGES_REQUESTED" } });
        if (openChangeRequest) {
          throw Object.assign(new Error("a member has requested changes — revise and recirculate before signing"), { statusCode: 409 });
        }

        const isChairman = signerCapacity.role === "CHAIRMAN";
        const updated = await tx.minutes.update({
          where: { id: minutesId },
          data: isChairman
            ? { chairmanSignedAt: new Date(), chairmanSignedByUserId: request.user.sub }
            : { secretarySignedAt: new Date(), secretarySignedByUserId: request.user.sub },
        });

        const bothSigned = Boolean(updated.chairmanSignedAt) && Boolean(updated.secretarySignedAt);
        const final = bothSigned
          ? await tx.minutes.update({ where: { id: minutesId }, data: { status: "FINAL" } })
          : await tx.minutes.update({ where: { id: minutesId }, data: { status: isChairman ? "CHAIRMAN_SIGNED" : "SECRETARY_SIGNED" } });

        // The FRA/GAFI submission clocks (Epic 6) start running the moment
        // minutes go FINAL, not before.
        if (bothSigned) {
          const meeting = await tx.meeting.findUniqueOrThrow({ where: { id: existing.meetingId }, select: { type: true } });
          await seedMinutesSubmissionObligations(tx, entityId, meeting.type, new Date());
        }

        await appendAuditLog(tx, {
          entityId,
          actorUserId: request.user.sub,
          action: "MINUTES_SIGNED",
          tableName: "Minutes",
          recordId: minutesId,
          beforeData: { status: existing.status },
          afterData: { status: final.status, signedAs: signerCapacity.role },
        });

        return final;
      });

      return reply.send(result);
    },
  );

  app.post(
    "/entities/:entityId/minutes/:minutesId/submit-fra",
    { preHandler: [app.authenticate, requireRole("COMPLIANCE_OFFICER")] },
    async (request, reply) => {
      const { entityId, minutesId } = request.params as { entityId: string; minutesId: string };
      const result = await withTenantContext(entityId, async (tx) => {
        const existing = await tx.minutes.findUniqueOrThrow({ where: { id: minutesId } });
        if (!["FINAL", "SUBMITTED_FRA", "SUBMITTED_GAFI"].includes(existing.status) && !existing.chairmanSignedAt) {
          throw Object.assign(new Error("minutes must be dual-signed (FINAL) before FRA submission"), { statusCode: 409 });
        }
        const updated = await tx.minutes.update({
          where: { id: minutesId },
          data: { submittedToFraAt: new Date(), status: existing.submittedToGafiAt ? "SUBMITTED_GAFI" : "SUBMITTED_FRA" },
        });
        await appendAuditLog(tx, { entityId, actorUserId: request.user.sub, action: "MINUTES_SUBMITTED_FRA", tableName: "Minutes", recordId: minutesId });
        return updated;
      });
      return reply.send(result);
    },
  );

  app.post(
    "/entities/:entityId/minutes/:minutesId/submit-gafi",
    { preHandler: [app.authenticate, requireRole("COMPLIANCE_OFFICER")] },
    async (request, reply) => {
      const { entityId, minutesId } = request.params as { entityId: string; minutesId: string };
      const result = await withTenantContext(entityId, async (tx) => {
        const existing = await tx.minutes.findUniqueOrThrow({ where: { id: minutesId }, include: { meeting: true } });
        if (existing.meeting.type !== "OGM" && existing.meeting.type !== "EGM") {
          throw Object.assign(new Error("GAFI ratification submission only applies to OGM/EGM minutes"), { statusCode: 400 });
        }
        if (existing.status !== "FINAL" && existing.status !== "SUBMITTED_FRA") {
          throw Object.assign(new Error("minutes must be dual-signed (FINAL) before GAFI submission"), { statusCode: 409 });
        }
        const updated = await tx.minutes.update({ where: { id: minutesId }, data: { submittedToGafiAt: new Date(), status: "SUBMITTED_GAFI" } });
        await appendAuditLog(tx, { entityId, actorUserId: request.user.sub, action: "MINUTES_SUBMITTED_GAFI", tableName: "Minutes", recordId: minutesId });
        return updated;
      });
      return reply.send(result);
    },
  );

  // Searchable directory — by date range, keyword, or free text across the
  // generated narrative (which embeds every agenda item's discussion notes).
  app.get(
    "/entities/:entityId/minutes",
    { preHandler: [app.authenticate, requireCapability("document:view_confidential_board")] },
    async (request, reply) => {
      const { entityId } = request.params as { entityId: string };
      const query = request.query as Record<string, string | undefined>;

      const where: Record<string, unknown> = { entityId };
      if (query.from || query.to) {
        where.meeting = {
          scheduledAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        };
      }
      if (query.keyword) {
        where.keywords = { has: query.keyword };
      }
      if (query.q) {
        where.content = { contains: query.q, mode: "insensitive" };
      }

      const minutes = await withTenantContext(entityId, (tx) =>
        tx.minutes.findMany({
          where,
          include: { meeting: { select: { type: true, scheduledAt: true, isVirtual: true } } },
          orderBy: { createdAt: "desc" },
        }),
      );
      return reply.send(minutes);
    },
  );

  app.get(
    "/entities/:entityId/minutes/:minutesId",
    { preHandler: [app.authenticate, requireCapability("document:view_confidential_board")] },
    async (request, reply) => {
      const { entityId, minutesId } = request.params as { entityId: string; minutesId: string };
      const minutes = await withTenantContext(entityId, (tx) => tx.minutes.findUniqueOrThrow({ where: { id: minutesId }, include: { meeting: true } }));
      return reply.send(minutes);
    },
  );
}
