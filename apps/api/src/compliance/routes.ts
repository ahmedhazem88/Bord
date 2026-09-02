import type { FastifyInstance } from "fastify";
import type { RegulatoryObligationType } from "@prisma/client";
import { withTenantContext, withoutTenantContext } from "../db.js";
import { requireEntityAccess } from "../auth/rbac.js";
import { escalationLevel, compareByUrgency } from "./alerts.js";

/**
 * Compliance assistant — Epic 6/7. A search engine across everything the
 * regulatory calendar tracks, plus computed escalating alerts (30/14/3
 * days out, per spec section 7).
 *
 * IMPORTANT LIMITATION: alerts here are computed on request (pull), not
 * pushed. There is no email/SMS/push infrastructure in this build — a real
 * deployment needs a scheduled job hitting the alerts endpoint (or
 * reimplementing its query) and a notification channel; this endpoint is
 * the data source that job would use, not the job itself.
 */

export async function registerComplianceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/entities/:entityId/compliance/search", { preHandler: [app.authenticate, requireEntityAccess()] }, async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const q = ((request.query as Record<string, string | undefined>).q ?? "").trim();
    if (!q) return reply.code(400).send({ error: "q query parameter is required" });

    const [obligations, minutes, resolutions, rules] = await withTenantContext(entityId, (tx) =>
      Promise.all([
        tx.regulatoryObligation.findMany({ where: { entityId, type: { in: matchingObligationTypes(q) } } }),
        tx.minutes.findMany({ where: { entityId, content: { contains: q, mode: "insensitive" } }, include: { meeting: { select: { type: true, scheduledAt: true } } }, take: 25 }),
        tx.resolution.findMany({ where: { entityId, OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] }, take: 25 }),
        withoutTenantContext((rtx) => rtx.regulatoryRule.findMany({ where: { OR: [{ ruleKey: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }, { legalCitation: { contains: q, mode: "insensitive" } }] } })),
      ]),
    );

    return reply.send({
      query: q,
      results: [
        ...obligations.map((o) => ({ kind: "obligation" as const, id: o.id, title: o.type.replace(/_/g, " "), detail: `Next due ${o.nextDueAt.toISOString().slice(0, 10)} · ${o.status}` })),
        ...minutes.map((m) => ({ kind: "minutes" as const, id: m.id, title: `${m.meeting.type.replace(/_/g, " ")} minutes — ${m.meeting.scheduledAt.toISOString().slice(0, 10)}`, detail: excerpt(m.content, q) })),
        ...resolutions.map((r) => ({ kind: "resolution" as const, id: r.id, title: r.title, detail: `${r.type.replace(/_/g, " ")} · ${r.status}` })),
        ...rules.map((r) => ({ kind: "rule" as const, id: r.id, title: r.ruleKey.replace(/_/g, " "), detail: `${r.description} — ${r.legalCitation}` })),
      ],
    });
  });

  app.get("/entities/:entityId/compliance/alerts", { preHandler: [app.authenticate, requireEntityAccess()] }, async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const obligations = await withTenantContext(entityId, (tx) => tx.regulatoryObligation.findMany({ where: { entityId } }));

    const alerts = obligations
      .map((o) => ({
        obligationId: o.id,
        type: o.type,
        responsibleRole: o.responsibleRole,
        nextDueAt: o.nextDueAt,
        level: escalationLevel(o.nextDueAt),
      }))
      .filter((a) => a.level !== "OK")
      .sort(compareByUrgency);

    return reply.send({ generatedAt: new Date().toISOString(), alerts });
  });
}

function matchingObligationTypes(q: string): RegulatoryObligationType[] {
  const types: RegulatoryObligationType[] = [
    "BOARD_MEETING_CADENCE",
    "OGM_ANNUAL",
    "FRA_MINUTES_SUBMISSION",
    "GAFI_RATIFICATION",
    "FRA_ANNUAL_DISCLOSURE",
    "FRA_PRE_GA_DISCLOSURE",
    "TERM_LIMIT",
    "AUDITOR_ROTATION",
    "INTEREST_DECLARATION_RECONFIRMATION",
  ];
  const needle = q.toLowerCase().replace(/\s+/g, "_");
  return types.filter((t) => t.toLowerCase().includes(needle) || needle.includes(t.toLowerCase().split("_")[0] ?? ""));
}

function excerpt(content: string, q: string): string {
  const idx = content.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return content.slice(0, 120);
  const start = Math.max(0, idx - 40);
  return `…${content.slice(start, idx + q.length + 60)}…`;
}
