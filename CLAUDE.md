# CLAUDE.md

This project's coding-agent instructions live in [AGENTS.md](AGENTS.md), read that first. This file covers only what's specific to Claude Code.

No MCP servers, subagent workflows, or special permission rules are configured for this project yet. The one Claude-specific note worth calling out: this codebase carries real legal-accuracy risk (PRD.md Section 7, Section 17; ARCHITECTURE-ESSENTIALS.md's red-team section), and this v4 revision specifically demonstrates why: two rules that an earlier version of this documentation described with High confidence (the Art. 80 self-convening mechanism, the GA notice-period day count) were downgraded on a fresh research pass. When a change touches the Rules Engine, the AI Guidance Layer, or the individual-onboarding cluster (KYC, self-declared positions, bank details), treat AGENTS.md's guardrails as hard constraints, not style suggestions, and prefer asking over guessing on anything legal-value-shaped or confidence-level-shaped.
