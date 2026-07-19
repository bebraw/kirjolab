# ADR-042: Use Per-Owner Workspace Catalog Durable Objects

**Status:** Partially superseded by
[ADR-150](./ADR-150-establish-task-oriented-browser-routes.md)

**Date:** 2026-07-10

## Context

Kirjolab's first slice routes one deterministic `demo` identity to one
`DocumentRoom`. Supporting multiple documents requires discovery and creation,
but document rooms should remain independent collaboration atoms. Querying all
Durable Object instances is not supported, and putting all document state into
one global object would create an unrelated coordination bottleneck.

Authentication is the next slice, so the catalog boundary must accept a real
owner identity later without changing document URLs or moving document state.

## Decision

Create one SQLite-backed `WorkspaceCatalog` Durable Object per owner identity.
It stores bounded workspace summaries and stable links, while each workspace
continues to use an independent `DocumentRoom` selected by workspace id.

Use the deterministic owner id `local` before authentication. Seed its catalog
with the compatible `demo` workspace. New workspaces receive UUID identities
and stable `/workspaces/{id}` and `/api/workspaces/{id}` routes.

The catalog is for discovery and lifecycle metadata only. Manuscript source,
collaboration, PDFs, annotations, links, and candidates remain in the document
room and workspace-scoped R2 prefix.

## Trigger

The roadmap's second slice requires creating, listing, opening, and isolating
multiple scholarly workspaces before hosted identity is introduced.

## Consequences

**Positive:**

- Document collaboration remains sharded by its natural coordination atom.
- Catalog listing does not require a new database service.
- Authentication can replace `local` with a stable subject without changing
  workspace identities.
- Workspace URLs become durable navigation and hypermedia targets.

**Negative:**

- Catalog registration and document initialization cross two Durable Objects
  and are not one database transaction.
- Cross-owner or administrative discovery requires a separate explicit index.
- A catalog object can become hot for an owner with extreme workspace churn.

**Neutral:**

- The catalog limits normal listing to 200 recent workspaces.
- The `demo` route remains a compatibility workspace rather than a special
  storage implementation.

## Alternatives Considered

### Store the catalog in every DocumentRoom

Durable Object instances cannot enumerate peer instances, so distributed
summaries would not provide a usable list.

### Put all documents in one Durable Object

This enables easy listing but couples unrelated documents to one consistency
and throughput boundary, weakening the per-document collaboration design.

### Add D1 immediately

D1 is a credible future boundary for global publication and search indexes, but
per-owner workspace discovery does not yet justify another deployed data store.
