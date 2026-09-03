import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withTenantContext, withoutTenantContext } from "../db.js";
import { requireEntityAccess, requirePlatformAdmin, requireRole } from "../auth/rbac.js";
import { appendAuditLog } from "../audit/auditLog.js";
import { syncOverdueObligations } from "./obligations.js";

/**
 * Epic 6 (Regulatory Calendar) + Epic 7 (Regulatory Change Monitoring).
 * Built here: the RegulatoryObligation/RegulatoryRule tables, listing, and
 * rule-version updates with citation tracking. Obligations are actually
 * seeded now (regulatory/obligations.ts, called from entity onboarding,
 * minutes finalization, and board/auditor appointment — see that file for
 * why each type is tied to the event it is), auto-regenerate their next
 * occurrence on completion (below), and get persisted OVERDUE with a
 * distinct audit-log entry the next time they're read past their deadline
 * (syncOverdueObligations) even without a scheduler.
 *
 * Epic 7's monitoring itself is deliberately manual, not an automated
 * scan (spec section 7: there's no GAFI/FRA feed or scraper integration in
 * this build, and none of this session's source documents specify one to
 * call) — a platform reviewer records a RegulatoryChangeNotice when they
 * learn of a circular/change, citing it like every other legal fact in this
 * codebase, and every entity's Compliance Officer/Corporate Secretary must
 * explicitly acknowledge having reviewed it (RegulatoryChangeAcknowledgment,
 * one per entity per notice) — the monitoring record is that a human
 * reviewed and dealt with the change, not that the platform detected it.
 * NOT built yet: escalating 30/14/3-day PUSH reminders (there's no
 * email/SMS infrastructure — see compliance/routes.ts) and any automated
 * scan/feed — both need real external infrastructure this session has no
 * credentials for.
 */

export async function registerRegulatoryRoutes(app: FastifyInstance): Promise<void> {
  app.get("/entities/:entityId/regulatory-obligations", { preHandler: [app.authenticate, requireEntityAccess()] }, async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const obligations = await withTenantContext(entityId, async (tx) => {
      await syncOverdueObligations(tx, entityId);
      return tx.regulatoryObligation.findMany({ where: { entityId }, orderBy: { nextDueAt: "asc" } });
    });
    return reply.send(obligations);
  });

  const markCompleteSchema = z.object({ completedAt: z.string().datetime().optional() });

  // Epic 6 AC: every recurring obligation auto-regenerates its next
  // occurrence once the current one is completed.
  app.post(
    "/entities/:entityId/regulatory-obligations/:obligationId/complete",
    { preHandler: [app.authenticate, requireRole("COMPLIANCE_OFFICER", "CORPORATE_SECRETARY")] },
    async (request, reply) => {
      const { entityId, obligationId } = request.params as { entityId: string; obligationId: string };
      const body = markCompleteSchema.parse(request.body);
      const completedAt = body.completedAt ? new Date(body.completedAt) : new Date();

      const updated = await withTenantContext(entityId, async (tx) => {
        const obligation = await tx.regulatoryObligation.findUniqueOrThrow({ where: { id: obligationId } });
        const nextDueAt = obligation.frequencyDays
          ? new Date(completedAt.getTime() + obligation.frequencyDays * 24 * 60 * 60 * 1000)
          : obligation.nextDueAt;

        const result = await tx.regulatoryObligation.update({
          where: { id: obligationId },
          data: { lastCompletedAt: completedAt, nextDueAt, status: "PENDING" },
        });
        await appendAuditLog(tx, {
          entityId,
          actorUserId: request.user.sub,
          action: "REGULATORY_OBLIGATION_COMPLETED",
          tableName: "RegulatoryObligation",
          recordId: obligationId,
          afterData: { completedAt, nextDueAt },
        });
        return result;
      });

      return reply.send(updated);
    },
  );

  // RegulatoryRule is platform-wide (not entity-scoped) — every configurable
  // legal rule stored with citation/source, versioned (spec section 8).
  app.get("/regulatory-rules", { preHandler: app.authenticate }, async (_request, reply) => {
    const rules = await withoutTenantContext((tx) => tx.regulatoryRule.findMany({ orderBy: { ruleKey: "asc" } }));
    return reply.send(rules);
  });

  const updateRuleSchema = z.object({
    currentValue: z.unknown(),
    legalCitation: z.string().min(1),
    sourceDocument: z.string().optional(),
  });

  // Epic 7: a confirmed change updates the rule centrally, versioned — never
  // an automated scan writing this directly (human legal review gates it,
  // enforced here by requirePlatformAdmin standing in for "reviewer role").
  app.put("/regulatory-rules/:ruleKey", { preHandler: [app.authenticate, requirePlatformAdmin] }, async (request, reply) => {
    const { ruleKey } = request.params as { ruleKey: string };
    const body = updateRuleSchema.parse(request.body);

    const updated = await withoutTenantContext(async (tx) => {
      const existing = await tx.regulatoryRule.findUnique({ where: { ruleKey } });
      const result = await tx.regulatoryRule.upsert({
        where: { ruleKey },
        create: {
          ruleKey,
          description: ruleKey,
          currentValue: body.currentValue as never,
          legalCitation: body.legalCitation,
          sourceDocument: body.sourceDocument,
          reviewedByUserId: request.user.sub,
        },
        update: {
          currentValue: body.currentValue as never,
          legalCitation: body.legalCitation,
          sourceDocument: body.sourceDocument,
          version: { increment: 1 },
          reviewedByUserId: request.user.sub,
        },
      });
      await appendAuditLog(tx, {
        entityId: null,
        actorUserId: request.user.sub,
        action: "REGULATORY_RULE_UPDATED",
        tableName: "RegulatoryRule",
        recordId: result.id,
        beforeData: existing ?? undefined,
        afterData: body,
      });
      return result;
    });

    return reply.send(updated);
  });

  const createNoticeSchema = z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    legalCitation: z.string().min(1),
    sourceDocument: z.string().optional(),
    effectiveDate: z.string().datetime(),
    affectedRuleKeys: z.array(z.string()).default([]),
  });

  // A platform reviewer records a regulatory change as they learn of it —
  // same "human review gates it" rationale as the rule-update endpoint
  // above, not an automated scan writing this directly.
  app.post("/regulatory-change-notices", { preHandler: [app.authenticate, requirePlatformAdmin] }, async (request, reply) => {
    const body = createNoticeSchema.parse(request.body);
    const notice = await withoutTenantContext(async (tx) => {
      const created = await tx.regulatoryChangeNotice.create({
        data: {
          title: body.title,
          description: body.description,
          legalCitation: body.legalCitation,
          sourceDocument: body.sourceDocument,
          effectiveDate: new Date(body.effectiveDate),
          affectedRuleKeys: body.affectedRuleKeys,
          publishedByUserId: request.user.sub,
        },
      });
      await appendAuditLog(tx, {
        entityId: null,
        actorUserId: request.user.sub,
        action: "REGULATORY_CHANGE_NOTICE_PUBLISHED",
        tableName: "RegulatoryChangeNotice",
        recordId: created.id,
        afterData: { title: body.title, legalCitation: body.legalCitation, affectedRuleKeys: body.affectedRuleKeys },
      });
      return created;
    });
    return reply.code(201).send(notice);
  });

  // Platform-wide, like GET /regulatory-rules — every entity sees the same
  // change history. Use the entity-scoped endpoint below to see whether a
  // specific entity has acknowledged each one.
  app.get("/regulatory-change-notices", { preHandler: app.authenticate }, async (_request, reply) => {
    const notices = await withoutTenantContext((tx) => tx.regulatoryChangeNotice.findMany({ orderBy: { effectiveDate: "desc" } }));
    return reply.send(notices);
  });

  // Every notice, annotated with whether (and when, and by whom) this
  // entity has acknowledged it — the Compliance Officer's actual worklist,
  // not just the raw platform-wide feed.
  app.get(
    "/entities/:entityId/regulatory-change-notices",
    { preHandler: [app.authenticate, requireEntityAccess()] },
    async (request, reply) => {
      const { entityId } = request.params as { entityId: string };
      const [notices, acknowledgments] = await Promise.all([
        withoutTenantContext((tx) => tx.regulatoryChangeNotice.findMany({ orderBy: { effectiveDate: "desc" } })),
        withTenantContext(entityId, (tx) => tx.regulatoryChangeAcknowledgment.findMany({ where: { entityId } })),
      ]);
      const ackByNoticeId = new Map(acknowledgments.map((a) => [a.noticeId, a]));
      return reply.send(
        notices.map((n) => ({
          ...n,
          acknowledged: ackByNoticeId.has(n.id),
          acknowledgedAt: ackByNoticeId.get(n.id)?.acknowledgedAt ?? null,
          acknowledgedByUserId: ackByNoticeId.get(n.id)?.acknowledgedByUserId ?? null,
        })),
      );
    },
  );

  app.post(
    "/entities/:entityId/regulatory-change-notices/:noticeId/acknowledge",
    { preHandler: [app.authenticate, requireRole("COMPLIANCE_OFFICER", "CORPORATE_SECRETARY")] },
    async (request, reply) => {
      const { entityId, noticeId } = request.params as { entityId: string; noticeId: string };
      const exists = await withoutTenantContext((tx) => tx.regulatoryChangeNotice.findUnique({ where: { id: noticeId } }));
      if (!exists) {
        throw Object.assign(new Error("no such regulatory change notice"), { statusCode: 404 });
      }

      // Idempotent — re-acknowledging doesn't move the timestamp or add a
      // second audit entry, since the record is "has this entity dealt
      // with it", not a log of every time someone re-opened the notice.
      const ack = await withTenantContext(entityId, async (tx) => {
        const existingAck = await tx.regulatoryChangeAcknowledgment.findUnique({ where: { noticeId_entityId: { noticeId, entityId } } });
        if (existingAck) return existingAck;

        const created = await tx.regulatoryChangeAcknowledgment.create({
          data: { noticeId, entityId, acknowledgedByUserId: request.user.sub },
        });
        await appendAuditLog(tx, {
          entityId,
          actorUserId: request.user.sub,
          action: "REGULATORY_CHANGE_ACKNOWLEDGED",
          tableName: "RegulatoryChangeAcknowledgment",
          recordId: created.id,
          afterData: { noticeId },
        });
        return created;
      });

      return reply.code(201).send(ack);
    },
  );
}
