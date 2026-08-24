# ADR-229: Bound Corpus-to-Library RPC Queries

**Status:** Implemented

**Date:** 2026-08-24

## Context

The first Research Corpus adapter reused the Reference Library's complete
snapshot RPC and paginated after the result reached the corpus Worker. That
snapshot also contains notes, highlights, PDF markups, web captures, tags,
collections, and reading state. Those unrelated private records make a catalog
request grow with the owner's entire Library and can exceed the Durable Object
RPC message limit before application pagination runs.

The Reference Library remains the transactional storage authority during the
incremental service extraction. Corpus still needs artifact metadata and its
optional bibliographic record without moving storage ownership or duplicating
queries in another database.

## Decision

Expose two purpose-specific Reference Library RPC queries for Research Corpus:

- a PDF artifact page selected by the existing stable artifact order, bounded
  to 100 items and a 16 MiB serialized payload budget, with a cursor resolved
  beside SQLite; and
- one PDF artifact plus its optional non-deleted bibliographic record.

The page uses a dedicated catalog projection. It omits storage locators and
reference lifecycle fields, bounds every display field and array, and loads and
projects references one at a time so oversized persisted metadata cannot build
an unbounded in-memory batch. If the byte budget is reached before the item
limit, return the last emitted artifact as the next cursor. The single-artifact
query retains the complete internal authority record because original-byte and
write adapters require its object key.

Return `null` for an invalid page cursor or absent artifact. Keep archived
references visible to match the prior migration behavior, but exclude deleted
references and their attached artifacts. Validate every cross-script page and
item again in the corpus adapter before public projection.

Do not call the complete Reference Library snapshot RPC from Research Corpus.
The snapshot remains available to Kirjolab compatibility, backup, and existing
Library workflows that actually consume its aggregate state.

## Trigger

Review found that a bounded corpus list or lookup first serialized the full
owner Library across a service binding, creating a production failure mode near
Cloudflare's RPC message-size limit.

## Consequences

**Positive:**

- Corpus list memory and RPC payload size are bounded independently of the
  requested item count and stored display-metadata size.
- Notes, annotations, web captures, and other unrelated private data do not
  cross the corpus service boundary.
- Cursor validation and ordering use the storage authority's current data.

**Negative:**

- The Reference Library exposes two more RPC methods during the migration.
- Catalog consumers use a narrower DTO than single-artifact authority lookups,
  and the page query and its application projection require paired contract
  tests.

**Neutral:**

- Physical storage remains in the current Reference Library namespace.
- The existing aggregate snapshot contract remains unchanged for its current
  consumers.

## Alternatives Considered

### Keep paginating the complete snapshot in the corpus Worker

This preserves less code but leaves payload size proportional to unrelated
private Library state and can fail before pagination executes.

### Copy corpus metadata into a second storage authority

This would make reads local to the new Worker but introduces synchronization or
dual-write behavior that ADR-227 explicitly defers.

### Rely on the 100-item limit alone

This keeps the first pagination fix, but one bibliographic record can contain
large strings and arrays. A count limit does not prove that the cross-script
message fits Cloudflare's RPC limit.

### Return artifacts without bibliographic records

This is smaller but removes the safe source metadata consumers need for useful
discovery. Returning only the matching references keeps the page bounded.
