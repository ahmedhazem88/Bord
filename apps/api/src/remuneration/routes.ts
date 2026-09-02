import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withTenantContext } from "../db.js";
import { requireEntityAccess, requireRole } from "../auth/rbac.js";
import { appendAuditLog } from "../audit/auditLog.js";
import { resolveBoardRemunerationCapPct } from "../resolutions/engine.js";

/**
 * Epic 8 (Remuneration & Compensation).
 * Built here: RemunerationPolicy as entity-level configuration (which body
 * approves this remuneration type, and its cap basis — not itself a
 * governance-structure mutation in the PRD 5.2 sense, unlike the actual
 * RemunerationRecord decisions, which the Resolution Engine already gates);
 * payout scheduling with the ratification gate (Epic 8 AC); the 10%-of-
 * net-distributable-profit board remuneration cap, computed from the
 * FinancialStatement a FINANCIAL_STATEMENTS_APPROVAL resolution establishes
 * per fiscal year and enforced at resolution-effect time
 * (resolutions/engine.ts's assertWithinBoardRemunerationCap) rather than
 * only checked after the fact; and the real-time cap-reconciliation view
 * below.
 * NOT built yet: automatic tax-withholding computation. Payout already
 * carries a withheldTaxAmount field (defaults to 0, set by whoever
 * schedules the payout), but computing it automatically needs the actual
 * applicable Egyptian withholding rate/category rules as a cited legal
 * fact — the same standard every other legal constant in this codebase is
 * held to (see the seeded RegulatoryRule rows) — which nothing in the
 * source spec/PRD documents this session was given specifies. Left
 * explicit rather than guessed at.
 */

const createPolicySchema = z.object({
  type: z.enum(["BOARD", "EXECUTIVE", "ATTENDANCE_ALLOWANCE"]),
  approvingBody: z.enum(["GA", "BOARD"]),
  capCalculationBasis: z.string().optional(),
});

const schedulePayoutSchema = z.object({
  remunerationRecordId: z.string(),
  amount: z.number().positive(),
  dueDate: z.string().datetime(),
  paymentMethod: z.string().optional(),
  nonDeductibleTaxTag: z.boolean().default(false),
});

export async function registerRemunerationRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/entities/:entityId/remuneration-policies",
    { preHandler: [app.authenticate, requireRole("COMPLIANCE_OFFICER", "CORPORATE_SECRETARY")] },
    async (request, reply) => {
      const { entityId } = request.params as { entityId: string };
      const body = createPolicySchema.parse(request.body);
      const policy = await withTenantContext(entityId, (tx) => tx.remunerationPolicy.create({ data: { entityId, ...body } }));
      return reply.code(201).send(policy);
    },
  );

  app.get("/entities/:entityId/remuneration-policies", { preHandler: [app.authenticate, requireEntityAccess()] }, async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const policies = await withTenantContext(entityId, (tx) => tx.remunerationPolicy.findMany({ where: { entityId } }));
    return reply.send(policies);
  });

  // Epic 8 AC: a payout cannot be scheduled against a resolution that
  // hasn't reached its effective status — RATIFIED where ratification
  // applies (authorization-effective), PASSED where it doesn't
  // (resolution-effective).
  app.post(
    "/entities/:entityId/payouts",
    { preHandler: [app.authenticate, requireRole("COMPLIANCE_OFFICER")] },
    async (request, reply) => {
      const { entityId } = request.params as { entityId: string };
      const body = schedulePayoutSchema.parse(request.body);

      const payout = await withTenantContext(entityId, async (tx) => {
        const record = await tx.remunerationRecord.findUniqueOrThrow({
          where: { id: body.remunerationRecordId },
          include: { approvingResolution: true },
        });

        const resolution = record.approvingResolution;
        const isEffective = resolution.effectBasis === "AUTHORIZATION_EFFECTIVE" ? resolution.status === "RATIFIED" : resolution.status === "PASSED";

        if (!isEffective) {
          throw Object.assign(
            new Error(`cannot schedule payout: approving resolution is '${resolution.status}', not yet effective`),
            { statusCode: 409 },
          );
        }

        const created = await tx.payout.create({
          data: {
            remunerationRecordId: body.remunerationRecordId,
            amount: body.amount,
            dueDate: new Date(body.dueDate),
            paymentMethod: body.paymentMethod,
            nonDeductibleTaxTag: body.nonDeductibleTaxTag,
          },
        });

        await appendAuditLog(tx, {
          entityId,
          actorUserId: request.user.sub,
          action: "PAYOUT_SCHEDULED",
          tableName: "Payout",
          recordId: created.id,
          afterData: { amount: body.amount, dueDate: body.dueDate },
        });

        return created;
      });

      return reply.code(201).send(payout);
    },
  );

  // Real-time board remuneration cap reconciliation (Epic 8 AC): the same
  // cap resolutions/engine.ts enforces at resolution-effect time, exposed
  // so the UI can show headroom before a GA_SET_BOARD_REMUNERATION
  // resolution is even drafted, not just discover a rejection after the
  // fact. Defaults to the latest fiscal year with an approved financial
  // statement on file; ?fiscalYear=YYYY checks a specific year.
  app.get(
    "/entities/:entityId/remuneration-cap-status",
    { preHandler: [app.authenticate, requireEntityAccess()] },
    async (request, reply) => {
      const { entityId } = request.params as { entityId: string };
      const query = request.query as { fiscalYear?: string };

      const result = await withTenantContext(entityId, async (tx) => {
        const statement = query.fiscalYear
          ? await tx.financialStatement.findUnique({ where: { entityId_fiscalYear: { entityId, fiscalYear: Number(query.fiscalYear) } } })
          : await tx.financialStatement.findFirst({ where: { entityId }, orderBy: { fiscalYear: "desc" } });

        if (!statement) {
          return { hasFinancialStatement: false as const };
        }

        const capPct = await resolveBoardRemunerationCapPct(tx, entityId);
        const cap = Number(statement.netDistributableProfit) * (capPct / 100);

        const yearStart = new Date(Date.UTC(statement.fiscalYear, 0, 1));
        const yearEnd = new Date(Date.UTC(statement.fiscalYear + 1, 0, 1));
        const records = await tx.remunerationRecord.findMany({
          where: { policy: { entityId, type: "BOARD" }, effectiveDate: { gte: yearStart, lt: yearEnd } },
          select: { amount: true },
        });
        const committed = records.reduce((sum, r) => sum + Number(r.amount), 0);

        return {
          hasFinancialStatement: true as const,
          fiscalYear: statement.fiscalYear,
          netDistributableProfit: statement.netDistributableProfit,
          capPct,
          cap,
          committed,
          remaining: cap - committed,
        };
      });

      return reply.send(result);
    },
  );

  app.get("/entities/:entityId/payouts", { preHandler: [app.authenticate, requireEntityAccess()] }, async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const payouts = await withTenantContext(entityId, (tx) =>
      tx.payout.findMany({ where: { remunerationRecord: { capacity: { entityId } } }, orderBy: { dueDate: "asc" } }),
    );
    return reply.send(payouts);
  });
}
