# ADR-212: Use Cloudflare MCP As Platform Knowledge

**Status:** Implemented

**Date:** 2026-07-31

## Context

Kirjolab vendors broad and product-specific Cloudflare skills in both
`.codex/skills/` and `.github/skills/`. Much of the general platform material
duplicates current documentation and API knowledge available through the
connected Cloudflare MCP, increasing repository size and maintenance work.

Kirjolab still benefits from focused Worker implementation and Wrangler
workflow guidance. Unlike the template baseline, Kirjolab actively relies on
SQLite-backed Durable Objects throughout its collaboration, authorization,
review, and reference-library architecture.

## Decision

Use the connected Cloudflare MCP for current product documentation, API
discovery, and account operations.

Keep `workers-best-practices`, `wrangler`, and `durable-objects` in both
repository-local skill roots. Remove the general `cloudflare`, unused
`agents-sdk`, and unused `cloudflare-email-service` bundles. Add another
product-specific skill only when Kirjolab adopts the corresponding capability.

## Trigger

The user asked Kirjolab to evaluate and pull worthwhile updates from
`vibe-template`. The July 31 Cloudflare baseline removes duplicated skill
material after adopting the connected MCP.

## Consequences

**Positive:**

- Current Cloudflare facts and API shapes come from the connected platform
  source.
- The repository drops a large duplicated documentation snapshot.
- Focused Worker, Wrangler, and Durable Object workflows remain local and
  discoverable.
- Specialized guidance becomes an explicit product choice.

**Negative:**

- Cloudflare work without an MCP connection may require installing a
  specialized skill or consulting official documentation.
- A newly adopted Cloudflare product may need a matching skill added before
  implementation.

**Neutral:**

- The change does not alter Worker runtime behavior or Cloudflare account
  state.
- Durable Object guidance remains because it reflects current Kirjolab
  architecture rather than the smaller template baseline.

## Alternatives Considered

### Keep Every Cloudflare Skill

This preserves offline reference material but duplicates the MCP's current
documentation and API capabilities while retaining substantial repository
weight.

### Match The Template And Remove Durable Object Guidance

The template does not use Durable Objects. Kirjolab does, so removing the
focused skill would discard guidance for a core persistence and coordination
boundary.

### Remove Every Cloudflare Skill

This is smaller but discards focused implementation and CLI procedures that
complement rather than duplicate the MCP.
