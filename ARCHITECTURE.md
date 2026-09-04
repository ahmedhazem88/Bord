# bord: Architecture

Companion to [PRD.md](PRD.md). Written for the engineer building this, not a manager skimming it. Every decision below traces back to a PRD persona, journey, functional requirement, edge case, or regulatory finding: cross-references are inline. This is the ground-up v4 architecture, written alongside PRD v4; the two most substantial changes versus the prior draft are the individual-onboarding data model (Section 4) and the remuneration export schema's Phase 2 consumability requirement (Section 4, `PayoutExport`).

---

## 1. System Overview

```
                         +-------------------------------+
                         |   Web app (Next.js)            |
                         |   Mobile apps (React Native)   |
                         +---------------+-----------------+
                                         | HTTPS / REST (OpenAPI)
                         +---------------v-----------------+
                         |   API Gateway / BFF (NestJS)     |
                         |   AuthN/AuthZ, capacity           |
                         |   context resolution              |
                         +---+---------+---------+-----------+
              +--------------+         |         +--------------+
   +----------v----------+  +----------v---------+  +-----------v----------+
   |  Core Governance    |  |  Rules Engine        |  |  AI Guidance Layer    |
   |  Service             |  |  (versioned, per-law |  |  (RAG over curated    |
   |  companies, people,  |  |  rule profiles,       |  |  Egyptian-law corpus, |
   |  capacities, meetings,| |  independent of AI:   |  |  citation-only,        |
   |  agendas, votes,      |  |  Section 7 dependency |  |  never freeform)       |
   |  minutes, documents,  |  |  isolation)            |  |                       |
   |  individual onboarding|  |                        |  |                       |
   +----------+-----------+  +----------+-------------+  +-----------+-----------+
              |                          |                            |
   +----------v-----------+  +----------v-------------+  +-----------v-----------+
   | PostgreSQL (RLS,       |  | Redis (queues,          |  | Object storage          |
   | tenant-isolated)       |  | scheduling cache,        |  | (Egypt/MENA region,     |
   | + hash-chained          |  | sessions)                 |  | encrypted at rest:      |
   | audit log table         |  |                           |  | PRD Section 5)          |
   +-------------------------+  +---------------------------+  +-------------------------+

   External: Video/e-voting SDK (region-compliant) . SMS/Email provider . LLM API (RAG-only) . KYC verification vendor (new this pass)
```

**In one paragraph:** the frontend (web and mobile) talks to a single API layer that resolves every request through the caller's *active capacity* (which company, which role: PRD Persona 2) before touching any data, enforcing tenant isolation at the query layer via Postgres row-level security, not just application logic. Governance data (meetings, votes, minutes, documents, shareholders, remuneration, job postings) lives in the Core Governance Service, as clearly-bounded internal modules rather than separate services at MVP scale (AGENTS.md, ARCHITECTURE-ESSENTIALS.md). Individual onboarding and its person-scoped data (KYC status, self-declared positions, bank details) live in the same service but in tables deliberately outside the tenant/RLS boundary, since a person's identity exists before and across any company relationship (Section 8). Legal-compliance logic, spanning Companies Law, FRA, CBE, and EGX rule sets, lives in a separate Rules Engine service whose rule values are versioned, per-company-profile data, not hardcoded constants: this directly reflects PRD Section 5's finding that several legal values, including the Art. 80 self-convening detail and most CBE-specific ones, are unverified and must be correctable without a code deploy. The AI Guidance Layer is architecturally isolated from the Rules Engine specifically so an LLM/API outage never takes down core compliance monitoring, and serves the discussion-guide generator, the pre-vote conflict check, precedent-search embeddings, and the onboarding document-extraction step (both journeys): all four inherit the same grounded-only, human-confirmed, degrade-gracefully design (PRD Section 7, Section 13).

## 2. Information Architecture

### Screen/page inventory (drives the scaffold's route folders, Section 7f)

| Screen | Shows | Needs from user | Journey/Persona link |
|---|---|---|---|
| Login / MFA | Auth entry | Credentials + MFA code | All |
| **Individual onboarding: account** *(new)* | Account creation entry point | Email/phone, password | Journey I step 2 |
| **Individual onboarding: profile** *(new)* | Personal/professional info form | Name, contact, national ID, bio, expertise | Journey I step 3, FR-49 |
| **Individual onboarding: KYC** *(new)* | KYC verification step, visually distinct from any capacity-verification badge | Document capture/upload, liveness check (vendor-dependent) | Journey I step 4, FR-50 |
| **Individual onboarding: declared positions** *(new)* | List of self-declared board/committee/GA positions across every company | Add/edit position entries (company name, role, dates) | Journey I step 5, FR-51 |
| **Individual onboarding: bank details** *(new)* | Encrypted bank-detail capture for remuneration | Bank name, account/IBAN, currency | Journey I step 6, FR-52 |
| **Profile completeness** *(new)* | Indicator across the four onboarding steps above, each independently completable | Navigate to any incomplete step | Journey I step 7 (friction point) |
| Capacity switcher | List of the user's company+role contexts | Selection | Persona 2, 6: multi-capacity |
| Home dashboard (per capacity) | Upcoming meetings, pending votes, compliance alerts, board snapshot | (none) | All personas |
| **Company onboarding wizard** | Step-by-step company setup | Regulatory profile, AoA/SHA/bylaws/register/tax-certificate upload, **historical minutes and resolutions upload** | Journey A, FR-1, FR-2, FR-2a |
| Governance structure builder | Org chart of board/committees, capacities; required committees pre-populated from the regulatory-profile taxonomy, discretionary committees shown only once their enabling resolution has passed | Add/edit people, roles, dates (attaches to an existing individual identity where one exists); propose a discretionary committee | Journey A, FR-3, FR-4, FR-47 |
| Document vault | AoA, SHA, bylaws, commercial register, board packs, **historical minutes/resolutions archive** | Upload, tag, version | FR-2, FR-2a |
| Meeting scheduler | Proposed dates, availability heatmap, conflict flags, 2 to 3 concrete slot options computed from synced calendars + standing timing preferences | Date selection, invitee list | Journey B, FR-5, FR-6, FR-45 |
| Agenda builder | Draft agenda, suggested items, carried-over actions, browsable topic taxonomy with preset template language, personalized to the company's own frequent topics | Add/edit/attach items; pick a taxonomy topic or start from scratch | Journey B, FR-7, FR-8, FR-46 |
| Meeting room (live) | Video, live quorum meter, agenda walkthrough, voting panel | Join, vote, recuse | Journey C, FR-10 to FR-13 |
| Minutes review | AI-drafted minutes, edit/approve controls | Approve/amend | Journey C/D, FR-14, FR-15 |
| Compliance Center: Alerts feed | Severity-tiered violations/warnings | Acknowledge/resolve | Journey E, FR-20 to FR-22 |
| Compliance Center: AI Q&A | Chat interface, cited answers, including explicit "unconfirmed" answers for the Section 5-downgraded claims | Ask question | Journey E, FR-19 |
| *(all meeting/agenda/alert screens above)* | *filtered to the committees the active capacity belongs to when that capacity is committee-scoped, not full-board* | (none) | Persona 4, FR-23 |
| Regulatory calendar | Upcoming filing deadlines | (none) | Journey D, FR-16 |
| Filing exports | Filing-ready document list | Download/export | Journey D, FR-17 |
| People & capacities admin | All people across the tenant, their roles | Invite, edit, deactivate | FR-3, FR-23 |
| Multi-entity/tenant switcher | Portfolio of companies (group or multi-client admin) | Switch context | Persona 6, group-tenant model |
| Board evaluation surveys | Periodic self-assessment | Respond | FR-27 (Could) |
| Billing & subscription | Plan tier, invoices | Manage plan | FR-25 |
| Settings (accessibility, language, notification preferences, calendar connections) | Text size, AR/EN toggle, per-channel/per-language notification settings, connected-calendar status | Configure; connect/disconnect a calendar | FR-9, FR-45, Persona 3 |
| Shareholder registry | Shareholding percentages, verification status (verified vs. registrar-pending) | Add/update holdings | Journey F, FR-29 |
| GA meeting scheduler/room/minutes | Same screens as board meetings, rendered with shareholding-weighted quorum/voting when meeting type is OGM/EGM | Same as board flow | Journey F, FR-30 |
| Precedent search | Full-text/semantic search over the company's own past meetings, agenda items, resolutions, seeded at onboarding | Search query | Journey B/C, FR-43 |
| *(agenda builder + meeting room, extended)* | *discussion guide (law/AoA excerpts, precedent, prompts) and the pre-vote conflict-check advisory flag, shown inline on each substantive item* | Acknowledge flag | Journey B step 5, FR-40, FR-44 |
| My network profile | Public professional profile: disclosed positions, verified vs. self-declared independence status, sourced from Capacity records and FR-51 declarations | Edit bio/expertise, set visibility | Journey G, Persona 8, FR-32 |
| Board/committee-seat postings: browse (public) | Open postings across companies on bord | Apply | Journey G, Persona 8, FR-33/FR-34 |
| Board/committee-seat postings: manage (company) | A company's own open/filled postings, applicants | Create posting, review/accept applicants | Journey G, Persona 1, FR-33/FR-34/FR-35 |
| Remuneration structure & approval | Proposed retainer/fee rates, attendance-based calculation, approval status | Propose, vote (reuses e-voting) | Journey H, FR-36/FR-37/FR-38 |
| Remuneration payout export | Approved period, exportable payout file, using the recipient's bank details from individual onboarding | Export | Journey H, FR-39 |
| Compliance score & certificate (voluntary tier) | Current self-certified score against the mandatory-tier rule set, exportable certificate | Opt in, export | Journey A step 8, FR-48 |
| **My credits wallet** *(new)* | Credit balance, earn-event ledger with source (retainer/meeting fee/committee premium), person-level not company-scoped since a portfolio NED earns credits across multiple capacities | (none) | Journey H (extended), FR-53 |
| **Corporate partner catalog & redemption** *(new)* | Platform-wide partner offers, credits required per offer; a cash-redemption option, disabled until PlatformSettings.cash_redemption_enabled | Redeem against a partner offer, or request cash once enabled | Journey H (extended), FR-54/FR-55 |
| **Capacity: independence classification** *(new)* | A capacity's director category (independent/shareholder-representative/executive/non-executive-other), represented shareholder where applicable, and its computed independence-compliance status with the specific criterion that failed, if any | Set/edit category, set represented shareholder | Journey A/G (extended), FR-57 |
| **Compliance Center: conflict flags** *(new)* | Governance conflict flags, pattern-level and incident-level, with the related resolutions/capacities and detection note; visible to every capacity at the company (full-board transparency, decided explicitly this pass), review/status-set actions available to any capacity but expected in practice to be exercised by compliance_officer/chairman/company_secretary | Review, mark reviewed/dismissed with a note | Journey E (extended), FR-58/FR-59 |
| **Committee: decision quorum config** *(new)* | A committee's current composition-quorum setting (minimum independent-member votes, count or percentage) | Set/edit quorum | Journey A (extended), FR-60, part of the governance structure builder's committee detail view |

### Navigation model

- **Web:** persistent left sidebar scoped to the active capacity (sections: Home, Meetings, Compliance, Documents, People, Settings), with a top-bar capacity/tenant switcher always visible: switching capacity re-scopes the entire sidebar and clears any cached data from the previous context (Edge case, PRD Section 13, Identity & auth). Individual-onboarding and profile screens sit outside this capacity-scoped shell entirely, reachable from a persistent "My Profile" entry point, since a person's identity is not a company context (Section 8).
- **Mobile:** bottom tab bar mirroring the same top-level sections (Home, Meetings, Compliance, Documents, Profile), with the capacity switcher reachable from the Profile tab and from a header control: optimized for Persona 2 and Persona 3's low-friction, time-poor usage pattern. The Profile tab is also where individual onboarding lives, so a person completing it isn't forced into a company context first.
- **Meeting room** is a modal/full-screen takeover on both platforms, not nested in normal navigation, since it's the single highest-stakes, time-pressured screen (PRD Persona 3 churn driver: minimal taps under pressure).

Sitemap (simplified):

```
/login
/onboarding/account                  (individual onboarding entry, Journey I)
/onboarding/profile                  (FR-49)
/onboarding/kyc                      (FR-50)
/onboarding/positions                (FR-51)
/onboarding/bank-details             (FR-52)
/capacity-switch
/{capacity}/home
/{capacity}/onboarding/*             (tenant admin only, first run, Journey A)
/{capacity}/structure
/{capacity}/documents
/{capacity}/documents/historical     (FR-2a, precedent-seeding upload)
/{capacity}/meetings
/{capacity}/meetings/{id}/agenda
/{capacity}/meetings/{id}/room
/{capacity}/meetings/{id}/minutes
/{capacity}/compliance/alerts
/{capacity}/compliance/ask
/{capacity}/compliance/calendar
/{capacity}/filings
/{capacity}/people
/{capacity}/portfolio
/{capacity}/surveys
/{capacity}/billing
/{capacity}/settings
/{capacity}/shareholders
/{capacity}/compliance/precedent-search
/{capacity}/postings
/{capacity}/remuneration
/{capacity}/remuneration/payouts
/{capacity}/compliance/certificate
/{capacity}/compliance/conflict-flags     (FR-58/FR-59, full-board read access)
/{capacity}/structure/committees/{id}/decision-quorum   (FR-60, part of the governance structure builder)
/{capacity}/structure/capacities/{id}/independence       (FR-57, part of the governance structure builder)

# Person-level, not company-scoped: deliberately cross-tenant (PRD Section 13, multi-tenancy edge case)
/profile                             (a person's own onboarding/profile hub, reachable any time, not just at signup)
/profile/credits                     (FR-53, wallet + ledger)
/network/profile/{personId}
/network/postings
/network/postings/{id}/apply
/network/corporate-partners          (FR-54/FR-55, platform-wide catalog + redemption)
```

A mobile-only, low-bandwidth persona (Persona 2, often on the move) argues against a heavy initial payload on Home: the dashboard loads summary cards first and defers full meeting-history/document-list fetches. A senior, low-tech persona (Persona 3) argues against deep navigation nesting: every routine action (approve agenda, cast vote) is reachable in 2 taps or fewer from Home via direct action cards. The `/onboarding/*` and `/network/*` routes sit outside the `{capacity}` namespace deliberately: they're the parts of the product that are not tenant-scoped by design (ARCHITECTURE-ESSENTIALS.md), so putting them under a capacity prefix would misrepresent them as company-private.

## 3. Tech Stack

Biased toward boring, proven technology: a lean early-stage team building a legally-sensitive product cannot afford novel-stack risk on top of legal-accuracy risk.

| Layer | Choice | Why |
|---|---|---|
| Web frontend | Next.js (React, TypeScript) | Mature, huge hiring pool, server-side rendering helps the bilingual/RTL SEO-light but performance-sensitive dashboard; shares component/type patterns with the mobile app's React Native code |
| Mobile | React Native (Expo) | Single codebase for iOS/Android fits the lean-team, MVP-fast constraint; shares TypeScript types and API client with the web app |
| Backend API | Node.js + NestJS (TypeScript) | Structured, modular framework well-suited to a service-oriented backend; TypeScript end-to-end reduces type-mismatch bugs between a small team's frontend and backend work |
| Primary database | PostgreSQL | Strong relational integrity for governance records where referential correctness genuinely matters; native row-level security (RLS) is the mechanism for tenant isolation (Section 8 stress-test); mature audit/compliance tooling ecosystem |
| Cache / queue / sessions | Redis + BullMQ | Proven, simple job queue for scheduled compliance checks, reminder escalations, notification delivery, and now the async historical-document extraction jobs from onboarding (FR-2a) |
| Object storage | S3-compatible storage in an Egypt/MENA-capable region | PDPL cross-border transfer licensing makes region choice a hard architectural constraint, not a preference |
| Video/e-voting SDK | Licensed third-party SDK (evaluated for confirmed MENA/Egypt data-residency support) | Embed rather than build proprietary WebRTC infra, given the lean-team constraint; vendor selection criterion is data residency, not just feature set |
| KYC verification | Licensed third-party KYC/identity-verification vendor with Egyptian national-ID coverage (vendor selection pending, Section 7's dependency note) | Individual onboarding (Journey I, FR-50) needs a real identity-verification capability the platform should not build in-house; kept behind a thin internal interface so a vendor swap doesn't touch the onboarding flow's application logic |
| AI governance guidance | RAG over a curated, versioned corpus of Egyptian governance-law texts, via an LLM API | Grounded-only design is the core mitigation for the highest-flagged technical risk (wrong legal guidance); never freeform generation; the same pattern now also drives onboarding document extraction (FR-2), always human-confirmed |
| API style | REST + OpenAPI | GraphQL's flexibility isn't needed yet and adds operational complexity a lean team doesn't benefit from at this scale |
| Precedent search (FR-43) | PostgreSQL full-text search + `pgvector` extension for semantic search over meeting/agenda/resolution text | At MVP scale (one company's own history, a few hundred meetings at most, now seeded with historical data at onboarding), a dedicated search service is over-engineering |
| Calendar sync (FR-45) | Google Calendar API + Microsoft Graph (Outlook/365) via OAuth 2.0, behind a thin internal `CalendarProvider` interface | Two direct integrations cover the large majority of Egyptian corporates; the interface boundary means a third provider is a new adapter, not a scheduler rewrite |
| CI/CD | GitHub Actions | Standard, low-setup-cost for a small team |
| Hosting | Managed container platform in an Egypt/MENA-compliant region | Bias toward managed services over self-hosted orchestration given the lean-team constraint; region choice driven by PDPL, not cost alone |

## 4. Data Models

Every entity below corresponds to a functional requirement or journey step. Sensitive/regulated fields are flagged; these map directly to PRD Section 5's PDPL findings. Entities marked *(new)* did not exist in the prior draft.

**Person**
`id, full_name_ar, full_name_en, email, phone, preferred_language (ar|en), national_id_hash [sensitive: hashed, never stored raw], mfa_enabled, kyc_status (not_started | pending | verified | failed) [new this pass: distinct from any Capacity's verification, FR-50], kyc_verified_at [nullable], profile_completeness [computed, not stored: derived from whether personal_info, kyc, at least one declared position pass, and bank details each exist], created_at`

**SelfDeclaredPosition** *(new: FR-51)*
`id, person_id [FK], company_name_freetext, role_type_freetext, is_bord_tenant_company (bool) [computed: true only if the named company matches an actual Company record the person also has a real Capacity at; a true value here does not itself upgrade the declaration to "verified", only a real Capacity does], start_date, end_date [nullable], is_current (bool), declared_at, last_confirmed_at, withdrawn_at [nullable, Section 13 edge case: a withdrawn/amended declaration is versioned, not deleted]` : this is the mechanism Journey I step 5 and Journey G step 4 depend on; it is explicitly never treated as equivalent to a `Capacity` row in any independence or conflict check, and the UI's "self-declared, unverified" label (FR-32) reads directly off `is_bord_tenant_company = false` or the absence of a matching `Capacity`. New this pass: `ExternalVerificationCheck` rows reference a row here by `self_declared_position_id`, see below.

**ExternalVerificationCheck** *(new: FR-56, forward-architected only, PRD Section 5/17)*
`id, self_declared_position_id [FK], source (gafi_commercial_registry | fra_filings | egx_disclosure | nosi_social_insurance | labor_office), status (not_available | pending_integration | checked_match | checked_discrepancy | checked_no_data) [always not_available or pending_integration in this build, the checked_* values are reserved for a future integration this build never calls], checked_at [nullable], result_note [nullable], created_at` : exists so a future regulator-database or NOSI/labor-office integration slots in without a `SelfDeclaredPosition` schema change. Verified this pass that no such API exists today (PRD Section 5); this entity is a provision, not a partially-built integration, and no code path may set a checked_* status or present a declaration as externally verified (AGENTS.md guardrail).

**BankDetail** *(new: FR-52)*
`id, person_id [FK], bank_name, account_holder_name, account_number_encrypted [sensitive: encrypted at rest, decrypted only for export generation], iban_encrypted [nullable, sensitive], swift_code, currency, created_at, updated_at, last_accessed_at, last_accessed_by [audit trail for step-up-authenticated access, Section 8]` : scoped to remuneration-export use only (FR-39); no other feature in the system reads this table.

**Company** (tenant)
`id, legal_name_ar, legal_name_en, commercial_register_no, regulatory_profile (jsc | nbfi_leasing | nbfi_factoring | nbfi_microfinance | nbfi_insurance | nbfi_consumer_finance | bank_cbe), is_egx_listed (bool) [orthogonal overlay, not a mutually exclusive profile value: a bank_cbe company with is_egx_listed=true loads both the CBE rule set and the EGX disclosure overlay, PRD Section 5's dual-track finding], gafi_id, is_group_parent, parent_company_id [nullable, self-referential: group-tenant model], onboarding_history_seeded (bool) [new this pass: true once historical minutes/resolutions have been extracted and loaded into the precedent database, FR-2a], created_at`

**Capacity** (the multi-capacity join entity: PRD Persona 2, Section 5's core modeling requirement)
`id, person_id [FK], company_id [FK], role_type (chairman | md | executive_director | non_executive_director | independent_director | company_secretary | officer | committee_head | committee_member | head_of_internal_audit | mlro | compliance_officer | system_admin | other) [compliance_officer and system_admin new this pass, FR-59: compliance_officer is the expected workflow owner for reviewing GovernanceConflictFlag/independence-alert rows, NOT a visibility gate, visibility is full-board by explicit decision; system_admin is the company's own bord-tenant administrator, not a governance role, and is the one role that gets a proactive notification on a new flag], committee_id [nullable FK], committee_voting_member (bool, default true) [only meaningful when committee_id is set: distinguishes a voting committee member/head from a non-voting attendee/reporter, e.g. Persona 9's Head of Internal Audit], is_independent (bool) [unchanged since v3, kept for backward compatibility with existing committee-composition checks], director_category (independent | shareholder_representative | executive | non_executive_other) [nullable, new this pass, FR-57: never auto-set from role_type, see PRD Section 5, "independent" is a citable Egyptian-regulation category, "shareholder_representative" is a platform-defined label with no Egyptian statutory definition], represented_shareholder_id [nullable FK to Shareholder, new this pass: required to evaluate director_category = shareholder_representative against the independent-vs-representative opposition pattern, FR-58], independence_compliance_status (not_evaluated | meets_criteria | flagged) [new this pass, FR-57: computed by the rules engine against RuleVersion's independent_director_criteria rule, advisory only, never blocks the capacity], start_date, end_date [nullable], delegated_to_person_id [nullable: FR-26 delegated access], created_at`

**Committee**
`id, company_id [FK], type (audit | risk | governance | nomination_remuneration | investment | steering | other), name, mandate_source (fra_decree_100 | cbe_circular | eiod_code | internal), governance_duties_absorbed_into_audit (bool) [new this pass, PRD Section 5: reflects the reconfirmed FRA reading that governance duties may sit inside the audit committee rather than always standing alone], is_required (bool) [derived from the company's regulatory_profile at creation], enabling_resolution_id [nullable FK to Resolution: null for a required committee instantiated at onboarding from the taxonomy template, mandatory for a discretionary committee, FR-47], decision_quorum [nullable JSON: {min_independent_votes, min_independent_votes_pct, source_citation: 'company_policy', set_by_person_id, effective_from}, new this pass, FR-60: a composition gate on the vote itself, distinct from ordinary attendance quorum; company policy, not a legal citation, see PRD Section 5], status (active | dissolved), created_at`

**Meeting**
`id, company_id [FK], type (board | committee | ogm | egm), committee_id [nullable FK], scheduled_at, notice_sent_at, status (proposed | scheduled | in_progress | concluded | cancelled), quorum_rule_snapshot_id [FK to RuleVersion: captures which rule version applied at scheduling time], created_by_person_id [FK]`

**AgendaItem**
`id, meeting_id [FK], title, description, disclosure_sensitivity (material | non_material) [FR-8], topic_category (ordinary | related_party | capital_change | dissolution_merger | remuneration | other) [FR-41: selects the applicable voting threshold, keyed with company's regulatory_profile and the meeting's governance body], discussion_topic_template_id [nullable FK to DiscussionTopicTemplate: FR-46], requires_vote (bool), related_party_conflict_person_ids [array: drives recusal logic FR-12], discussion_guide_content [nullable, AI-generated, secretary-editable: FR-40], order_index, carried_over_from_meeting_id [nullable]`

**DiscussionTopicTemplate** (FR-46: platform-wide taxonomy, not per-company data)
`id, topic_key, title_ar, title_en, template_content_ar, template_content_en, category (financial_reporting | related_party_transaction | committee_report_reception | policy_approval | other)`: a global, curated list shipped with the platform; "a company's own frequent topics surface first" is computed by querying `AgendaItem.discussion_topic_template_id` usage grouped by `company_id`, not a separate usage-count table.

**CalendarConnection** (FR-45)
`id, person_id [FK], provider (google | microsoft_365), external_account_email, oauth_refresh_token_ref [reference into the secrets manager, Section 6: the raw token is never stored in the application database], sync_status (active | stale | revoked), last_synced_at, created_at`

**ConflictCheckResult** (pre-agenda-item / pre-vote advisory check: FR-44)
`id, agenda_item_id [FK], source_type (law | aoa | bylaws | precedent_resolution), summary, source_citation, related_resolution_id [nullable FK to Resolution], acknowledged_by_person_id [nullable], acknowledged_at [nullable]`: always advisory, never blocking.

**MeetingRequisition** (member-initiated meeting request: FR-42)
`id, company_id [FK], requested_by_capacity_ids [array], threshold_type (director_count | director_pct | shareholder_pct), status (pending | scheduled | expired), self_convening_enabled (bool, company-configured) [new this pass, replaces an implicit assumption: since Art. 80's self-convening mechanism is unconfirmed in statute (PRD Section 5), whether a requisition auto-escalates to a self-convened meeting or only ever triggers an internal reminder to the chairman is a company-level setting, not a hardcoded default], created_at, deadline_at`: the board-level default `RuleVersion` for `threshold_type = director_count` is one-third of directors (High confidence); the response-window/self-convening behavior itself defaults to **off** pending counsel confirmation, configurable per company's AoA.

**Document**
`id, company_id [FK], type (aoa | sha | bylaws | commercial_register | tax_certificate | board_pack | policy | historical_minutes | historical_resolution | other) [historical_minutes/historical_resolution new this pass, FR-2a], title, storage_path [region-pinned object storage], version, uploaded_by_person_id [FK], extraction_status (not_applicable | queued | processing | proposed | confirmed) [new this pass: tracks the AI-assisted extraction pipeline for both structural documents and historical minutes], access_log_enabled (bool) [Edge case, Section 13], created_at`

**ExtractedFact** *(new: FR-2, FR-2a)*
`id, document_id [FK], fact_type (board_composition | notice_period_language | shareholding_entry | historical_meeting_record | historical_resolution), payload [JSON, the proposed extracted structure], confidence (high | medium | low), confirmed_by_person_id [nullable: null until a human confirms it, never auto-applied], confirmed_at [nullable], applied_to_entity_type [nullable, e.g. "Capacity" or "Resolution"], applied_to_entity_id [nullable]`: a `historical_resolution` fact, once confirmed, is what actually creates the seed `Resolution`/precedent-index row referenced by `Company.onboarding_history_seeded`.

**Vote**
`id, agenda_item_id [FK], person_id [FK], capacity_id [FK], vote_value (for | against | abstain | recused), weight (numeric: 1 for per-capita board votes, shareholding-proportional for GA-type votes), cast_at [server timestamp, not client], idempotency_key [unique]`

**Resolution**
`id, agenda_item_id [nullable FK: nullable specifically so a historical resolution seeded from onboarding extraction, which has no live AgendaItem, can still be represented], outcome (passed | failed), tally_snapshot [JSON, immutable], quorum_met (bool), quorum_snapshot [JSON], composition_quorum_met [nullable bool, new this pass, FR-60: null for any resolution not governed by a Committee.decision_quorum; when not null, outcome cannot be 'passed' unless this is also true, an independent gate alongside quorum_met, both must clear], source (live_meeting | historical_import) [new this pass: distinguishes a resolution created through a real vote from one seeded at onboarding via FR-2a, so the precedent search and any future analytics can tell the two apart]`

**Minutes**
`id, meeting_id [nullable FK: nullable for the same historical-import reason as Resolution], draft_content_ar, draft_content_en, status (ai_drafted | under_review | approved | historical_import), approved_by_person_id [FK, nullable], approved_at [nullable], audit_hash [chained into AuditLogEntry]`

**RuleVersion** (Rules Engine: the configurable-not-hardcoded requirement, PRD Section 5)
`id, regulatory_profile [including bank_cbe], applies_to_egx_listed_overlay (bool), governance_body (board | committee | ogm | egm) [nullable], topic_category [nullable], rule_key (e.g. ogm_notice_days, board_quorum_pct, board_requisition_self_convening, nbfi_independent_ratio, cbe_board_composition), value, source_citation, confidence (high | medium | low), confidence_note [new this pass: free-text field for the honest caveat itself, e.g. the Art. 202/203 article-number conflict or the "not administrative practice either" finding on the 100%-attendance claim, so the UI can surface the actual nuance, not just a confidence label], effective_from, effective_to [nullable], company_override_id [nullable FK to Company]`

**ComplianceAlert**
`id, company_id [FK], rule_key [FK to RuleVersion], severity (violation | warning), status (open | acknowledged | resolved), related_capacity_id [nullable, new this pass: set when the alert is about one specific Capacity, the leading case being an independent_director_criteria violation (FR-57); always warning severity for that rule_key, never violation, advisory only], triggered_at, resolved_by_person_id [nullable], resolution_note [nullable]`

**GovernanceConflictFlag** *(new: FR-58/FR-59)*
`id, company_id [FK], type (consistent_split_votes | independent_vs_representative_opposition | mislabel_incident | other_manipulation_signal), severity (info | warning | high), related_resolution_ids [array], related_capacity_ids [array], detection_note [free text, always non-empty: the specific pattern or incident found, never just the enum], detected_at, status (open | reviewed | dismissed), reviewed_by_person_id [nullable], review_note [nullable]` : behavioral/pattern detection over Vote/Resolution history, distinct from ComplianceAlert's static assignment-time criteria. `mislabel_incident` fires individually per resolution, never batched into a rolling pattern, so each is reviewable on its own, this is the "representative in disguise" case named directly in the product request, an independent-labeled director whose votes consistently side with the controlling shareholder's representatives. Advisory only, never blocks a vote or resolution outcome. Visibility decided explicitly this pass as full-board, not restricted: any capacity at the company can read it, ordinary tenant isolation applies and no additional role gate does; a system_admin capacity is additionally, proactively notified on every new flag (Section 8), notification and read-access are two separate guarantees.

**RegulatoryFiling**
`id, company_id [FK], meeting_id [nullable FK], filing_type (egx_disclosure | fra_report | gafi_filing), deadline_at, status (pending | exported | escalated | completed), escalated_to_person_id [nullable]`

**Subscription**
`id, company_id [FK], tier (jsc_standard | nbfi_egx_premium | bank_premium), price_egp, billing_cycle, status`

**AuditLogEntry** (append-only, hash-chained: Section 9 security architecture)
`id, entity_type, entity_id, action, actor_person_id, actor_capacity_id, prev_hash, this_hash, occurred_at`

**AvailabilityPreference**
`id, person_id [FK], preferred_days, preferred_times, blackout_dates [array]`

**Shareholder** (GA/shareholder registry: FR-29)
`id, company_id [FK], person_id [nullable FK], holder_name, shareholding_percentage, shareholding_type (individual | institutional | custodian_omnibus), verification_status (verified | registrar_pending), proxy_delegate_person_id [nullable: FR-31], updated_at`

**RemunerationStructure** (FR-36)
`id, capacity_id [FK], compensation_mode (credits | cash_egp) [new this pass, FR-53: defaults to credits platform-wide, tied to PlatformSettings.cash_redemption_enabled, not a per-company choice], retainer_amount_egp, per_meeting_fee_egp, committee_premium_egp, effective_from, effective_to [nullable], approved_resolution_id [nullable FK to Resolution]` : the *_egp fields remain the value schedule regardless of mode; in credits mode they are converted to CreditTransaction rows (owned by the standalone `incentives` module below, not by `remuneration`) at PlatformSettings's current rate rather than paid.

The four entities below (`PlatformSettings`, `CreditTransaction`, `CorporatePartner`, `CreditRedemption`) belong to a standalone `incentives` module, decided explicitly this pass, not folded into `remuneration`: credits are a general governance-incentive ledger fed by multiple sources, a `RemunerationStructure` schedule is one source among several (meeting participation, timely resolution execution, compliance-task completion, referrals), not the mechanism itself.

**PlatformSettings** *(new: FR-53, singleton row, id fixed at 'default')*
`id, cash_redemption_enabled (bool), cash_redemption_enabled_at [nullable], cash_redemption_enabled_reason [nullable free text], credit_to_egp_rate (numeric), updated_at` : deliberately NOT company-scoped, this is bord's own operating config, not tenant data. A one-way switch bord's own ops team flips once after a qualifying funding event, never a per-company or per-user toggle (PRD Section 15, ARCHITECTURE-ESSENTIALS.md's one-way-door decisions).

**CreditTransaction** *(new: FR-53/FR-54, append-only ledger)*
`id, person_id [FK], company_id [nullable FK], capacity_id [nullable FK], remuneration_structure_id [nullable FK], reason (retainer | per_meeting_fee | committee_premium | meeting_participation | timely_resolution_execution | compliance_task_completion | referral_bonus | manual_adjustment | redemption_debit), amount_credits (positive for an earn event, negative for a redemption_debit, never zero), credit_to_egp_rate_snapshot (numeric) [snapshot at posting time, so a later platform rate change never re-values historical earnings], related_meeting_id [nullable], related_resolution_id [nullable], earned_at, created_at` : company_id/capacity_id are nullable, new this pass, since a referral_bonus or compliance_task_completion earn event is not necessarily tied to any one company.

**CorporatePartner** *(new: FR-54, platform-wide catalog, not company-scoped)*
`id, name, category (training_certification | software_tools | travel | retail | other), offer_description, credits_required (numeric), status (active | inactive), logo_url [nullable], added_at`

**CreditRedemption** *(new: FR-54/FR-55)*
`id, person_id [FK], redemption_type (partner | cash), corporate_partner_id [nullable, required when redemption_type=partner], credits_redeemed (numeric), cash_amount_egp [nullable, required when redemption_type=cash, computed at redemption time from PlatformSettings.credit_to_egp_rate], payout_export_id [nullable: set once a cash redemption is batched into a payout run, the one documented connection point back into the `remuneration` module's PayoutExport below], status (pending | fulfilled | failed | cancelled), requested_at, fulfilled_at [nullable]` : creating a redemption_type=cash row while PlatformSettings.cash_redemption_enabled is false must be rejected at the API layer, not just hidden in the UI (AGENTS.md guardrail).

**PayoutExport** (FR-39: exports today; deliberately structured for Phase 2 execution, PRD Section 15)
`id, company_id [FK], period_start, period_end, total_amount_egp, line_items [JSON: per-capacity breakdown, correctly summing multiple capacities at one company without double-counting a shared retainer, PRD Journey H step 5; each line item references bank_detail_id, not a copy of the bank data, so a Phase 2 execution layer reads the same live record rather than a stale snapshot; new this pass, a line item carries at most one of remuneration_structure_id (a direct cash_egp-mode structure) or credit_redemption_id (a credits cash-out, FR-55), never both], export_format, schema_version [new this pass: versioned explicitly so a Phase 2 payment-execution consumer can be built against a stable contract], status (exported | phase2_execution_pending | phase2_executed) [new this pass: the last two values are unused in MVP but present so the status enum doesn't need a migration when Phase 2 ships], generated_at, generated_by_person_id [FK]`

**NetworkProfile** (FR-32: one of two deliberately cross-tenant-visible entities, ARCHITECTURE-ESSENTIALS.md)
`id, person_id [FK, one-to-one], headline, bio, disclosed_expertise [array], visibility (public | private), verification_source [computed, not directly writable: derived from the person's own Capacity records where they exist, falling back to SelfDeclaredPosition rows where they don't; the UI must never blend the two into one unlabeled badge]`

**JobPosting** (FR-33)
`id, company_id [FK], title, description, required_role_type, required_independence (bool), triggering_alert_id [nullable FK to ComplianceAlert], status (open | filled | closed), created_by_person_id [FK], created_at`

**Application** (FR-34, FR-35)
`id, job_posting_id [FK], candidate_person_id [FK], status (submitted | under_review | accepted | rejected), submitted_at, accepted_capacity_id [nullable FK to Capacity]`

**ComplianceCertificate** (FR-48: voluntary tier only)
`id, company_id [FK], score_value, rule_snapshot_ids [array of RuleVersion ids], generated_at, generated_by_person_id [FK], export_format, certificate_storage_path`

## 5. API Design (core resources, REST/OpenAPI)

```
POST   /auth/login                          # + MFA challenge

# Individual onboarding, Journey I: decoupled from any company
POST   /me/onboarding/profile                # FR-49
POST   /me/onboarding/kyc/start              # FR-50, kicks off the KYC vendor flow
POST   /me/onboarding/kyc/callback           # vendor webhook, updates Person.kyc_status
GET    /me/onboarding/status                 # profile-completeness indicator, Journey I step 7
POST   /me/declared-positions                # FR-51
GET    /me/declared-positions
DELETE /me/declared-positions/{id}           # withdrawal, versioned not deleted (Section 13)
POST   /me/bank-details                      # FR-52, step-up-auth required to view after creation
GET    /me/bank-details                      # returns masked value by default; full value requires step-up re-auth

GET    /me/capacities                       # list this person's capacity contexts
POST   /companies                           # tenant onboarding: FR-1
GET    /companies/{id}
POST   /companies/{id}/documents            # FR-2, extraction job enqueued
POST   /companies/{id}/documents/historical # FR-2a, historical minutes/resolutions, async extraction
GET    /companies/{id}/documents/{id}/extracted-facts   # review queue for AI-proposed facts
POST   /extracted-facts/{id}/confirm        # human confirmation, never auto-applied
GET    /companies/{id}/structure            # governance structure: FR-3
POST   /companies/{id}/capacities           # add a person to a role, attaches to existing Person if matched
GET    /companies/{id}/compliance/composition-check   # FR-4

POST   /companies/{id}/meetings             # FR-5/FR-6: validates against RuleVersion
GET    /companies/{id}/meetings/{mid}/availability-conflicts
POST   /meetings/{id}/agenda-items          # FR-7/FR-8
POST   /meetings/{id}/notify                # FR-9

POST   /meetings/{id}/join                  # returns video SDK session token
GET    /meetings/{id}/quorum                # FR-11
POST   /meetings/{id}/roll-call             # FR-13
POST   /agenda-items/{id}/votes             # idempotent: FR-12
GET    /agenda-items/{id}/resolution

POST   /meetings/{id}/minutes/generate      # FR-14
POST   /meetings/{id}/minutes/approve       # FR-15, writes AuditLogEntry

GET    /companies/{id}/compliance/alerts    # FR-20/FR-21
POST   /compliance/alerts/{id}/resolve      # FR-22
POST   /compliance/ask                      # FR-19
GET    /companies/{id}/filings              # FR-16/FR-17
POST   /filings/{id}/export

GET    /portfolio/companies                 # Persona 6
POST   /companies/{id}/subscription         # FR-25

GET    /companies/{id}/shareholders         # FR-29
POST   /companies/{id}/shareholders
# GA meetings reuse POST /companies/{id}/meetings with type=ogm|egm: FR-30

GET    /companies/{id}/compliance/precedent-search?q=   # FR-43
GET    /agenda-items/{id}/discussion-guide  # FR-40
GET    /agenda-items/{id}/conflict-check    # FR-44
POST   /agenda-items/{id}/conflict-check/acknowledge

POST   /companies/{id}/meeting-requisitions # FR-42
GET    /companies/{id}/meeting-requisitions/{id}

GET    /me/network-profile                  # FR-32, reads Capacity + SelfDeclaredPosition
PUT    /me/network-profile
GET    /network/postings                    # FR-33, public browse
POST   /companies/{id}/postings             # FR-33
GET    /companies/{id}/postings/{id}/applications
POST   /postings/{id}/applications          # FR-34
POST   /applications/{id}/accept            # FR-35: creates a Capacity record

GET    /capacities/{id}/remuneration-structure   # FR-36
POST   /capacities/{id}/remuneration-structure
POST   /remuneration-structures/{id}/propose-approval   # FR-37
GET    /companies/{id}/remuneration/payout-export        # FR-39, reads BankDetail via reference

POST   /me/calendar-connections             # FR-45
GET    /me/calendar-connections
DELETE /me/calendar-connections/{id}
GET    /companies/{id}/meetings/{mid}/slot-suggestions   # FR-45

GET    /agenda-topic-templates?q=           # FR-46
GET    /companies/{id}/agenda-topic-templates/frequent

POST   /companies/{id}/committees           # FR-47: required committees only, called during onboarding
POST   /agenda-items/{id}/propose-committee # FR-47: discretionary committee proposal

GET    /companies/{id}/compliance/certificate    # FR-48
POST   /companies/{id}/compliance/certificate/generate

# Credits economy, new this pass
GET    /me/credits/balance                  # FR-53, sums CreditTransaction for the caller
GET    /me/credits/transactions              # FR-53, the earn-event ledger view
GET    /credits/corporate-partners           # FR-54, platform-wide catalog, no company scoping
POST   /credits/redemptions                  # FR-54/FR-55: redemption_type=cash rejected while PlatformSettings.cash_redemption_enabled is false
GET    /me/credits/redemptions

# Independence classification and conflict detection, new this pass
PUT    /capacities/{id}/director-category    # FR-57
GET    /capacities/{id}/independence-check   # FR-57, re-runs the rules-engine evaluation on demand
GET    /companies/{id}/compliance/conflict-flags       # FR-58/FR-59, full-board read access, ordinary tenant isolation only, no additional role gate
POST   /compliance/conflict-flags/{id}/review           # FR-59, review/status-set expected of compliance_officer but not access-restricted to it

# Committee decision quorum, new this pass
PUT    /committees/{id}/decision-quorum      # FR-60
```

Every mutating endpoint resolves `X-Active-Capacity` from the authenticated session, and every query is scoped server-side by that capacity's `company_id` through Postgres RLS: there is no endpoint that accepts a client-supplied company/tenant ID without cross-checking it against the caller's actual capacity grants (Section 8 stress-test: FR-24 tenant isolation). The `/me/*` individual-onboarding and profile endpoints are the deliberate exception: they resolve against the authenticated person directly, with no company/capacity context at all, since that's the entire point of decoupling them (Section 2).

## 6. Infrastructure & Deployment

- **Environments:** dev, staging, production: production pinned to an Egypt/MENA-compliant region for the database and object storage (PDPL, PRD Section 5). Staging can run in a lower-cost region since it holds synthetic data only.
- **Deployment:** containerized services (Docker) behind a managed container platform; a lean team should not operate self-managed Kubernetes at this stage.
- **CI/CD:** GitHub Actions: lint/typecheck/test on every PR, deploy to staging on merge to main, manual promotion to production.
- **Secrets:** managed via the hosting platform's secrets manager; never committed; `.env.example` in the scaffold lists every required variable with placeholder values only, including the new KYC-vendor API credentials.
- **Backups:** automated daily Postgres backups with point-in-time recovery, retained per the governance-record retention requirement.

## 7. Third-Party Integrations

| Integration | Purpose | Risk note |
|---|---|---|
| Video/e-voting SDK | Embedded conferencing, FR-10 | Must confirm MENA/Egypt data residency before final selection; manual roll-call fallback (FR-13) exists specifically to survive an outage |
| LLM API provider | RAG-based AI governance guidance (FR-19), discussion-guide generation (FR-40), pre-vote conflict checking (FR-44), precedent-search embeddings (FR-43), and onboarding document extraction (FR-2/FR-2a, new this pass) | Isolated from the Rules Engine so an outage degrades these features only, never compliance alerting; Egyptian-Arabic legal-language performance is unproven and must be evaluated before launch; the onboarding-extraction use case adds a new failure mode (a wrong extracted fact from an uploaded historical minute) that needs the same human-confirmation discipline as every other AI-Layer feature |
| SMS/Email provider | Bilingual notifications, FR-9 | Needs Egypt-market deliverability |
| **KYC/identity verification vendor** *(new)* | Individual onboarding, FR-50 | Not yet selected; needs confirmed Egyptian national-ID verification coverage before Phase 4 sign-off (PRD Section 5's new open item); kept behind a thin internal interface so a vendor swap doesn't touch onboarding application logic |
| E-signature (potentially the video SDK vendor's built-in e-sign, or a dedicated provider) | Minutes/resolution signing | Legal equivalence under E-Signature Law 15/2004 is reconfirmed at the provision level but still needs full-scope local-counsel confirmation; architecture keeps this as a pluggable provider |

No payment processor is listed: MVP billing (FR-25) is invoiced/manual or a simple recurring-billing tool appropriate to a roughly 10 to 100-tenant scale. This is also true of remuneration: `BankDetail` is captured and encrypted now (FR-52) specifically so a Phase 2 payment-execution integration has real data to build against, but no payment-initiation integration exists in this build (PRD Section 15).

## 8. Security Architecture

- **AuthN:** email/password + mandatory MFA (TOTP or SMS) for all users; MFA re-challenge required specifically at vote-casting and minute-approval actions.
- **AuthZ:** capacity-scoped RBAC: every permission check derives from `(active_capacity.role_type, active_capacity.company_id, company.regulatory_profile)`, not a single global role field.
- **Tenant isolation:** Postgres RLS policies keyed on `company_id`, enforced at the database layer as a second, independent barrier beneath application-layer capacity checks. **Two deliberate, narrow exceptions**, both outside the RLS boundary by design: `NetworkProfile`, keyed on `person_id` and readable across tenants (a board-seat marketplace cannot function otherwise), and, new this pass, the whole individual-onboarding cluster (`Person.kyc_status`, `SelfDeclaredPosition`, `BankDetail`), which is person-owned rather than tenant-owned from the start, since a person's identity exists before and independent of any company relationship. Every other table in Section 4 stays tenant-isolated. A company's access to a person's onboarding data is scoped even more narrowly than `NetworkProfile`: a company can read a candidate's public profile and the specific declared positions relevant to an independence check it is actively running (via a purpose-scoped read, not a general query), never a person's KYC internals or bank details, which are never exposed to any company context at all (PRD Section 13, new multi-tenancy edge case). `PlatformSettings`, `CorporatePartner`, and `ExternalVerificationCheck` (new this pass) are a **third, distinct category**, not more tenant-isolation exceptions: they hold no company-specific governance data at all, `PlatformSettings` is bord's own operating config (one row), `CorporatePartner` is a platform-wide catalog, and `ExternalVerificationCheck` references `SelfDeclaredPosition` (already person-owned). None of the three need a `company_id` in the first place, so none of them weaken the tenant-isolation guarantee the two real exceptions above already narrow carefully.
- **Conflict-flag visibility, new this pass, decided explicitly as full-board transparency, not restricted:** any active Capacity at the company can read `GovernanceConflictFlag` rows, ordinary tenant isolation applies (Section 4) and no additional role gate does. What IS role-restricted is proactive notification, not read access: a `system_admin` capacity is pushed a notification the moment a new flag or an `independent_director_criteria` `ComplianceAlert` is created, in addition to full-board visibility, not as a narrower substitute for it (FR-59). `compliance_officer` is a real `RoleType` for workflow ownership (who is expected to review and set status on a flag), not a visibility gate.
- **Credits/cash-redemption gate, new this pass:** `POST /credits/redemptions` with `redemption_type: cash` checks `PlatformSettings.cash_redemption_enabled` server-side and rejects the request while it is false; this is an application-layer gate, not a UI-only restriction, since the whole point of the funding-gated design (PRD Section 15) is that it cannot be bypassed by a direct API call.
- **Encryption:** TLS in transit everywhere; encryption at rest for the database and object storage; `national_id_hash` and similarly sensitive PII fields are hashed/tokenized; `BankDetail.account_number_encrypted` and `iban_encrypted` use field-level encryption with access mediated by the step-up-auth check below, not just table-level at-rest encryption.
- **Step-up authentication for bank details** *(new this pass)*: viewing or exporting the unmasked contents of `BankDetail` requires a fresh MFA challenge within a short validity window, separate from and in addition to ordinary session authentication and the existing vote/sign MFA requirement (PRD Section 13, Section 14).
- **Audit log:** append-only, hash-chained (`prev_hash`/`this_hash`) `AuditLogEntry` table covering every vote, minute approval, document access, and, new this pass, every bank-detail view/export.
- **Input validation:** all API boundaries validated against OpenAPI schemas; document uploads scanned before processing; the AI Guidance Layer's retrieval and extraction steps sanitize/ignore instruction-like content found inside uploaded documents to resist prompt injection, now explicitly covering the onboarding document-extraction pipeline (FR-2/FR-2a) alongside the three features this already applied to.
- **E-signature:** pluggable provider (Section 7).
- **Calendar OAuth tokens (FR-45):** refresh tokens stored only in the hosting platform's secrets manager, referenced from `CalendarConnection.oauth_refresh_token_ref`; a token is scoped to free/busy read access only.
- **KYC vendor data flow** *(new)*: the KYC vendor handles identity-document capture directly (vendor-hosted capture UI where possible, to minimize bord's own handling of raw ID images); bord stores only the vendor's verification result (`Person.kyc_status`) and a reference ID, not raw document images, unless the selected vendor's integration model requires otherwise, in which case any stored document image follows the same region-pinned, encrypted-at-rest storage as every other Document record.

## 9. Scalability Considerations

Designed for PRD Section 6's SOM range (up to roughly 120 tenant companies by Year 3, each with roughly 10 to 15 people holding capacities). At this scale:

- A single-region Postgres instance with read replicas is sufficient; no need for multi-region active-active writes.
- The scheduling/availability-conflict computation (FR-5) is the one feature with genuine algorithmic cost as a person's capacity count grows (Persona 2, 3 to 4 boards): bounded and cheap at realistic scale.
- Closely-held GA meetings (FR-30) use the same voting-tally path as board meetings, just with `weight` set to shareholding percentage instead of 1.
- The precedent-search index (FR-43), now seeded with historical data at onboarding rather than starting empty, and the network layer's tables are all trivial at this volume. The same is true of `CalendarConnection`, `DiscussionTopicTemplate`, `ComplianceCertificate`, and, new this pass, the individual-onboarding tables (`SelfDeclaredPosition`, `BankDetail`): even at a generous estimate of several thousand individual bord identities platform-wide by Year 3, none of these justify infrastructure beyond the primary Postgres instance.
- The one new scale consideration this pass: historical-document extraction at onboarding (FR-2a) is a bursty, per-company async workload (potentially years of minutes processed at once), not a steady-state load; the existing Redis/BullMQ job queue absorbs this without new infrastructure, but a company with an unusually large historical backlog should have extraction processed in the background with visible progress, not block the rest of onboarding (PRD Section 13).
- The point at which this design needs to change: if bord expands beyond Egypt, takes on large-scale public AGM voting, or the network layer grows into the full version, each would justify revisiting the single-region, single-tally-path, in-database-search assumptions made here.

## 10. Observability

- **Logging:** structured JSON logs from all services, correlated by request ID across the API gateway to Core Governance/Rules Engine/AI Layer boundary.
- **Monitoring:** uptime and latency monitoring on all three backend services independently.
- **Alerting:** paging on any tenant-isolation-related error (RLS policy violation attempts, cross-capacity data-access anomalies) at the highest severity; new this pass, paging on any access to `BankDetail` that bypasses the step-up-auth check, at the same severity.
- **Audit visibility:** the `AuditLogEntry` table is queryable (read-only) by tenant admins for their own company's records; a person can separately view their own individual-onboarding audit trail (KYC status history, bank-detail access log) from their profile, independent of any company context.
