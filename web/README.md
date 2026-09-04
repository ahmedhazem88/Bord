# bord web

Next.js 14 (App Router, TypeScript, Tailwind) implementation of bord's web app.

## Status

This is a **design-system foundation + flagship screens** pass, not the full 89-screen build from [ARCHITECTURE.md](../ARCHITECTURE.md) Section 2. It exists to establish one working, verified pattern (tokens, components, capacity-scoped shell, screen conventions) that the rest of the screen inventory gets built from next, rather than stubbing all of them shallowly. Every screen renders against `lib/mock-data.ts`, not a real backend -- `backend/` has no working logic yet (AGENTS.md).

**Screens built:** Login/MFA, capacity switcher, individual-onboarding profile hub, home dashboard, agenda builder, meeting room (live), compliance alerts feed, governance conflict flags.

**Not yet built:** every other row in ARCHITECTURE.md Section 2's screen inventory (documents vault, filings, people admin, shareholders, remuneration, postings, credits wallet, precedent search, and more), RTL/Arabic localization (the app currently renders `dir="ltr"` only -- PRD.md Section 14 requires bilingual AR/EN with correct RTL/LTR mixed rendering, deliberately deferred rather than half-built), and the React Native/Expo mobile app (`mobile/`, planned as a follow-up pass mirroring this web pattern per AGENTS.md's shared-types intent).

## Design system

Follows the structural language of Airbnb's Design Language System -- warm neutrals, a confident single accent, generous 12px/pill rounding, soft diffuse elevation instead of hard borders, a rounded humanist typeface (Nunito Sans), an 8px spacing rhythm -- adapted to bord's own palette rather than Airbnb's literal brand colors (a compliance product's accent should read as "trust/verification," not "marketplace"). Tokens live in `tailwind.config.ts`; primitives in `components/ui/`. See [DESIGN-PRINCIPLES.md](../DESIGN-PRINCIPLES.md) for how specific tokens and components map to the Laws of UX and to bord's own compliance-accuracy guardrails (e.g. why the `self-declared` badge and the `verified` badge must be equally prominent, why `mislabel_incident` flags use a neutral tone instead of the violation red).

## Known gaps in this pass

- `next build`'s font-optimization step can't reach Google Fonts' metrics API in this environment (`Failed to find font override values for font 'Nunito Sans'`); it's a non-fatal warning, and the app renders correctly against the system fallback stack either way, but worth re-checking once this runs somewhere with normal internet access.
- `npm audit` reports one high-severity finding inside Next 14's own bundled build-time `postcss` (a transitive dependency of Next's toolchain, not something the app exposes at runtime). Fixing it means jumping to Next 16, a breaking major-version change out of scope for this pass; flagged here rather than silently left for someone to rediscover.
- No test suite yet, consistent with the rest of this repo's current phase (AGENTS.md: "scaffold has no working logic yet").

## Development

```
npm install
npm run dev        # http://localhost:3000
npm run build       # production build
npm run typecheck
```
