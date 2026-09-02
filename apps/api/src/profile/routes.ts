import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withUserContext, withTenantContext } from "../db.js";
import { requireRole } from "../auth/rbac.js";
import { appendAuditLog } from "../audit/auditLog.js";
import { ensureUniqueSlug } from "../public/slug.js";

const userPublicProfileSchema = z.object({
  publicProfileVisible: z.boolean(),
  headline: z.string().max(200).nullish(),
  bio: z.string().max(4000).nullish(),
});

const entityPublicProfileSchema = z.object({
  publiclyListed: z.boolean(),
  about: z.string().max(4000).nullish(),
  website: z.string().url().nullish(),
});

/**
 * Self-service publish/withdraw controls for the public professional
 * network (see public/routes.ts). PDPL section 8.4 requires consent to be
 * explicit, informed, and freely withdrawable — both routes are plain
 * toggles the owner controls directly, logged to the audit chain because
 * a decision to disclose (or stop disclosing) personal/entity data is
 * itself worth a durable record, even though it never touches governance
 * data proper.
 */
export async function registerProfileRoutes(app: FastifyInstance): Promise<void> {
  app.put("/users/me/public-profile", { preHandler: app.authenticate }, async (request, reply) => {
    const body = userPublicProfileSchema.parse(request.body);
    const userId = request.user.sub;

    const user = await withUserContext(userId, async (tx) => {
      const existing = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { fullName: true, publicSlug: true } });
      const publicSlug = existing.publicSlug ?? (await ensureUniqueSlug(tx, "user", existing.fullName));

      const updated = await tx.user.update({
        where: { id: userId },
        data: { publicSlug, publicProfileVisible: body.publicProfileVisible, headline: body.headline, bio: body.bio },
        select: { publicSlug: true, publicProfileVisible: true, headline: true, bio: true },
      });

      await appendAuditLog(tx, {
        entityId: null,
        actorUserId: userId,
        action: body.publicProfileVisible ? "PUBLIC_PROFILE_PUBLISHED" : "PUBLIC_PROFILE_WITHDRAWN",
        tableName: "User",
        recordId: userId,
        afterData: updated,
      });

      return updated;
    });

    return reply.send(user);
  });

  app.put(
    "/entities/:entityId/public-profile",
    { preHandler: [app.authenticate, requireRole("COMPLIANCE_OFFICER")] },
    async (request, reply) => {
      const { entityId } = request.params as { entityId: string };
      const body = entityPublicProfileSchema.parse(request.body);

      const entity = await withTenantContext(entityId, async (tx) => {
        const existing = await tx.entity.findUniqueOrThrow({ where: { id: entityId }, select: { legalName: true, publicSlug: true } });
        const publicSlug = existing.publicSlug ?? (await ensureUniqueSlug(tx, "entity", existing.legalName));

        const updated = await tx.entity.update({
          where: { id: entityId },
          data: { publicSlug, publiclyListed: body.publiclyListed, about: body.about, website: body.website },
          select: { publicSlug: true, publiclyListed: true, about: true, website: true },
        });

        await appendAuditLog(tx, {
          entityId,
          actorUserId: request.user.sub,
          action: body.publiclyListed ? "PUBLIC_PROFILE_PUBLISHED" : "PUBLIC_PROFILE_WITHDRAWN",
          tableName: "Entity",
          recordId: entityId,
          afterData: updated,
        });

        return updated;
      });

      return reply.send(entity);
    },
  );
}
