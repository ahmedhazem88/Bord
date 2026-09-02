# Bord

A governance management platform for FRA-regulated non-bank financial entities in Egypt —
insurance, leasing, factoring, mortgage finance, microfinance, and brokerage firms. It organizes
governance procedures for a governance body's own institutions (General Assembly, Board,
committees): formation, appointment, and authorization; scheduling by whoever has that right under
law and bylaws (Chairman, Vice Chairman, committee chairs, or a qualifying number of members);
agenda management with automatic review against applicable law and the entity's own governing
documents; meetings/conferencing, voting, and context-based quorum management; resolutions
management and how a passed resolution reflects prospectively onto the structure; remuneration;
and searchable, smart documentation and archiving. Every governance role carries its own privileges
and actions.

In parallel, Bord is a professional network: companies search for and hire governance
professionals — board members, committee members — directly into their governance structure, with
"hire" starting the same real appointment process as any other appointment.

See the project's PRD and MVP spec (in the originating conversation/docs) for the full product and
legal requirements this build implements.

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
  minutes — auto-generated (from only the finalized agenda), circulated for member verification
  (approve / request changes, blocking signature while an objection is open), dual-signed,
  FRA/GAFI submission tracking, and a searchable directory (date range, keyword, free text); a
  Secretary agenda-preparation tool — board/committee members propose agenda items (or submit them
  as the initiator alongside a MeetingRequest), each automatically checked against the entity's own
  governing documents (Articles of Association, Bylaws, Shareholders' Agreements, other agreements,
  covenants, warrants) and applicable regulatory rules, flagging anything relevant for the
  Secretary/Chairman to review before confirming or rejecting it onto the final agenda — plus a
  meeting "pack" bundling the confirmed agenda, supporting documents, quorum, and roster (the
  pull-based stand-in for "sent with the invitations," consistent with this build having no
  push/email infrastructure). NOTE on that review: it's real, working, deterministic term-matching
  against the entity's actual governing-document text — not a language-model call, since no LLM
  provider credential is configured for the application to call at runtime. The function it runs
  behind (`agenda/review.ts`) is written as the seam a real LLM-based semantic reviewer could sit
  behind later, if a provider key is ever supplied. A compliance-assistant search endpoint across
  obligations/rules/minutes/resolutions plus a computed 30/14/3-day escalating-alerts endpoint
  (Epics 6–7); a working React frontend for the earlier (Epic 1–3) flows; a public professional
  network (PRD roadmap Phase 4, brought forward) — opt-in public profiles for professionals and
  publicly-listed company pages, backed by RLS policies that only widen what's visible under
  explicit PDPL consent, with real SEO (per-route meta/canonical/OG/JSON-LD, a dynamic sitemap,
  robots.txt/llms.txt, a custom 404) and a self-service publish/withdraw UI on the dashboard and
  entity page. The full marketplace layer beyond that — search/filters, messaging, applications,
  endorsements — is intentionally out of scope for this pass; hiring itself (below) is not.
- **Governance re-scope**: onboarding establishes a company's actual current governance structure
  (board, committees, GA/shareholders with share percentages) as the baseline in one resolution,
  replacing the old one-role-at-a-time bootstrap; Committee Chairs (a `CommitteeMembership.isChair`
  fact, independent of their base board role) can schedule their own committee's meetings, not just
  Chairman/Vice Chairman/MD/Secretary; multi-stage resolution approval chains (Financial Statements
  and Budget approval: Audit Committee, then Board, each a real resolution voted at its own body's
  own meeting) are configurable per entity from their bylaws via the same RegulatoryRuleOverride
  mechanism as every other bylaw-configurable rule, not hardcoded special cases; and hiring a
  professional-network profile into an entity's governance structure creates a real proposed agenda
  item that, once the Secretary confirms it, auto-creates the DRAFT appointment resolution the board
  votes on — the same appointment path as any other, not a side channel.
- **Gap-audit remediation** (checked against the actual MVP spec/PRD documents, not a
  paraphrase — see commit history from "Fix three confirmed spec violations..." onward): fixed
  three active correctness bugs (MFA was mandatory only for Chairman/Compliance Officer/Platform
  Admin instead of every user; a Chairman/MD-separation check that could never fire; a `/pass`
  endpoint that let a meeting-bound resolution be force-passed with zero votes cast); closed the
  Epic 2 gap where verification documents were unvalidated free text (now a real checklist enum
  gating approval); closed the Epic 3 gap where mandatory committee types, non-executive-chair,
  and minimum-independent-count were unenforced. Epic 5 gained everything the audit found
  genuinely missing and buildable without an external integration: an `AUDITOR` role (previously
  didn't exist at all) with its specific OGM convocation right; off-agenda-item blocking with both
  override paths (Chairman's mid-meeting flag, 100%-unanimous addition); majority-by-resolution-type
  derivation (was a free-text field a caller could set to anything — a capital-reduction resolution
  could legally pass by simple majority); GA meeting roles (secretary + two vote counters, appointed
  by the Chairman); proxy grant/revoke/vote-as-proxy (JSC vs. LLC eligibility via the new
  `Entity.legalForm`, the non-board-shareholder-can't-proxy-to-a-board-member rule); and cumulative
  voting for board elections (its own module, `src/elections/`, since it's a genuinely different
  voting mechanism from the FOR/AGAINST/ABSTAIN/RECUSED Resolution model). Also fixed a real bug
  found while testing this: `requireCapability` checked only one arbitrarily-chosen capacity when a
  person held more than one at the same entity, instead of checking the grant across all of them.
  Epic 6 (Regulatory Calendar) and the Interest Registry half of Epic 9 (Compliance Guardrails) are
  now real, not just scaffolded: standing obligations (board-meeting cadence, annual OGM, FRA annual
  disclosure) seed at onboarding; FRA minutes-submission and, for OGM/EGM, GAFI-ratification
  obligations seed the moment minutes go FINAL; auditor-rotation, board term-limit, and
  interest-declaration-reconfirmation obligations seed at the actual appointment event through the
  Resolution Engine (`src/regulatory/obligations.ts`) — no job scheduler exists, so
  `syncOverdueObligations` persists the OVERDUE transition and audit-logs it on read, called from
  both the regulatory-obligations list and the compliance-alerts endpoint. `InterestDeclaration` now
  has full self-service creation/withdrawal (`src/interests/routes.ts`), entity-wide visibility for
  whoever sets the agenda, automatic agenda-item flagging against declared interests
  (`src/agenda/review.ts`), and a default-to-Recused vote for a matching declared interest — a soft,
  overridable default (`interestOverrideReason`) distinct from Art. 74's hard exclusion, logged as
  its own audit action when overridden (`src/resolutions/voting.ts`). Epic 8's remuneration cap is
  now real too: a `FinancialStatement` per entity per fiscal year (net distributable profit),
  recorded once a `FINANCIAL_STATEMENTS_APPROVAL` resolution reaches the terminal stage of its
  Audit-Committee-then-Board approval chain; the 10% board remuneration cap (already-seeded
  `RegulatoryRule`, AoA-overridable) is enforced at resolution-effect time for board-type
  remuneration — before the record is created, not after — and exposed live via
  `GET .../remuneration-cap-status` (`src/resolutions/engine.ts`, `src/remuneration/routes.ts`).
  Tax-withholding auto-computation is explicitly NOT built: it needs the actual applicable Egyptian
  withholding rate as a cited legal fact, which nothing given to this session specifies — `Payout`
  still carries a manually-set `withheldTaxAmount` (defaults to 0), same as before.
- **Scaffolded, not complete**: Regulatory Change Monitoring's scheduled scan (Epic 7) and Document
  Management's object storage (Epic 10) are unbuilt. No frontend screens yet for the Epic 5/6/8
  endpoints (voting, minutes directory, compliance search, elections, interest declarations,
  remuneration cap status) or for the agenda preparation tool, governing-documents library, and
  minutes circulation/verification — all API-only so far, verified
  via live end-to-end smoke tests rather than a UI. Virtual-attendance recording-retention
  enforcement, and the OGM/EGM invitation mechanics (newspaper publication, registered mail, GAFI/FRA
  copies, the 21-day notice window) are also not built — the latter needs a real decision on the
  entity's actual operational process, not just code. Each module's source file says explicitly what's
  built vs. deferred.
- **Not started**: e-signature CSP integration (minutes "signing" today is an in-app timestamp, not
  a cryptographic signature — the spec is explicit that the platform must never issue its own),
  encrypted object storage / KMS, PDPL compliance paperwork (DPO registration, processing license,
  DPIA — these are organizational/legal steps, not code).

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
`POST /entities/:id/governance/board/establish-initial-structure` (platform-admin only) establishes
the company's actual current governance structure — board appointments, GA members with their share
percentages, and committees with their memberships — as the baseline, in one bootstrap resolution
through the same Resolution Engine everything else uses, rather than one appointment at a time. It
closes itself once the board passes composition validation once; every change after that goes
through a real convened meeting and its own resolution.

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
