import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withTenantContext } from "../db.js";
import { requireCapability } from "../auth/rbac.js";
import { appendAuditLog } from "../audit/auditLog.js";

/**
 * Epic 10 (Document Management & E-Signature) — scaffolded.
 * Built here: entity-scoped document metadata (minutes, resolutions,
 * recordings — pointing at encrypted object storage via storageKey, per the
 * per-entity isolation the tenant-isolation RLS already provides at the
 * table layer) and the access log required by the AC ("every document has
 * a full access log... retrievable for at least 5 years").
 * NOT built yet: the actual encrypted object-storage integration (storageKey
 * is currently just an opaque pointer) and the ITIDA-licensed e-signature
 * CSP integration — both external integrations, deliberately out of scope
 * for this pass.
 */

const createDocumentSchema = z.object({
  type: z.string().min(1),
  storageKey: z.string().min(1),
  agendaItemId: z.string().optional(),
});

export async function registerDocumentRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/entities/:entityId/documents",
    { preHandler: [app.authenticate, requireCapability("document:view_confidential_board")] },
    async (request, reply) => {
      const { entityId } = request.params as { entityId: string };
      const body = createDocumentSchema.parse(request.body);

      const document = await withTenantContext(entityId, async (tx) => {
        const created = await tx.document.create({
          data: { ownerType: "ENTITY", entityId, type: body.type, storageKey: body.storageKey, agendaItemId: body.agendaItemId, uploadedByUserId: request.user.sub },
        });
        await appendAuditLog(tx, {
          entityId,
          actorUserId: request.user.sub,
          action: "DOCUMENT_UPLOADED",
          tableName: "Document",
          recordId: created.id,
          afterData: { type: body.type },
        });
        return created;
      });

      return reply.code(201).send(document);
    },
  );

  app.get(
    "/entities/:entityId/documents/:documentId",
    { preHandler: [app.authenticate, requireCapability("document:view_confidential_board")] },
    async (request, reply) => {
      const { entityId, documentId } = request.params as { entityId: string; documentId: string };

      const document = await withTenantContext(entityId, async (tx) => {
        const doc = await tx.document.findUniqueOrThrow({ where: { id: documentId } });
        await tx.documentAccessLog.create({ data: { documentId, userId: request.user.sub, action: "viewed" } });
        return doc;
      });

      return reply.send(document);
    },
  );

  app.get(
    "/entities/:entityId/documents/:documentId/access-log",
    { preHandler: [app.authenticate, requireCapability("document:view_confidential_board")] },
    async (request, reply) => {
      const { entityId, documentId } = request.params as { entityId: string; documentId: string };
      const log = await withTenantContext(entityId, (tx) =>
        tx.documentAccessLog.findMany({ where: { documentId }, orderBy: { timestamp: "desc" } }),
      );
      return reply.send(log);
    },
  );
}
