# bord: Design Principles

Companion to [ARCHITECTURE.md](ARCHITECTURE.md) Section 2 (Information Architecture) and [AGENTS.md](AGENTS.md). This document is not a glossary of UX heuristics. It applies nineteen named laws of interface design to bord's actual screens, navigation model, and data model, as those are specified in ARCHITECTURE.md, and states where an existing decision already satisfies a law, where a law argues for a change not yet made, and where two laws pull in opposite directions on the same screen. Each entry names the specific screen, field, or guardrail it touches so a change to that surface can be checked against the rationale here, per AGENTS.md's guardrail on UI changes.

**Scope note on sourcing.** `PRD.md` is cited throughout `ARCHITECTURE.md` and `AGENTS.md` for persona numbers, journey letters, and functional-requirement numbers, but is not present in this repository (see README.md). Every persona/journey/FR reference below is carried over from `ARCHITECTURE.md`'s own citations, not independently verified against `PRD.md`'s source text. Where an application below goes beyond what `ARCHITECTURE.md` states outright, it is marked **Deductive inference** and the reasoning is shown, per the reasoning-transparency standard this project holds AI-generated compliance content to (`AGENTS.md`, grounded-only guardrail).

---

## 1. Hick's Law

*Decision time increases with the number and complexity of choices (Hick 1952; Hyman 1953).*

- **Agenda builder's topic taxonomy** already applies this correctly: it is "personalized to the company's own frequent topics" (ARCHITECTURE.md Section 2), which narrows the effective choice set for the common case instead of presenting the full `DiscussionTopicTemplate` catalog first. The full taxonomy stays reachable, but it is not the default view.
- **Home dashboard's direct action cards**, reachable in "2 taps or fewer" for Persona 3 (Section 2), are a Hick's Law mitigation applied to the whole navigation model, not just one screen: a time-poor, low-tech director should never have to choose among a full sidebar's worth of options to approve an agenda or cast a vote.
- **Counter-case, worth stating explicitly: `Company.regulatory_profile` selection at company onboarding should NOT be optimized for choice-count the way the two screens above are.** It is a single, infrequent, high-consequence choice (jsc / four nbfi_* subtypes / bank_cbe, plus the orthogonal `is_egx_listed` overlay), made once per company and load-bearing for every `RuleVersion` lookup that follows. Hick's Law predicts fewer visible options reduces decision time, but reducing time is the wrong objective on a screen where the entire downstream Rules Engine behavior depends on getting the choice right. The correct lever here is disambiguating helper text on the close categories (e.g. `nbfi_leasing` vs. `nbfi_factoring`), not fewer options.

## 2. Fitt's Law

*The time to acquire a target is a function of the distance to it and its size (Fitts 1954).*

- **Meeting room voting panel**: the primary path (enter MFA re-challenge, confirm vote) needs the largest, most reachable touch target on the screen, precisely because MFA re-challenge is a mandatory step at vote-casting (ARCHITECTURE.md Section 8) added on top of an already time-pressured moment (Section 2's stated Persona 3 churn driver). Secondary controls (mute, leave meeting) should be smaller and farther from the primary path, not competing with it for thumb reach.
- **Roll-call fallback (FR-13)** is invoked exactly when the primary video path has already failed, i.e. under degraded connectivity and elevated stress. **Deductive inference:** a control that is only ever used in a worse-than-normal interaction state should be held to a stricter Fitt's Law target (larger, closer, single-tap) than a control used under normal conditions, because the failure mode this fallback exists for (ARCHITECTURE-ESSENTIALS.md: "designed on paper each time; still not fire-drilled") is also the condition under which a small or distant target is most likely to be mis-tapped.

## 3. Jakob's Law

*Users spend most of their time on other products, and expect a new product to work like the ones they already know (popularized by Jakob Nielsen).*

- **Calendar connection (Settings, FR-45)** should use the standard OAuth "Connect Google Calendar" / "Connect Microsoft 365" consent pattern already familiar from every other SaaS calendar integration, not a bord-specific consent flow, since the trust signal a director needs here ("this only reads free/busy, nothing is written back," per Section 8's scope restriction) is exactly the kind of claim a nonstandard flow makes harder to believe.
- **Video/e-voting conferencing controls (mute, raise hand, leave)** should mirror the conventions of Zoom/Teams/Google Meet rather than introduce bord-specific iconography. **Deductive inference, not stated in ARCHITECTURE.md:** Persona 2 and Persona 3 use bord's meeting room occasionally (per-board-cycle), not daily, so most of their conferencing muscle memory is built on other tools; a novel control layout would cost more relative learning time here than it would in a screen used daily.
- **Capacity switcher's closest existing mental model is a multi-workspace switcher** (the top-bar org/workspace picker pattern common to multi-tenant SaaS). Persona 6 (portfolio/multi-entity admin, Section 2) already operates other multi-tenant tools; reusing that pattern rather than inventing a bord-specific one is the direct Jakob's Law application for the one navigation control this product cannot avoid having.

## 4. Law of Proximity

*Elements close to each other are perceived as a group (Gestalt psychology, Wertheimer 1923).*

- **Home dashboard cards** ("Upcoming meetings, pending votes, compliance alerts, board snapshot," Section 2) should be grouped by what needs action this session versus what is reference-only, not by data type, since Persona 2/3's scanning pattern reads proximity before it reads labels.
- **Meeting room**: voting controls for a given `AgendaItem` should render directly adjacent to that item's content, not in one fixed panel shared across every item in the meeting. Proximity itself communicates "this control belongs to this item," which matters specifically because the room walks through multiple agenda items in one live session (Section 2: "agenda walkthrough, voting panel").
- **Governance structure builder**: `Capacity.director_category` and `Capacity.represented_shareholder_id` (FR-57) should render directly on that capacity's row in the structure builder, not on a separate settings screen, since Journey G step 4's independence cross-check reads them together.

## 5. Miller's Law

*Working memory holds roughly 7±2 chunks at once (Miller 1956).*

- **`Company.regulatory_profile`** already sits at Miller's ceiling: seven flat enum values (`jsc`, four `nbfi_*` subtypes, `bank_cbe`) plus the orthogonal `is_egx_listed` overlay. Chunking the four `nbfi_*` subtypes under one "NBFI" branch with a secondary sub-choice reduces the top-level decision to four chunks (jsc / nbfi / bank / —), inside Miller's range, instead of presenting all seven flat.
- **Web sidebar navigation** (Home, Meetings, Compliance, Documents, People, Settings — six sections, Section 2) is already compliant as specified: six top-level items sits comfortably inside 7±2, and this should be treated as a hard ceiling when a future screen is added to the sidebar rather than the `[capacity]` route tree's deeper levels.
- **Discussion-topic taxonomy (FR-46)** has a four-value `category` enum (`financial_reporting`, `related_party_transaction`, `committee_report_reception`, `policy_approval`, plus `other`) that should be the first browse level, with individual `topic_key` entries nested under it, rather than one flat alphabetical list of every topic.

## 6. Doherty Threshold

*A system that responds in under ~400ms keeps the user's attention and flow uninterrupted (Doherty & Walton 1982).*

- **Vote casting** is the one place in bord where perceived latency is not just UX polish: `Vote.idempotency_key` and the live quorum meter (FR-11) both imply the interaction needs to feel instantaneous, and a slow confirmation during a live board meeting reads as "did that register?" under exactly the time pressure Section 2 names as Persona 3's churn driver — with the added stake that the vote's `cast_at` timestamp is server-generated and feeds the hash-chained audit log (Section 8), so a confused re-tap risks a real, not just perceived, problem.
- **Home dashboard's stated load order** — "loads summary cards first and defers full meeting-history/document-list fetches" for Persona 2's low-bandwidth mobile use (Section 2) — is already a direct, correctly-applied Doherty Threshold mitigation: it protects the perceived-instant response of the primary view by deferring the slow parts, rather than blocking the whole screen on the slowest query.

## 7. Von Restorff Effect

*An item that visually differs from its neighbors is disproportionately noticed and remembered (Von Restorff 1933).*

- **`ComplianceAlert.severity`** (`violation` vs. `warning`) should differ by more than color alone. Section 10 already assigns RLS-violation-attempt paging "at the highest severity"; the Alerts feed (FR-20 to FR-22) should carry that same distinction into its visual design, since severity-tiered scanning is the screen's entire purpose.
- **The "self-declared, unverified" label** on a `SelfDeclaredPosition` is a *mandated* Von Restorff application, not a discretionary one: AGENTS.md states it must never be "less prominent than a verified badge," precisely because ARCHITECTURE-ESSENTIALS.md Section 3 calls this label "the platform's only defense against a false cross-company claim." A label that blends in with verified `Capacity` badges fails at the one job it has.
- **`mislabel_incident` conflict flags need the opposite treatment from the alert above, and this is the sharpest tension in this document.** ARCHITECTURE-ESSENTIALS.md Section 3 warns explicitly that a false `mislabel_incident` flag, shown to the full board with no restricted-audience buffer, is "a public allegation against a named director from the moment it fires," and that nothing currently coaches "this is a lead worth investigating, not confirmed misconduct" into the UI. Applying full Von Restorff alarm-styling (the same visual treatment as a `ComplianceAlert.severity = violation`) would compound that exact risk. **Deductive inference:** the correct application of this law here is to make the flag *findable* (it must not be buried) without making it *alarming* (it must not read as adjudicated fact) — a distinct, neutral visual register from the compliance-violation styling used elsewhere, not the absence of Von Restorff treatment altogether.

## 8. Minimize Target Distance

*A corollary of Fitt's Law: place the next likely action where the user's attention already is, rather than requiring a trip elsewhere.*

- **The pre-vote conflict-check flag and the discussion guide** are both already specified as rendering "inline on each substantive item" (Section 2), with the acknowledge action at the point of decision rather than in a separate Compliance Center panel. This is the correct application as already designed.
- **Minutes review**: since approve/amend controls act on specific clauses of AI-drafted content (FR-14/FR-15), the approve action for an in-progress edit should stay anchored to the clause being reviewed rather than forcing a scroll back to a fixed top-level action bar on every edit, especially given `Minutes.audit_hash` chains every approval into the evidentiary record (Section 8) and a misattributed approval (approving the wrong clause because the control was far from the edit) is a real, not hypothetical, risk on a long minutes document.

## 9. Serial Position Effect

*Items at the beginning and end of a sequence are recalled better than items in the middle (Murdock 1962).*

- **Agenda builder**: `AgendaItem.carried_over_from_meeting_id` items — the ones most likely to get shortchanged if buried mid-agenda — should default toward the top of a fresh agenda rather than being ordered purely by submission time, and an item flagged `disclosure_sensitivity: material` should not default into the middle of a long agenda by accident of ordering.
- **Home dashboard ordering**: the single most time-critical item (the item requiring action soonest) belongs first; a clear "you're caught up" or next-deadline state belongs last. A flat reverse-chronological feed wastes both of the two positions this law says are remembered best.

## 10. Peak-End Rule

*People judge an experience mainly by its most intense moment and how it ends, not by the average of every moment in it (Fredrickson & Kahneman 1993).*

- **Meeting room is bord's peak moment by the architecture's own description**: Section 2 calls it "the single highest-stakes, time-pressured screen" and names it directly as "Persona 3 churn driver: minimal taps under pressure." Effort spent reducing friction there has outsized effect on retention relative to equal effort spent on a lower-stakes screen, and this is already reflected in the full-screen-takeover navigation decision (Section 2).
- **Minutes approval is the meeting experience's end**, and deserves a designed end-state, not a silent one: an explicit "minutes approved, resolution recorded" confirmation is what a director actually remembers about the meeting afterward, distinct from `Minutes.status` simply changing to `approved` in the database with no acknowledged moment on screen.
- **Journey I (individual onboarding)'s named friction point** — Section 2: "a senior, low-tech persona argues against deep navigation nesting," and ARCHITECTURE-ESSENTIALS.md's under-engineered item on the same journey — means the moment `profile_completeness` reaches 100% should be a designed peak/end moment, since Peak-End Rule predicts this is what determines whether a person who stalled partway returns to finish later.

## 11. Zeigarnik Effect

*An unfinished task is remembered better than a finished one, and creates a pull to complete it (Zeigarnik 1927).*

- **Profile completeness indicator** (Section 2: "across the four onboarding steps above, each independently completable") is a direct, intentional application: showing "2 of 4 steps done" is what creates the pull to finish steps 3 and 4. This only works if the incompleteness stays visible, not if it is hidden until all four steps are done.
- **`AgendaItem.carried_over_from_meeting_id`** applies the same mechanism at the institutional level rather than the single-session level: an open action item is designed to resurface across meetings until closed.
- **`GovernanceConflictFlag.status: open` and `ComplianceAlert.status: open`** both rely on visible incompleteness to drive the review action FR-59 expects; an open item that quietly ages out of a feed defeats the mechanism this law predicts is doing the work.

## 12. Law of Prägnanz

*An ambiguous or complex form is perceived in its simplest possible interpretation (Wertheimer 1923).*

- **Governance structure builder's org-chart view**: "required committees pre-populated ... discretionary committees shown only once their enabling resolution has passed" (Section 2) should render as the simplest legible hierarchy — board → committees → members — rather than a dense graph exposing every foreign-key relationship in Section 4's data model. A complex chart gets perceptually simplified by the viewer regardless; better that the layout does the simplification deliberately than leave it to an ad hoc, potentially wrong read.
- **A capacity holding multiple roles at once** (e.g. `committee_head` who is also `company_secretary`) should resolve to one visually coherent badge on the People & capacities admin screen, not a stack of separately-styled tags the viewer has to mentally merge.

## 13. Law of Similarity

*Elements that share visual properties are perceived as related or of the same category (Gestalt psychology).*

- **Verified `Capacity`-derived data and self-declared `SelfDeclaredPosition` data must never share styling anywhere they co-occur** — the network profile, and Journey G's independence cross-check. This is not a general stylistic preference: this law predicts a viewer will assume identically-styled elements share the same evidentiary status, so identical styling here would directly defeat the "self-declared, unverified" guardrail (AGENTS.md), not merely look inconsistent.
- **Every `RuleVersion`-backed value shown in the Compliance Center should share one consistent citation-chip style** (source + confidence badge) regardless of which regulator it comes from (GAFI/FRA/CBE/EGX), so the viewer correctly groups "these are all sourced legal values" from appearance alone, distinct from the `company_policy`-sourced values addressed under Occam's Razor below.

## 14. Law of Similar Connectedness

*Elements joined by an explicit visual connector (a line, a shared container boundary) read as more related than elements that are merely similar or merely near each other (Gestalt psychology, connectedness as a stronger grouping cue than proximity or similarity alone).*

- **`GovernanceConflictFlag.related_resolution_ids` / `related_capacity_ids`** and **`ConflictCheckResult.related_resolution_id`** are exactly the relationship this law is suited for: an explicit connective element (a linked chip, a reference thread) between a flag and the specific vote or capacity it concerns is a stronger, less misreadable signal than relying on proximity or shared color alone. This matters specifically on the Compliance Center screen, where two gestalt cues need to coexist without collapsing into each other: proximity groups the general alert cluster, while connectedness must carry the more precise claim about which resolution or capacity a given flag actually concerns.
- **A discretionary `Committee`'s `enabling_resolution_id` (FR-47)** should render as an explicit connected reference on that committee's detail view, not be left inferable from both records merely appearing in the same list — the guardrail this supports (AGENTS.md: never instantiate a discretionary committee without a passed resolution behind it) is a claim about one specific link, not a general association two nearby list items might suggest.

## 15. Tesler's Law

*Every system has an irreducible amount of complexity; the only design choice is where it lives — moved into the system, or left for the user to handle (popularized via Larry Tesler, "Law of Conservation of Complexity").*

- **Multi-capacity remuneration aggregation (FR-38)**, flagged in ARCHITECTURE-ESSENTIALS.md as "exactly the kind of quietly-wrong logic that survives testing," is inherent complexity that belongs in the system, not the user: `PayoutExport` must compute correct per-`Capacity`, correctly-aggregated totals in code (AGENTS.md's explicit guardrail against double-counting a shared retainer), rather than exposing "which capacities at this company share a retainer" as a manual reconciliation step for whoever generates the export.
- **`Capacity.director_category` is the case where the architecture already lands on the correct side of this law.** It is explicitly "never auto-set from `role_type`" (ARCHITECTURE.md Section 4) — the platform pushes this specific judgment back to a human, correctly, because the underlying legal category is genuinely ambiguous (Egyptian regulation defines "independent," not "shareholder representative," per Section 5's finding cited throughout AGENTS.md). This is not a missing-automation gap; automating a legally undefined classification would be the wrong place to absorb this complexity.

## 16. Postel's Law

*Be liberal in what you accept, conservative in what you emit (Postel 1980, RFC 761).*

- **Historical-minutes extraction (FR-2a)** is built to accept "inconsistent formatting, handwritten annotations, non-standard Arabic legal phrasing" (ARCHITECTURE-ESSENTIALS.md's own description) on ingest — genuinely liberal input handling — but is constrained to emit only human-confirmed `ExtractedFact` rows into any live entity, never an auto-applied guess (AGENTS.md's hard guardrail). This is the correct application: liberal on what the system reads, conservative on what it asserts as fact.
- **The AI Guidance Layer's grounded-only design** applies the conservative-output half of the same principle to Q&A: it accepts an unconstrained natural-language question but must never emit an answer without a citation, even when an uncited answer would technically satisfy the literal question asked (AGENTS.md's "never let the AI Guidance Layer answer outside its grounded corpus" guardrail).

## 17. Parkinson's Law

*Work expands to fill the time available for its completion (Parkinson 1955).*

- **`MeetingRequisition.deadline_at` and `RegulatoryFiling.deadline_at`** exist specifically because compliance work will otherwise expand to fill whatever runway exists before a real legal deadline — this is the direct justification for the Regulatory Calendar screen and filing-escalation status (FR-16/FR-17/FR-18). The design implication: the calendar and its alerts need to surface a deadline meaningfully before it arrives, not only on the day it is due, since counteracting this effect is the feature's entire purpose.
- **`GovernanceConflictFlag.status: open` has no defined SLA anywhere in the current data model** — ARCHITECTURE-ESSENTIALS.md names this directly as an unresolved edge case. Parkinson's Law predicts that without a deadline-shaped nudge, review of an open flag will expand to fill however long nobody escalates it. **This argues for at least a visible "open N days" affordance on the Conflict Flags screen; it is a gap worth flagging, not a resolved design, since no default review window is specified in ARCHITECTURE.md or ARCHITECTURE-ESSENTIALS.md.**

## 18. Occam's Razor

*Prefer the explanation, or the design, that introduces the fewest additional assumptions, all else equal (attributed to William of Ockham).*

- **`MeetingRequisition.self_convening_enabled` defaulting to `false`** (AGENTS.md's hard-corrected guardrail, since the Art. 80 self-convening detail is unconfirmed statute, Section 2b) is Occam's Razor applied to a legal-accuracy problem as much as a UX one: rather than building an elaborate fallback UX around an assumed statutory right that turned out to be unconfirmed, the simplest correct design is the one already chosen — a plain company-configured toggle, off by default, with no product copy implying a settled legal right.
- **`Committee.decision_quorum`'s `source_citation: 'company_policy'`** is deliberately labeled as company policy, not dressed up to resemble a `RuleVersion`-backed field (ARCHITECTURE-ESSENTIALS.md Section 2c: "zero Egyptian legal grounding, and is labeled that way in the data model itself"). The simplest honest UI for a company-policy-only value is a plain configuration field, visually distinct from the citation-chip pattern specified under the Law of Similarity above, not a compliance-styled control implying regulatory backing it does not have.

## 19. Pareto Principle

*Roughly 80% of outcomes trace to roughly 20% of causes or inputs — a heuristic for where concentrated effort pays off disproportionately, not a literal ratio in every case (Pareto 1896).*

- **Two design decisions already in ARCHITECTURE.md are Pareto-shaped bets, not validated findings, and should be labeled that way going forward.** The agenda builder's "company's own frequent topics" surfacing (FR-46) assumes a small number of topic types account for most real agenda items; the home dashboard's "2 taps or fewer" direct-action design for Persona 3 assumes a small number of actions (approve agenda, cast vote) account for most routine sessions. Both are reasonable given the personas described, but **neither is instrumented**: no analytics or usage-tracking entity appears anywhere in ARCHITECTURE.md Section 4 or Section 10's observability section. Treat "frequent topics" and "2-tap routine actions" as hypotheses to confirm once real usage data exists, the same caution ARCHITECTURE-ESSENTIALS.md already applies to the onboarding-friction hypothesis under "What's under-engineered."

---

## How to use this document

When a screen or interaction changes:

1. Check whether the change touches a decision named above. If it does, the rationale here is the thing being changed, not just the pixels — in particular, anything touching the Von Restorff / Law of Similarity entries for `SelfDeclaredPosition`, `GovernanceConflictFlag`, or `RuleVersion`-sourced values is also touching an AGENTS.md guardrail, not a free styling choice.
2. If a new screen is added (per AGENTS.md's instruction to add a row to ARCHITECTURE.md Section 2 first), check it against Hick's Law (choice count), Miller's Law (chunk count), and Fitt's Law (target size/distance for its primary action) before treating its layout as a first draft.
3. Where this document flags a gap rather than a resolved design (the Parkinson's Law entry on conflict-flag SLAs, the Pareto entries on unvalidated frequency assumptions), that gap is inherited from ARCHITECTURE-ESSENTIALS.md's own red team, not introduced here — resolve it as a product decision, not by picking a default silently.
