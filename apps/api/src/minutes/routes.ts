import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withTenantContext } from "../db.js";
import { requireCapability, requireRole } from "../auth/rbac.js";
import { appendAuditLog } from "../audit/auditLog.js";
import { generateMinutesContent } from "./generate.js";

/**
 * Board/GA minutes — spec section 6. Auto-generated from the meeting's own
 * record, dual-signed (Chairman + Secretary), then submitted to the FRA
 * (10 days) and, for OGM/EGM, GAFI (1 month, alongside the chairman's
 * Decree 270/2023 declaration — the declaration text itself isn't
 * generated here, just the submission timestamp that would accompany it).
 * The searchable directory (by date, discussion point, keyword) is the
 * GET /minutes endpoint below.
 */

const draftSchema = z.object({
  discussionNotes: z.array(z.object({ agendaItemId: z.string(), notes: z.string() })).default([]),
  keywords: z.array(z.string()).default([]),
});

export async function registerMinutesRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/entities/:entityId/meetings/:meetingId/minutes",
    { preHandler: [app.authenticate, requireRole("CORPORATE_SECRETARY", "CHAIRMAN")] },
    async (request, reply) => {
      const { entityId, meetingId } = request.params as { entityId: string; meetingId: string };
      const body = draftSchema.parse(request.body);

      const minutes = await withTenantContext(entityId, async (tx) => {
        const [entity, meeting, agendaItems, attendance] = await Promise.all([
          tx.entity.findUniqueOrThrow({ where: { id: entityId } }),
          tx.meeting.findUniqueOrThrow({ where: { id: meetingId } }),
          tx.agendaItem.findMany({
            where: { meetingId },
            orderBy: { order: "asc" },
            include: { resolutions: { include: { votes: { include: { voterCapacity: { include: { user: true } } } } } } },
          }),
          tx.meetingAttendance.findMany({ where: { meetingId }, include: { capacity: { include: { user: true } } } }),
        ]);

        const extraNotes = new Map(body.discussionNotes.map((n) => [n.agendaItemId, n.notes]));
        const generated = generateMinutesContent(entity.legalName, meeting, attendance, agendaItems, extraNotes);
        const keywords = Array.from(new Set([...generated.keywords, ...body.keywords]));

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
          },
        });

        await appendAuditLog(tx, {
          entityId,
          actorUserId: request.user.sub,
          action: "MINUTES_DRAFTED",
          tableName: "Minutes",
          recordId: created.id,
          afterData: { meetingId, keywords },
        });

        return created;
      });

      return reply.code(201).send(minutes);
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
