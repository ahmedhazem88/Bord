import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withTenantContext } from "../db.js";
import { requireEntityAccess, requireRole } from "../auth/rbac.js";
import { appendAuditLog } from "../audit/auditLog.js";

/**
 * The entity's governing documents — Articles of Association, Bylaws,
 * Shareholders' Agreements, other agreements, covenants, warrants — kept as
 * extracted plain text so the agenda compliance-review engine
 * (agenda/review.ts) can actually read them. Custodianship sits with the
 * Corporate Secretary (who already prepares agendas and minutes) and the
 * Compliance Officer (who already owns verification/compliance elsewhere
 * in this codebase) — the same two roles, not a new one.
 */

const createDocumentSchema = z.object({
  type: z.enum(["ARTICLES_OF_ASSOCIATION", "BYLAWS", "SHAREHOLDERS_AGREEMENT", "OTHER_AGREEMENT", "COVENANT", "WARRANT"]),
  title: z.string().min(1),
  content: z.string().min(1),
  citation: z.string().optional(),
});

export async function registerGoverningDocumentRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/entities/:entityId/governing-documents",
    { preHandler: [app.authenticate, requireRole("CORPORATE_SECRETARY", "COMPLIANCE_OFFICER")] },
    async (request, reply) => {
      const { entityId } = request.params as { entityId: string };
      const body = createDocumentSchema.parse(request.body);

      const document = await withTenantContext(entityId, async (tx) => {
        const created = await tx.governingDocument.create({
          data: { entityId, type: body.type, title: body.title, content: body.content, citation: body.citation, uploadedByUserId: request.user.sub },
        });
        await appendAuditLog(tx, {
          entityId,
          actorUserId: request.user.sub,
          action: "GOVERNING_DOCUMENT_ADDED",
          tableName: "GoverningDocument",
          recordId: created.id,
          afterData: { type: body.type, title: body.title },
        });
        return created;
      });

      return reply.code(201).send(document);
    },
  );

  app.get("/entities/:entityId/governing-documents", { preHandler: [app.authenticate, requireEntityAccess()] }, async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const documents = await withTenantContext(entityId, (tx) =>
      tx.governingDocument.findMany({ where: { entityId }, orderBy: { createdAt: "desc" } }),
    );
    return reply.send(documents);
  });

  app.get("/entities/:entityId/governing-documents/:documentId", { preHandler: [app.authenticate, requireEntityAccess()] }, async (request, reply) => {
    const { entityId, documentId } = request.params as { entityId: string; documentId: string };
    const document = await withTenantContext(entityId, (tx) => tx.governingDocument.findUniqueOrThrow({ where: { id: documentId } }));
    return reply.send(document);
  });
}
