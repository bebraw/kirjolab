# ADR-040: Use Durable Objects and R2 for the Vertical Slice

**Status:** Implemented

**Date:** 2026-07-10

## Context

The first Kirjolab slice needs low-latency collaborative document coordination,
durable materialized source, recoverable model candidates, and PDF blob storage.
The repository already targets Cloudflare Workers. Adding a separate database,
WebSocket service, and object store would expand the operational baseline before
the product loop is validated.

Collaboration must converge rather than rely on last-write-wins text saves, and
browser code must remain typed without introducing a frontend framework.

## Decision

Use one SQLite-backed Durable Object per collaborative document coordination
atom. Store the slice's document materialization, scholarly resource metadata,
annotations, passage links, and model candidates in that object.

Use Yjs updates over the Durable Object WebSocket Hibernation API for convergent
text and bibliography collaboration. Persist the merged Yjs state and readable
Markdown/BibTeX together after every accepted update.

Use R2 for immutable PDF bytes and stream them through Worker responses. Keep
PDF metadata and annotations in the document resource model.

Build the typed, dependency-light browser client with esbuild and serve the
generated bundle through the Worker. Generate binding types from `wrangler.jsonc`
and commit `worker-configuration.d.ts`.

## Trigger

The user approved completing the first vertical slice and explicitly approved
the Yjs, esbuild, and generated binding-type additions.

## Consequences

**Positive:**

- The existing Cloudflare deployment model supplies coordination, strong
  per-document consistency, WebSockets, SQLite metadata, and blob storage.
- Yjs gives concurrent writers convergent edits without a custom merge
  algorithm.
- Materialized Markdown and BibTeX remain usable without Yjs.
- PDF uploads stream to storage without buffering entire documents in Worker
  memory.
- The browser client stays framework-free and type checked independently from
  Worker runtime types.

**Negative:**

- Resource metadata is currently scoped to a document room and will need an
  explicit catalog boundary for multi-workspace discovery.
- Yjs adds runtime and browser-bundle weight.
- Production deployment requires an R2 bucket and Durable Object migration.
- Unit Vitest cannot instantiate the Cloudflare runtime directly; Durable
  Object and R2 behavior is covered through local Playwright integration tests.

**Neutral:**

- The current deterministic `demo` workspace is intentionally local-only until
  authentication and authorization are specified.
- A future local companion may replace browser-direct local-model networking
  without changing the candidate contract.

## Alternatives Considered

### Implement a custom operational transform

This would avoid Yjs but make concurrent editing correctness a new core problem
inside a product slice intended to validate scholarly workflows.

### Store PDF bytes in Durable Object SQLite

This would colocate all data but is the wrong storage boundary for large streamed
blobs and would couple document coordination to binary transfer.

### Add D1 for all metadata immediately

D1 may become useful for cross-workspace catalog queries, but the first slice
has one document coordination atom and does not need a separate relational
service yet.

### Adopt a frontend framework and application bundler

This would add structure for future screens but would broaden dependencies and
scaffolding before the interaction model is stable. Typed DOM modules and a
small esbuild step are sufficient for this slice.
