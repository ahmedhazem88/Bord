# Bord

Governance platform for FRA-regulated non-bank financial entities (Phase 1) — insurance, leasing,
factoring, mortgage finance, microfinance, and brokerage firms in Egypt. See the project's PRD and
MVP spec (in the originating conversation/docs) for the full product and legal requirements this
build implements.

## Status

This is the Phase 1 architectural foundation, built in build-sequence order (PRD section 12):

- **Done**: data model + Resolution Engine + hash-chained AuditLog; tenant-isolated auth with
  role-appropriate MFA; Identity/Capacity (Epic 1) and Registration/Verification (Epic 2); the
  Governance Structure Builder with composition-rule enforcement (Epic 3); a working React
  frontend for the flows above.
- **Scaffolded, not complete**: Meeting & Conferencing (Epic 5 — no live quorum/vote-tally engine
  yet), Regulatory Calendar & Change Monitoring (Epics 6–7 — no reminder/scan jobs yet),
  Remuneration & Payouts (Epic 8 — no cap auto-calculation from financials), Document Management &
  E-Signature (Epic 10 — no object-storage or CSP integration). Each module's source file says
  explicitly what's built vs. deferred.
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
