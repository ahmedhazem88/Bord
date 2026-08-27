import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withTenantContext, withUserContext } from "../db.js";
import { requireCapability, requireRole } from "../auth/rbac.js";
import { appendAuditLog } from "../audit/auditLog.js";
import { evaluateDisqualification } from "./disqualification.js";

const uploadDocSchema = z.object({
  documentType: z.string().min(1),
  storageKey: z.string().min(1),
});

const reviewSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  reason: z.string().optional(),
});

const disqualificationSchema = z.object({
  criminalRecordClear: z.boolean().nullable(),
  publicSectorApprovalStatus: z.enum(["not_applicable", "required_pending", "approved"]).nullable(),
  competingRoleApprovalStatus: z.enum(["not_applicable", "required_pending", "approved"]).nullable(),
});

export async function registerCapacityRoutes(app: FastifyInstance): Promise<void> {
  // Epic 1 AC: a user's capacity history across every entity they hold one at.
  app.get("/users/me/capacities", { preHandler: app.authenticate }, async (request, reply) => {
    const asOfParam = (request.query as Record<string, string | undefined>)?.asOf;
    const asOf = asOfParam ? new Date(asOfParam) : new Date();
    const capacities = await withUserContext(request.user.sub, (tx) =>
      tx.capacity.findMany({
        where: {
          userId: request.user.sub,
          startDate: { lte: asOf },
          OR: [{ endDate: null }, { endDate: { gt: asOf } }],
        },
        include: { entity: { select: { id: true, legalName: true } } },
      }),
    );
    return reply.send(capacities);
  });

  // "Who was chairman on date X" — spec section 5.3, queryable as-of any date.
  app.get("/entities/:entityId/capacities", { preHandler: app.authenticate }, async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const query = request.query as Record<string, string>;
    const asOf = query.asOf ? new Date(query.asOf) : new Date();
    const capacities = await withTenantContext(entityId, (tx) =>
      tx.capacity.findMany({
        where: {
          entityId,
          startDate: { lte: asOf },
          OR: [{ endDate: null }, { endDate: { gt: asOf } }],
        },
        include: { user: { select: { id: true, fullName: true, email: true } } },
        orderBy: { role: "asc" },
      }),
    );
    return reply.send(capacities);
  });

  // Epic 2: upload a verification document against a pending capacity.
  app.post(
    "/entities/:entityId/capacities/:capacityId/verification/documents",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { entityId, capacityId } = request.params as { entityId: string; capacityId: string };
      const body = uploadDocSchema.parse(request.body);

      const document = await withTenantContext(entityId, async (tx) => {
        const capacity = await tx.capacity.findUniqueOrThrow({ where: { id: capacityId } });
        if (capacity.userId !== request.user.sub) {
          // Entity-level bulk upload (Corporate Secretary) is a distinct,
          // separately-authorized path — not wired into this endpoint yet.
          throw Object.assign(new Error("can only upload your own verification documents"), { statusCode: 403 });
        }
        const doc = await tx.document.create({
          data: {
            ownerType: "USER",
            ownerUserId: request.user.sub,
            entityId,
            capacityId,
            type: body.documentType,
            storageKey: body.storageKey,
            uploadedByUserId: request.user.sub,
          },
        });
        await appendAuditLog(tx, {
          entityId,
          actorUserId: request.user.sub,
          action: "VERIFICATION_DOCUMENT_UPLOADED",
          tableName: "Document",
          recordId: doc.id,
          afterData: { type: body.documentType, capacityId },
        });
        return doc;
      });

      return reply.code(201).send(document);
    },
  );

  // Epic 2: compliance-officer review decision. Approve requires a
  // disqualification check on file (for board roles) that doesn't block.
  app.post(
    "/entities/:entityId/capacities/:capacityId/verification/review",
    { preHandler: [app.authenticate, requireRole("COMPLIANCE_OFFICER")] },
    async (request, reply) => {
      const { entityId, capacityId } = request.params as { entityId: string; capacityId: string };
      const body = reviewSchema.parse(request.body);
      if (body.decision === "REJECTED" && !body.reason) {
        return reply.code(400).send({ error: "a rejection requires a reason" });
      }

      const result = await withTenantContext(entityId, async (tx) => {
        const capacity = await tx.capacity.findUniqueOrThrow({ where: { id: capacityId }, include: { disqualificationCheck: true } });

        if (body.decision === "APPROVED" && capacity.disqualificationCheck?.blocksActivation) {
          throw Object.assign(
            new Error("cannot approve: disqualification check blocks activation (escalation required, no self-override)"),
            { statusCode: 409 },
          );
        }

        const updated = await tx.capacity.update({
          where: { id: capacityId },
          data: {
            verificationStatus: body.decision,
            verificationReason: body.reason ?? null,
            reviewedByUserId: request.user.sub,
            reviewedAt: new Date(),
            active: body.decision === "APPROVED" && !capacity.disqualificationCheck?.blocksActivation,
          },
        });

        await appendAuditLog(tx, {
          entityId,
          actorUserId: request.user.sub,
          action: "VERIFICATION_REVIEWED",
          tableName: "Capacity",
          recordId: capacityId,
          beforeData: { verificationStatus: capacity.verificationStatus },
          afterData: { verificationStatus: body.decision, reason: body.reason ?? null },
        });

        return updated;
      });

      return reply.send(result);
    },
  );

  // Epic 2 disqualification checks — theft/breach-of-trust/forgery/bankruptcy,
  // ministerial approval, competing-role approval.
  app.put(
    "/entities/:entityId/capacities/:capacityId/disqualification-check",
    { preHandler: [app.authenticate, requireRole("COMPLIANCE_OFFICER")] },
    async (request, reply) => {
      const { entityId, capacityId } = request.params as { entityId: string; capacityId: string };
      const body = disqualificationSchema.parse(request.body);

      const result = await withTenantContext(entityId, async (tx) => {
        const capacity = await tx.capacity.findUniqueOrThrow({ where: { id: capacityId } });
        const { blocksActivation, reasons } = evaluateDisqualification({ role: capacity.role, ...body });

        const check = await tx.disqualificationCheck.upsert({
          where: { capacityId },
          create: { capacityId, ...body, blocksActivation, checkedByUserId: request.user.sub },
          update: { ...body, blocksActivation, checkedByUserId: request.user.sub, checkedAt: new Date() },
        });

        // A newly-blocking check immediately deactivates an already-active capacity.
        if (blocksActivation && capacity.active) {
          await tx.capacity.update({ where: { id: capacityId }, data: { active: false } });
        }

        await appendAuditLog(tx, {
          entityId,
          actorUserId: request.user.sub,
          action: "DISQUALIFICATION_CHECK_RECORDED",
          tableName: "DisqualificationCheck",
          recordId: check.id,
          afterData: { blocksActivation, reasons },
        });

        return { check, reasons };
      });

      return reply.send(result);
    },
  );
}
