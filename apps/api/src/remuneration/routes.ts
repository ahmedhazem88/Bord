import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withTenantContext } from "../db.js";
import { requireEntityAccess, requireRole } from "../auth/rbac.js";
import { appendAuditLog } from "../audit/auditLog.js";

/**
 * Epic 8 (Remuneration & Compensation) — scaffolded.
 * Built here: RemunerationPolicy as entity-level configuration (which body
 * approves this remuneration type, and its cap basis — not itself a
 * governance-structure mutation in the PRD 5.2 sense, unlike the actual
 * RemunerationRecord decisions, which the Resolution Engine already gates),
 * and payout scheduling with the ratification gate (Epic 8 AC).
 * NOT built yet: automatic 10%-of-net-distributable-profit cap calculation
 * from loaded financial statements, real-time cap reconciliation, and
 * tax-withholding computation — all follow-ups once financial-statement
 * ingestion exists.
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

  app.get("/entities/:entityId/payouts", { preHandler: [app.authenticate, requireEntityAccess()] }, async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const payouts = await withTenantContext(entityId, (tx) =>
      tx.payout.findMany({ where: { remunerationRecord: { capacity: { entityId } } }, orderBy: { dueDate: "asc" } }),
    );
    return reply.send(payouts);
  });
}
