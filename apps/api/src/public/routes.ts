import type { FastifyInstance } from "fastify";
import { withoutTenantContext } from "../db.js";

/**
 * The public professional network (PRD roadmap Phase 4, brought forward).
 * Every route here is unauthenticated by design — this is the discoverable,
 * indexable surface of the product. It reads through the RLS public-consent
 * branches added alongside the schema (see migrations
 * 20260902110000/20260902110100): a row is visible here only if its owner
 * explicitly opted in (User.publicProfileVisible) or the entity is publicly
 * listed (Entity.publiclyListed, on by default — regulated-entity identity
 * is public record regardless). Never exposes governance data: no minutes,
 * votes, resolutions, remuneration, documents, or verification internals —
 * those stay behind the private RLS branches this surface doesn't touch.
 */

const PAGE_SIZE = 24;

export async function registerPublicRoutes(app: FastifyInstance): Promise<void> {
  app.get("/public/professionals", async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const page = Math.max(1, Number(query.page) || 1);

    const professionals = await withoutTenantContext((tx) =>
      tx.user.findMany({
        where: { publicProfileVisible: true, publicSlug: { not: null } },
        select: { publicSlug: true, fullName: true, headline: true },
        orderBy: { fullName: "asc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    );

    return reply.send({ page, pageSize: PAGE_SIZE, professionals });
  });

  app.get("/public/professionals/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const user = await withoutTenantContext((tx) =>
      tx.user.findFirst({
        where: { publicSlug: slug, publicProfileVisible: true },
        select: { fullName: true, headline: true, bio: true, publicSlug: true },
      }),
    );
    if (!user) return reply.code(404).send({ error: "profile not found" });

    // Capacity RLS's public-read branch already restricts this to
    // APPROVED capacities at publicly-listed entities for this user —
    // the WHERE clause below is a readability convenience, not the
    // security boundary (that's enforced at the database layer).
    const capacities = await withoutTenantContext((tx) =>
      tx.capacity.findMany({
        where: { user: { publicSlug: slug }, verificationStatus: "APPROVED" },
        select: { role: true, startDate: true, endDate: true, entity: { select: { legalName: true, publicSlug: true, entityType: true } } },
        orderBy: { startDate: "desc" },
      }),
    );

    return reply.send({
      ...user,
      positions: capacities
        .filter((c) => c.entity.publicSlug)
        .map((c) => ({
          role: c.role,
          startDate: c.startDate,
          endDate: c.endDate,
          entityName: c.entity.legalName,
          entitySlug: c.entity.publicSlug,
          entityType: c.entity.entityType,
        })),
    });
  });

  app.get("/public/companies", async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const page = Math.max(1, Number(query.page) || 1);

    const companies = await withoutTenantContext((tx) =>
      tx.entity.findMany({
        where: { publiclyListed: true, publicSlug: { not: null } },
        select: { publicSlug: true, legalName: true, entityType: true, verificationStatus: true },
        orderBy: { legalName: "asc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    );

    return reply.send({ page, pageSize: PAGE_SIZE, companies });
  });

  app.get("/public/companies/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const entity = await withoutTenantContext((tx) =>
      tx.entity.findFirst({
        where: { publicSlug: slug, publiclyListed: true },
        select: { legalName: true, registrationNumber: true, entityType: true, verificationStatus: true, about: true, website: true, publicSlug: true },
      }),
    );
    if (!entity) return reply.code(404).send({ error: "company not found" });

    const capacities = await withoutTenantContext((tx) =>
      tx.capacity.findMany({
        where: { entity: { publicSlug: slug }, verificationStatus: "APPROVED", active: true },
        select: { role: true, startDate: true, user: { select: { fullName: true, publicSlug: true, publicProfileVisible: true } } },
        orderBy: { startDate: "asc" },
      }),
    );

    return reply.send({
      ...entity,
      board: capacities
        .filter((c) => c.user.publicProfileVisible && c.user.publicSlug)
        .map((c) => ({ role: c.role, startDate: c.startDate, name: c.user.fullName, slug: c.user.publicSlug })),
    });
  });

  // Dynamic sitemap — the public directory pages don't exist as static
  // files (this is a client-rendered SPA), so this is the source of truth
  // for what's publicly discoverable. In production, proxy
  // yourdomain.com/sitemap.xml to this endpoint (see README deployment notes).
  app.get("/sitemap.xml", async (request, reply) => {
    const baseUrl = (request.headers["x-public-base-url"] as string) || `${request.protocol}://${request.hostname}`;

    const [professionals, companies] = await withoutTenantContext((tx) =>
      Promise.all([
        tx.user.findMany({ where: { publicProfileVisible: true, publicSlug: { not: null } }, select: { publicSlug: true, updatedAt: true } }),
        tx.entity.findMany({ where: { publiclyListed: true, publicSlug: { not: null } }, select: { publicSlug: true, updatedAt: true } }),
      ]),
    );

    const staticUrls = ["/", "/professionals", "/companies"];
    const urls = [
      ...staticUrls.map((path) => ({ loc: `${baseUrl}${path}`, lastmod: null as string | null })),
      ...professionals.map((p) => ({ loc: `${baseUrl}/professionals/${p.publicSlug}`, lastmod: p.updatedAt.toISOString() })),
      ...companies.map((c) => ({ loc: `${baseUrl}/companies/${c.publicSlug}`, lastmod: c.updatedAt.toISOString() })),
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${escapeXml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`).join("\n")}
</urlset>`;

    return reply.header("Content-Type", "application/xml").send(xml);
  });
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c] as string));
}
