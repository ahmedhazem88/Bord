# bord

Multi-tenant corporate governance management platform for Egyptian joint stock companies, FRA-regulated NBFIs, CBE-regulated banks, and EGX-listed companies: decoupled individual and company onboarding (KYC, self-declared cross-company positions, encrypted bank details, and historical board/GA minutes upload that seeds the precedent database), board, committee, and general assembly scheduling with calendar sync (Google/Microsoft 365) and slot suggestions, smart agendas with a discussion-topic taxonomy, AI-generated discussion guides, and pre-vote conflict checks, embedded conferencing and e-voting with topic- and body-specific thresholds, member-requisitioned meetings, a full required-plus-discretionary committee taxonomy, a searchable precedent database, a minimal professional network and board/committee hiring module, a remuneration calculate-and-export module designed to support a future payment-execution phase, a standalone credits-based incentive layer with corporate-partner redemption and a funding-gated cash-redemption path, governance-integrity features (independent-vs-shareholder-representative director classification, voting-pattern conflict/abuse-of-power detection with full-board visibility, and committee-level compositional decision quorums), a voluntary self-certified compliance score for companies outside mandatory jurisdiction, and an AI-guided compliance engine built on Egyptian Companies Law, FRA regulations, CBE banking-sector regulations, and EGX disclosure rules.

## Documentation

- [PRD.md](PRD.md): problem, market, personas, journeys, functional requirements, roadmap
- [ARCHITECTURE.md](ARCHITECTURE.md): full technical architecture
- [ARCHITECTURE-ESSENTIALS.md](ARCHITECTURE-ESSENTIALS.md): critical decisions and an honest red team
- [DESIGN-PRINCIPLES.md](DESIGN-PRINCIPLES.md): the Laws of UX mapped to bord's actual screens, navigation, and interaction decisions
- [AGENTS.md](AGENTS.md): instructions for coding agents working in this repo (start here before making changes)

## Structure

- `web/`: Next.js web app (includes `app/network/*` and `app/onboarding/*`, deliberately outside the per-company `[capacity]` route namespace, see AGENTS.md)
- `mobile/`: React Native (Expo) mobile app
- `backend/`: NestJS API (Onboarding, Core Governance, Rules Engine, AI Guidance, Scheduling, GA/Shareholder, Network, Remuneration, Incentives, Governance Integrity modules)
- `shared/`: cross-cutting TypeScript types
- `tests/`: cross-cutting integration/e2e tests

## Development (intended commands, scaffold stage, no working logic yet)

```
# backend
cd backend && npm install && npm run start:dev

# web
cd web && npm install && npm run dev

# mobile
cd mobile && npm install && npx expo start
```

Copy each package's `.env.example` to `.env` and fill in real values before running, including the KYC-verification vendor credentials once a vendor is selected (ARCHITECTURE.md Section 7).

## Status

This is a scaffold produced from a ground-up v4 PRD/architecture pass, rebuilt from a consolidated master requirements prompt with a fresh regulatory and competitive research pass. Structure and data-model stubs only, no working application logic yet (lifecycle phase 5 of 9, see PRD.md Section 16). The prior iterative draft is preserved outside this project for reference.

**Note on this checkout:** `PRD.md` is referenced throughout the documents above (personas, journeys, functional requirement numbers, the Section 5 legal-confidence findings) but is not yet present in this repository; every `PRD.md` cross-reference in these docs was carried over from the source architecture pass and has not been independently re-verified against `PRD.md`'s text in this checkout. Treat any `PRD.md`-sourced claim as unconfirmed until that file is added.
