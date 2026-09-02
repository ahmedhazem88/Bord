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
 * NOT built yet: escalating 30/14/3-day PUSH reminders (there's no
 * email/SMS infrastructure — see compliance/routes.ts) and the scheduled
 * scan for GAFI/FRA circulars, both of which need a real job scheduler.
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
}
