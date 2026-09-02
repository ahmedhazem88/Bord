# Bord

Governance platform for FRA-regulated non-bank financial entities (Phase 1) — insurance, leasing,
factoring, mortgage finance, microfinance, and brokerage firms in Egypt. See the project's PRD and
MVP spec (in the originating conversation/docs) for the full product and legal requirements this
build implements.

## Status

This is the Phase 1 architectural foundation, built in build-sequence order (PRD section 12):

- **Done**: data model + Resolution Engine + hash-chained AuditLog; tenant-isolated auth with
  role-appropriate MFA; Identity/Capacity (Epic 1) and Registration/Verification (Epic 2); the
  Governance Structure Builder with composition-rule enforcement (Epic 3); Meeting & Conferencing
  (Epic 5) — Board/Committee/OGM/EGM scheduling including OGM/EGM second meetings, the
  convocation-rights MeetingRequest workflow (1/3 board + 10-day Chairman window; 5%/10% GA
  capital + 1-month board window), a context-based live quorum calculator (board headcount vs. GA
  capital-percentage, blocking votes the instant quorum is lost mid-meeting), the four-value
  voting engine with the Art. 74 hard exclusion and capital-weighted tallying, and board/GA
  minutes — auto-generated, dual-signed, FRA/GAFI submission tracking, and a searchable directory
  (date range, keyword, free text); a compliance-assistant search endpoint across
  obligations/rules/minutes/resolutions plus a computed 30/14/3-day escalating-alerts endpoint
  (Epics 6–7); a working React frontend for the earlier (Epic 1–3) flows; a public professional
  network (PRD roadmap Phase 4, brought forward) — opt-in public profiles for professionals and
  publicly-listed company pages, backed by RLS policies that only widen what's visible under
  explicit PDPL consent, with real SEO (per-route meta/canonical/OG/JSON-LD, a dynamic sitemap,
  robots.txt/llms.txt, a custom 404) and a self-service publish/withdraw UI on the dashboard and
  entity page. The full marketplace layer beyond that — search/filters, messaging, applications,
  endorsements — is intentionally out of scope for this pass.
- **Scaffolded, not complete**: Regulatory Change Monitoring's scheduled scan (Epic 7 — no job
  scheduler exists, so alerts are pull/computed, not pushed — see `src/compliance/routes.ts`),
  Remuneration & Payouts (Epic 8 — no cap auto-calculation from financials), Document Management &
  E-Signature (Epic 10 — no object-storage or CSP integration). No frontend screens yet for the
  new Epic 5/6/7 endpoints (voting, minutes directory, compliance search) — API-only so far.
  Off-agenda-item blocking + 100%-unanimous-addition override and virtual-attendance
  recording-retention enforcement are also not built. Each module's source file says explicitly
  what's built vs. deferred.
- **Not started**: e-signature CSP integration, encrypted object storage, PDPL compliance
  paperwork (DPO registration, processing license, DPIA — these are organizational/legal steps,
  not code).

## Architecture

- **apps/api** — Node.js/TypeScript, Fastify, Prisma/PostgreSQL. Tenant isolation is enforced at
  the database layer via row-level security (not just application filtering) — see
  `prisma/migrations/*_row_level_security`. Every governance write goes through the Resolution
  Engine (`src/resolutions/engine.ts`); nothing writes Board/Committee/Capacity tables directly.
- **apps/web** — React/TypeScript/Vite, Apple HIG-inspired design system (design tokens in
  `src/styles/tokens.css`).
- **packages/shared** — the roles → privileges matrix and governance enums, shared between API and
  (future) frontend authorization checks.

## Running locally

Prerequisites: Node 22+, pnpm, PostgreSQL 16.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # then point DATABASE_URL at your Postgres instance
pnpm --filter @bord/api prisma:migrate    # applies schema + RLS policies
pnpm --filter @bord/api seed              # seeds default regulatory rules
pnpm dev:api                              # http://localhost:4000
pnpm dev:web                              # http://localhost:5173 (proxies /api to the server above)
```

The Postgres role the API connects as (`bord_app` in `.env.example`) must NOT be a superuser and
must not have `BYPASSRLS` — that's what makes the tenant-isolation guarantee real. See the RLS
migration for the exact grants.

The very first entity onboarded has nobody yet holding board privileges to convene a meeting;
`POST /entities/:id/governance/board/seed-initial-capacity` (platform-admin only) seeds the first
board/compliance-officer capacities through the same Resolution Engine everything else uses, and
closes itself once the board passes composition validation once.

## Deploying to production

Nothing is deployed yet — this section is a handoff, not a description of a live environment.
The app is deploy-ready (`apps/web` builds a static SPA with no sourcemaps, route-level code
splitting, and no dev-only branding; `apps/api` is a plain Fastify server), but *where* it runs and
what domain it answers on are your choices, not something buildable in this environment — there's
no hosting account or DNS access here to provision. Steps:

1. **Host the API** (`apps/api`) anywhere that runs a long-lived Node process against your
   PostgreSQL instance — a container platform, a VM, a managed Node host. Set `DATABASE_URL`,
   `JWT_SECRET`, `NODE_ENV=production`, and `PORT`; run `pnpm --filter @bord/api exec prisma
   migrate deploy` against production before first boot (`migrate deploy` applies committed
   migrations non-interactively — `prisma:migrate`/`migrate dev` above is for local development
   only), then `pnpm --filter @bord/api build && pnpm --filter @bord/api start`
   (or keep running it via `tsx` if you prefer not to add a build step).
2. **Host the web app** (`apps/web`) as a static build: `pnpm --filter @bord/web build` produces
   `apps/web/dist/`. Any static host works (the app is a client-rendered SPA with client-side
   routing) — configure it to serve `index.html` for any path that doesn't match a real file, so
   deep links like `/professionals/jane-doe` don't 404 on a hard refresh.
3. **Wire up the reverse proxy / routing rules**, at whatever layer sits in front of both:
   - `/api/*` on the web origin → the API server, with the `/api` prefix stripped (mirrors the
     Vite dev proxy in `apps/web/vite.config.ts`).
   - `/sitemap.xml` on the web origin → the API's `GET /sitemap.xml` directly (not under `/api`) —
     robots.txt and the SEO checklist both expect it at the site root. See the comment in
     `apps/api/src/public/routes.ts`.
   - Everything else → the static web build, with the SPA fallback from step 2.
4. **Connect your domain**: point the domain's DNS (an A/ALIAS record, or a CNAME if your host
   issues one) at whatever the static host or reverse proxy gives you, and provision TLS there —
   both are host-specific steps only you can complete, since it requires your own DNS registrar
   and hosting account. Nothing in the app hardcodes a domain: `useDocumentHead` derives canonical
   URLs, Open Graph tags, and JSON-LD `url`/`sameAs` fields from `window.location.origin` at
   runtime, so the same build works under any domain without a rebuild.
5. **Before calling it live**: confirm `<your-domain>/robots.txt`, `/llms.txt`, and `/sitemap.xml`
   all resolve (the last one only works once step 3's routing rule is in place); share a public
   profile or company URL somewhere that renders Open Graph previews (Slack, X, iMessage) and
   confirm the card image and title look right; and tighten `apps/api/src/index.ts`'s CORS
   registration (currently `origin: true`, permissive for local development) to your actual web
   origin.
