# ADR-231: Target a Compact Agent Skill Baseline

**Status:** Implemented

**Date:** 2026-09-03

## Context

Kirjolab retained useful project-local workflows, but many entrypoints repeated
generic engineering advice or embedded version-sensitive command catalogs that
are better retrieved from installed tools and current primary documentation.
The repository also carried six overlapping Caveman routing entries and a
GitHub compatibility copy for Cloudflare Sandbox SDK even though Kirjolab does
not depend on `@cloudflare/sandbox`.

Current agents can navigate the repository, use tools, and apply ordinary
engineering judgment without long embedded tutorials. Local skill context
should concentrate on Kirjolab's decisions and boundaries.

The upstream `vibe-template` implemented the same direction in revision
`dd5822207eba18d3abe293262d55b78e9dd765d2` and published update pack
`2026-08-31-compact-agent-skills`.

## Decision

Target a capable agent baseline and keep repository skills focused on:

- discriminating routing descriptions;
- Kirjolab-specific contracts and non-obvious invariants;
- exact local commands and authorization boundaries;
- retrieval routes for version-sensitive tools, APIs, and metrics; and
- verification requirements that must survive compaction.

Remove the Caveman suite and the unused Sandbox SDK compatibility skill. Remove
static Worker-reference snapshots whose current content is available from
Cloudflare documentation and the installed Wrangler schema. Retain the
product-specific Durable Objects skill and its conditional references while
Durable Objects remain a core persistence boundary.

Keep intentional `web-perf`, `workers-best-practices`, and `wrangler` GitHub
copies byte-equivalent to their canonical `.codex/skills/` entrypoints. Treat
instruction size as a review signal rather than a hard limit: safety-sensitive
or genuinely conditional guidance may remain longer when it changes decisions.

## Trigger

The user asked Kirjolab to pull fitting improvements from the latest
`vibe-template` and explicitly authorized the redundant skill removals.

## Consequences

**Positive:**

- Routing and activated skill context are smaller and more discriminating.
- Current primary sources replace stale platform and CLI snapshots.
- Overlapping communication personas and unused product routing disappear.
- Product-specific Cloudflare and verification constraints remain local and
  reviewable.

**Negative:**

- Offline or weaker agents receive less embedded tutorial material.
- Future upstream skill updates require intent-level review rather than blind
  replacement.

**Neutral:**

- Product runtime behavior and public contracts do not change.
- The canonical skill root, explicit-only workflows, and existing license and
  provenance records remain intact.

## Alternatives Considered

### Keep the Existing Definitions

Rejected because it spends routing and prompt context on generic reasoning,
creates overlapping triggers, and keeps version-sensitive details beside a
retrieval-first platform workflow.

### Remove Every Product-Specific Skill

Rejected because Durable Objects are a core Kirjolab capability whose storage,
alarm, WebSocket, and runtime-testing boundaries remain decision-changing.

### Move Every Manual into References

Rejected because it preserves repository weight and still loads stale material
when a broad reference is selected. References remain appropriate only for
genuinely conditional product-specific detail.
