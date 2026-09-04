# AGENTS.md: bord

Instructions for any coding agent (Claude Code, Codex, Cursor, etc.) working in this repository. This is the canonical instructions file; [CLAUDE.md](CLAUDE.md) just points here. This is the v4 rebuild, extended in v5 with a credits-based earning model, forward-architected regulator/labor-office verification, independence-vs-representative director classification, voting-pattern conflict detection, and committee-level decision quorums. Several guardrails below are corrections to how an earlier version described something, not just additions, flagged explicitly so an agent working from memory of an earlier version doesn't carry a wrong belief forward.

## Project overview

bord is a multi-tenant SaaS platform for Egyptian corporate governance management: individual and company onboarding (including KYC, self-declared cross-company positions, and historical-minutes upload to seed the precedent database), board, committee, and phased general assembly scheduling, smart agendas with AI-generated discussion guides and pre-vote conflict checks, embedded conferencing and e-voting with topic/body-specific thresholds, a searchable precedent database, a minimal professional network and board/committee hiring module, a remuneration module (calculate-and-export, built for a later payment-execution phase), a standalone incentives layer where governance-positive activity across the platform, not remuneration alone, earns credits (redeemable through a corporate-partner catalog, cash redemption unlockable only by a platform-wide flag bord sets post-funding) rather than cash by default, governance-integrity features (independent-vs-shareholder-representative director classification with an advisory compliance check, voting-pattern conflict/abuse-of-power detection, and committee-level compositional decision quorums), and an AI-guided compliance engine built on Egyptian Companies Law 159/1981, Capital Market Law 95/1992, FRA Law 5/2022, FRA Decree 100/2020, the Egyptian Corporate Governance Code (EFSA Board Resolution 84/2016), FRA Decree 177/2023, FRA Decree 200/2025, the Central Bank and Banking Sector Law 194/2020 plus the CBE governance circular, and EGX disclosure rules. Read [PRD.md](PRD.md) for the product requirements, personas, and journeys, and [ARCHITECTURE.md](ARCHITECTURE.md) plus [ARCHITECTURE-ESSENTIALS.md](ARCHITECTURE-ESSENTIALS.md) for the technical design and its known weak points, and [DESIGN-PRINCIPLES.md](DESIGN-PRINCIPLES.md) for the interaction-design rationale, before making structural or UI changes.

## Tech stack

- Web: Next.js (React, TypeScript)
- Mobile: React Native (Expo, TypeScript)
- Backend: Node.js + NestJS (TypeScript), structured as internal modules (Core Governance, Rules Engine, AI Guidance, and the others listed below) inside one deployable at MVP scale (see ARCHITECTURE-ESSENTIALS.md, "What's over-engineered": do not split these into separate services until team size or load actually requires it)
- Database: PostgreSQL with row-level security (RLS) for tenant isolation
- Cache/queue: Redis + BullMQ
- Object storage: S3-compatible, Egypt/MENA-region pinned
- KYC verification: third-party vendor, integrated behind an internal interface (vendor not yet selected, ARCHITECTURE.md Section 7)
- API style: REST + OpenAPI

## Directory structure

```
bord/
├── PRD.md, ARCHITECTURE.md, ARCHITECTURE-ESSENTIALS.md, AGENTS.md, CLAUDE.md, README.md, DESIGN-PRINCIPLES.md
├── web/                         # Next.js app, one route folder per screen in ARCHITECTURE.md Section 2
│   ├── app/
│   │   ├── onboarding/          # /account, /profile, /kyc, /positions, /bank-details (Journey I, person-scoped, NOT under [capacity])
│   │   ├── profile/             # a person's own profile hub, reachable any time
│   │   │   └── credits/         # FR-53, person-level credit wallet, NOT under [capacity]
│   │   ├── [capacity]/
│   │   │   ├── home/
│   │   │   ├── onboarding/      # company onboarding wizard (Journey A), tenant admin only, first run
│   │   │   ├── structure/
│   │   │   │   ├── committees/[id]/decision-quorum/  # FR-60
│   │   │   │   └── capacities/[id]/independence/     # FR-57
│   │   │   ├── documents/
│   │   │   │   └── historical/  # FR-2a, historical minutes/resolutions upload and extraction review
│   │   │   ├── meetings/
│   │   │   │   └── [id]/{agenda,room,minutes}/
│   │   │   ├── compliance/{alerts,ask,calendar,precedent-search,certificate,conflict-flags}/  # conflict-flags new this pass, FR-58/FR-59, full-board visibility
│   │   │   ├── filings/
│   │   │   ├── people/
│   │   │   ├── portfolio/
│   │   │   ├── surveys/
│   │   │   ├── billing/
│   │   │   ├── settings/        # includes calendar-connection status, FR-45
│   │   │   ├── shareholders/
│   │   │   ├── postings/
│   │   │   └── remuneration/
│   │   │       └── payouts/
│   │   └── network/             # person-level, deliberately NOT under [capacity], see below
│   │       └── corporate-partners/  # FR-54/FR-55, platform-wide catalog, NOT under [capacity]
│   ├── components/
│   ├── lib/                     # API client, capacity-context helpers
│   └── public/
├── mobile/                      # React Native (Expo), mirrors web's screens, same sitemap
│   └── src/
│       ├── screens/
│       │   └── onboarding/      # mirrors web/app/onboarding/
│       ├── components/
│       └── lib/
├── backend/                     # NestJS
│   └── src/
│       ├── onboarding/          # individual onboarding: profile, kyc, self-declared-positions,
│       │                        # bank-details, profile-completeness, FR-49 through FR-52
│       ├── core-governance/     # companies, people, capacities, committees (incl. resolution-gated
│       │                        # discretionary committee creation, FR-47), meetings, agenda-items
│       │                        # (incl. discussion-topic-templates, FR-46), documents (incl.
│       │                        # historical-document extraction, FR-2a), votes, resolutions,
│       │                        # minutes, FR-1 through FR-15, FR-46, FR-47
│       ├── rules-engine/        # rule-versions, compliance-alerts, conflict-check-results,
│       │                        # compliance-certificates (voluntary tier, FR-48), FR-4, FR-6,
│       │                        # FR-20, FR-21, FR-22, FR-41, FR-44, FR-48
│       ├── ai-guidance/         # grounded Q&A, corpus management, discussion-guide generation,
│       │                        # pre-vote conflict check, precedent-search embeddings, onboarding
│       │                        # document extraction, FR-2, FR-2a, FR-19, FR-40, FR-43, FR-44
│       ├── scheduling/          # calendar-connections (Google/Microsoft 365 OAuth), slot-suggestion, FR-45
│       ├── filings/             # regulatory-filings, FR-16, FR-17, FR-18
│       ├── ga/                  # shareholders, meeting-requisitions, FR-29 through FR-31, FR-42
│       ├── network/             # network-profiles, job-postings, applications, FR-32 through FR-35
│       │                        # (deliberately one of two modules whose primary data is NOT
│       │                        # company-scoped, alongside onboarding, see ARCHITECTURE-ESSENTIALS.md Section 1)
│       ├── remuneration/        # remuneration-structures, payout-exports, FR-36 through FR-39
│       │                        # (export schema versioned for a future payment-execution phase,
│       │                        # PRD Section 15, do not build payout execution or cash-processing
│       │                        # logic itself); also owns the cash-execution half of a
│       │                        # CreditRedemption (FR-55), the one point where remuneration and
│       │                        # incentives connect, via PayoutExportLineItem.creditRedemptionId
│       ├── incentives/          # STANDALONE, new this pass, not nested under remuneration:
│       │                        # credit-transactions, corporate-partners, credit-redemptions,
│       │                        # platform-settings, FR-53 through FR-56. Credits are a general
│       │                        # governance-incentive ledger fed by multiple sources (a
│       │                        # RemunerationStructure schedule, meeting participation, timely
│       │                        # resolution execution, compliance-task completion, referrals),
│       │                        # not a remuneration-only mechanism, do not fold this back into
│       │                        # the remuneration module
│       ├── governance-integrity/ # director-category classification, independence compliance
│       │                        # checks, governance-conflict-flags, committee decision-quorum
│       │                        # config, FR-57 through FR-60 (advisory-only, see guardrails below)
│       ├── subscriptions/       # billing, FR-25
│       ├── auth/                # login, MFA, capacity-context resolution, FR-23
│       ├── notifications/       # bilingual email/SMS/push, FR-9
│       ├── audit-log/           # append-only, hash-chained AuditLogEntry
│       ├── common/              # RLS/tenant-isolation guards, shared middleware
│       └── models/              # one file per entity in ARCHITECTURE.md Section 4, types/schema only
│   └── migrations/
├── shared/                      # cross-cutting TypeScript types shared by web, mobile, backend
│   └── types/
└── tests/                       # cross-cutting integration/e2e tests (per-package unit tests live alongside code)
```

Each screen folder under `web/app/` and `mobile/src/screens/` corresponds to a row in ARCHITECTURE.md Section 2's screen inventory; when adding a new screen, add the row there first, and check whether it changes any of the interaction-design commitments in DESIGN-PRINCIPLES.md (target sizing, grouping, information ordering) rather than defaulting to a generic layout.

`web/app/network/*`, `web/app/onboarding/*`, and their mobile equivalents are deliberately not nested under `[capacity]`: they're the parts of the product that are not tenant-scoped by design (`NetworkProfile` and the individual-onboarding cluster, ARCHITECTURE-ESSENTIALS.md Section 1). Do not move these under a capacity-scoped route "for consistency": that would misrepresent them as company-private and break an intentional exception to tenant isolation in this codebase.

## Development setup

Intended commands (scaffold has no working logic yet, these are the commands the MVP build phase should wire up):

```
# backend
cd backend && npm install && npm run start:dev
cd backend && npm run migration:run
cd backend && npm test

# web
cd web && npm install && npm run dev

# mobile
cd mobile && npm install && npx expo start
```

## Coding conventions

- TypeScript everywhere, strict mode on.
- One NestJS module per bounded context (see directory structure above); do not let `core-governance`, `rules-engine`, and `ai-guidance` import each other's internals directly, communicate through defined service interfaces only, since this boundary is what lets them split into separate deployable services later without a rewrite (ARCHITECTURE-ESSENTIALS.md).
- Error handling: every API error returns a structured `{ code, message, details? }` body; never leak raw database errors to the client.
- Naming: `snake_case` for database columns, `camelCase` for TypeScript, matching entity/field names from ARCHITECTURE.md Section 4 exactly so the two documents stay in sync.
- All monetary values in EGP integer piastres (never floats), matching the pricing model in PRD.md Section 6.
- All timestamps server-generated and UTC-stored; never trust a client-supplied timestamp for anything that feeds a legal deadline calculation (notice periods, filing deadlines, vote-cast time), this follows directly from the offline/connectivity edge case in PRD.md Section 13.

## Data models

Full field-level definitions are in [ARCHITECTURE.md Section 4](ARCHITECTURE.md#4-data-models). Stub type files live in `backend/src/models/`, one per entity, keep these in sync with ARCHITECTURE.md Section 4 as the source of truth; if they diverge, update the doc in the same change, not just the code.

## Testing requirements

- Every functional requirement in PRD.md Section 12 needs at least one test that exercises its acceptance criteria, including the four individual-onboarding requirements (FR-49 through FR-52) and, new this pass, the credits/governance-integrity requirements (FR-53 through FR-60).
- **The credits/cash-redemption gate needs a specific adversarial test, not just a happy-path one**: attempt `POST /credits/redemptions` with `redemption_type: cash` while `PlatformSettings.cash_redemption_enabled` is false and assert it is rejected server-side, not merely hidden in the UI.
- **`GovernanceConflictFlag` visibility needs a specific test of the opposite shape from most tenant-data tests here**: assert that any active Capacity at the company (not just chairman/company_secretary/compliance_officer/system_admin) CAN read a company's flags, full-board visibility is the explicit decision this pass, and a regression that quietly re-restricts this is as much a bug as a leak in the other direction would be. Ordinary tenant isolation (a capacity at a DIFFERENT company cannot read them) still needs the standard adversarial test.
- **A `system_admin` capacity's proactive notification on a new `GovernanceConflictFlag` or independence `ComplianceAlert` needs its own test**, separate from the visibility test above: notification delivery and read-visibility are two different guarantees, and only the notification one is role-restricted.
- Every edge case in PRD.md Section 13 needs an explicit test, these are the cases most likely to be silently skipped by happy-path-only testing (concurrent agenda edits, idempotent vote retry, quorum-drop-before-vote, offline approval timestamp handling, cross-tenant data isolation, video SDK outage to roll-call fallback, KYC-vendor outage, historical-extraction conflicting with a manual entry).
- Every journey in PRD.md Section 9 needs an end-to-end test that walks the full flow, not just its individual steps in isolation, including Journey I (individual onboarding) end to end across its four separable steps.
- Tenant isolation (FR-24) is the one area that needs adversarial testing, not just positive-path testing: write tests that actively try to access another tenant's data and assert they fail, on every new endpoint. This now explicitly includes verifying that a company's API access to a candidate's onboarding data during Journey G stops at public profile and declared-position fields, and never reaches `Person.kyc_status` internals or `BankDetail`.
- Any AI Guidance Layer change needs its grounding-rate eval re-run before merge (PRD Section 10, Section 16 Phase 7 exit criteria), a change that improves fluency but lowers grounding rate is a regression, not an improvement. This applies to the onboarding document-extraction feature (FR-2, FR-2a) exactly as it does to the other four AI-Layer features.

## Guardrails specific to this project

- **Never hardcode a legal value** (quorum percentage, notice-period days, voting threshold, committee composition rule) directly in application code. All such values live in the `RuleVersion` table (ARCHITECTURE.md Section 4) with a `source_citation` and `confidence` field. If a value isn't yet in `RuleVersion`, add it there, do not inline it "temporarily."
- **Never let the AI Guidance Layer answer outside its grounded corpus.** If a change to the AI Q&A feature could cause it to generate an answer without a source citation, that change should be rejected, PRD Section 7 names this as the platform's top technical/reputational risk. The same standard applies to the onboarding document-extraction feature: an extracted fact is a proposal for a human to confirm, never an auto-applied change.
- **Any change to the auth or capacity-resolution flow needs the Identity & Auth edge cases in PRD.md Section 13 re-verified** (capacity-switch context leakage, deactivated-director historical-record integrity, shared-device vote attribution, invitation-acceptance identity matching against an existing individual-onboarding account) before merge.
- **Any change touching vote casting or minute approval needs the audit-log hash-chain re-verified**, these two actions are the platform's evidentiary core (ARCHITECTURE.md Section 8).
- **Never move personal data or documents to a non-Egypt/MENA storage region** without an explicit, documented PDPC cross-border-transfer license, this is a legal constraint, not a performance tradeoff to be made unilaterally (PRD Section 5). This applies with full force to `Person.national_id_hash`, KYC results, and `BankDetail`.
- **Never treat a "Medium" or "Low" confidence rule value (PRD Section 5 table) as settled.** If you're implementing logic that depends on one of these, flag it in the PR description and check PRD Section 17's Open Questions list for its current status. This applies with extra force to `bank_cbe` rules (most of the CBE rule set is Medium/Low confidence because CBE's own regulations library was inaccessible in two research passes now, ARCHITECTURE-ESSENTIALS.md's top red-team item) and, corrected this build, to the Art. 80 self-convening detail below.
- **Correction from the prior draft, read this even if you worked on an earlier version of this codebase: the `MeetingRequisition` self-convening behavior is NOT statute-confirmed.** An earlier version of this document described the board-level requisition default (one-third of directors, 10-day chairman non-response window, self-convening without chairman approval) as High confidence, quoted statutory text. Fresh research found only the one-third-of-directors trigger in the statute; the self-convening/response-window detail was not located and is now Low confidence (PRD Section 5, ARCHITECTURE-ESSENTIALS.md Section 2b). `MeetingRequisition.self_convening_enabled` must default to `false` and remain a company-configured setting, never a hardcoded `true`, and no UI copy or product logic should describe self-convening as a confirmed legal right.
- **A `RuleVersion` sourced from unconfirmed or administrative-practice-only claims (e.g. the 100%-attendance notice claim, PRD Section 5) must never be encoded as an actual enforced rule value.** This claim was re-examined and could not be confirmed as either statute or documented administrative practice, do not encode it, and do not describe it in product copy as settled practice.
- **`ConflictCheckResult` (FR-44) and `discussionGuideContent` (FR-40) are advisory-only, never blocking.** An unacknowledged or missing conflict-check result must never prevent publishing an agenda item or opening a vote, it only gates a warning banner. Do not let UI copy or product logic imply a compliance sign-off.
- **`PayoutExport` line items must be computed per-`Capacity`, not per-`Person`, then correctly aggregated.** A person holding two capacities at the same company has two `RemunerationStructure` rows and must not have a shared retainer double-counted or dropped in the export. Any change to this calculation needs test cases built from actual multi-capacity scenarios (ARCHITECTURE-ESSENTIALS.md's "what will break" list), not just generic unit coverage.
- **Remuneration payout execution is a stated Phase 2 feature, not a permanent exclusion, but it is not being built now.** `PayoutExport.schema_version` and `BankDetail`'s encryption standard exist specifically so a future payment-execution consumer doesn't require re-modeling this data (PRD Section 15). Do not add logic that initiates an actual money transfer in this build; a Phase 2 execution layer needs its own product and compliance review before any such code is written. Keep the data model consumable for that future layer, but do not build toward it beyond what's already specified in ARCHITECTURE.md.
- **`BankDetail` requires step-up authentication to view or export in unmasked form.** Never add a code path that returns unmasked bank-account or IBAN data without the fresh-MFA step-up check (ARCHITECTURE.md Section 8); log every access to `AuditLogEntry`.
- **`NetworkProfile` and the individual-onboarding cluster (`Person.kyc_status`, `SelfDeclaredPosition`, `BankDetail`) are the two parts of this system that are intentionally not tenant-isolated by `company_id`.** Never add RLS scoping or a `companyId` field to them, that reverses a deliberate one-way-door decision (ARCHITECTURE-ESSENTIALS.md Section 1). Conversely, never let a `companyId`-scoped table's data leak into either of them or their API responses. A company's read access to a candidate's onboarding data is limited to public profile fields and declared positions relevant to an active independence check (Journey G), never `kyc_status` internals or `BankDetail`.
- **`SelfDeclaredPosition` must never be presented in the UI as equivalent to a verified `Capacity` record.** The "self-declared, unverified" label is the platform's only defense against a false cross-company claim, since no external registry exists to check declarations against (PRD Section 5, reconfirmed). Do not soften, hide, or make this label less prominent than a verified badge in any screen or export.
- **A discretionary `Committee` (investment, steering, other) is never instantiated without a passed `enablingResolutionId`.** Required committees (audit/risk/governance/nomination_remuneration) come from the regulatory-profile taxonomy at onboarding and never need one, don't add a code path that creates a discretionary committee type without a resolution behind it (FR-47).
- **`CalendarConnection.oauthRefreshTokenRef` is a reference into the secrets manager, never the raw token.** Do not add a field or log line that stores or prints an actual OAuth refresh/access token in the application database or logs (ARCHITECTURE.md Section 8). Calendar scope is read-only free/busy, never request or use write/modify access to a connected calendar.
- **Historical-document extraction (FR-2a) writes to `ExtractedFact`, never directly to `Resolution`, `Capacity`, or any live entity, until a human confirms it.** A confirmed `historical_resolution` fact creates a `Resolution` row with `source = historical_import`, keep this distinguishable from `source = live_meeting` in every query and UI surface that reads precedent data, so a future feature never conflates seeded history with a real vote.
- **`PlatformSettings.cash_redemption_enabled` is a platform-wide flag, never a per-company or per-user setting.** Do not add a `companyId`-scoped override, a feature flag, or any code path that lets a tenant enable cash redemption independently of the platform flag. Setting it is an operational action bord's own ops team takes once, not a product feature a company configures.
- **`CreditRedemption` of `redemptionType: 'cash'` must be rejected at the API layer whenever `PlatformSettings.cashRedemptionEnabled` is false.** This is a server-side check, not a UI-only restriction; never implement it as "hide the cash-redemption button" alone (FR-53, PRD Section 15).
- **Never present `Capacity.directorCategory: 'shareholder_representative'` as a regulated legal status the way `'independent'` is.** Egyptian regulation affirmatively defines independence (PRD Section 5); it does not define "shareholder representative", that label is platform-defined. Any UI copy, export, or API response that describes both categories with equal evidentiary weight is a compliance-accuracy bug, not a style issue.
- **`Capacity.independenceComplianceStatus` and every `GovernanceConflictFlag` are advisory-only, by explicit product decision (ARCHITECTURE-ESSENTIALS.md Section 1), never blocking.** Never add a code path that prevents saving a `Capacity`, casting a `Vote`, or finalizing a `Resolution` because of a `'flagged'` independence status or an open `GovernanceConflictFlag`. If a future requirement asks for enforcement, that is a new product decision requiring its own review, not an extension of this build.
- **`GovernanceConflictFlag` visibility is full-board, not role-restricted, by explicit decision this pass.** Any active Capacity at the company can read the company's flags, ordinary tenant isolation applies, no additional role gate does. Do not add a role-based read restriction narrowing this "for consistency" with `BankDetail`'s step-up-auth pattern, this entity was deliberately decided the opposite way. What IS role-restricted is the proactive notification: a `system_admin` capacity is notified on every new flag or independence-criteria `ComplianceAlert`, in addition to (never instead of) full-board visibility, do not conflate the notification list with the read-access list.
- **Credits are a standalone incentive ledger, not a remuneration-module feature, by explicit decision this pass.** `CreditTransaction`, `CorporatePartner`, `CreditRedemption`, and `PlatformSettings` live in a dedicated `incentives` module. Do not add a direct import from `remuneration` into `incentives` or vice versa beyond the one documented connection point (`CreditRedemption` → `PayoutExportLineItem.creditRedemptionId` for cash-execution), and do not assume every `CreditTransaction` has a `companyId`/`capacityId`/`remunerationStructureId`, several reasons (`referral_bonus`, `compliance_task_completion`, `manual_adjustment`) are deliberately not company-tied.
- **`ExternalVerificationCheck.status` may only ever be `not_available` or `pending_integration` in this build.** No code path may set `checked_match`, `checked_discrepancy`, or `checked_no_data`, and no UI surface may present a `SelfDeclaredPosition` as externally verified. This entity is a forward architecture provision (PRD Section 5/17), not a partially-built integration; treat any change that starts calling out to an actual external source as a new integration requiring its own security and legal review, not a natural extension of this stub.
- **`Committee.decisionQuorum` is company policy, not a legal rule.** Never create a `RuleVersion` row for it or give it a `source_citation` other than `'company_policy'`, and never imply in UI copy that a specific quorum percentage is legally required, Egyptian regulation was searched this pass and found no committee-level minimum-independent-votes-to-pass provision (PRD Section 5).
- **`Resolution.compositionQuorumMet` and `Resolution.quorumMet` are two independent gates.** A committee resolution governed by a `decisionQuorum` cannot have `outcome: 'passed'` unless both are true; do not let a change to one gate's logic silently affect the other.
- **UI/UX changes should be checked against [DESIGN-PRINCIPLES.md](DESIGN-PRINCIPLES.md) before being treated as a free styling choice.** Several interface decisions already made in ARCHITECTURE.md Section 2 (the unverified-label prominence, full-board conflict-flag visibility without alarm styling, the meeting room's full-screen takeover, profile-completeness always visible) are direct applications of a named heuristic, not arbitrary layout preferences; changing the layout without reading the rationale risks quietly reversing a compliance or trust decision along with the visual one.

## When requirements are ambiguous

Flag and ask, don't silently assume, especially for anything touching a legal/compliance value. PRD.md Section 17 (Assumptions & Open Questions) is the current list of known-unresolved items; check there first. If the ambiguity isn't already listed, add it rather than guessing a default and moving on.
