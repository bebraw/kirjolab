# ADR-076: Assign Immutable Reference Keys

**Status:** Partially superseded by [ADR-083](./ADR-083-finalize-provisional-reference-keys.md)

**Date:** 2026-07-13

## Context

The shared library uses UUIDs correctly for durable relationships, but UUIDs
are poor author-facing citation identifiers. The existing Library flow also
asks researchers to choose and edit project aliases while adding a source,
which makes a common action feel like metadata administration.

PDFs currently wait in a separate unidentified queue. This delays the moment
when a researcher can see, organize, or enrich an uploaded source even though
the filename can safely provide a provisional title.

## Decision

Every library record will receive a unique, owner-scoped, immutable reference
key in addition to its internal UUID. Keys use normalized first-author surname
and publication year when available, such as `smith2024`. A topical title
suffix disambiguates collisions; bounded numeric suffixes resolve remaining
collisions. Records without author or year use explicit fallbacks and a topic,
such as `sourceundatedclimate`, rather than inventing bibliographic metadata.

The key is assigned once when the record enters the library and does not change
when metadata is enriched. New project links use it as their citation alias.
Legacy project aliases remain readable and API-compatible, but the primary UI
does not ask researchers to rename them.

A PDF upload will create a `misc` draft immediately, derive only its provisional
title from the filename, assign a reference key, and attach the private PDF in
one library transaction. Metadata editing remains available after intake. Web
capture continues to use retrieved or explicitly supplied metadata before key
allocation.

## Consequences

**Positive:**

- Citation syntax is memorable and unique without an extra naming step.
- PDF and website intake share one visible library flow.
- Metadata can improve later without breaking citations or durable links.

**Negative:**

- Early sparse metadata can produce a less elegant key that remains immutable.
- The SQLite migration needs a deterministic backfill for existing records.
- Internal UUIDs and public reference keys must remain clearly distinguished.

**Neutral:**

- UUIDs remain the only relational identity used by library and project data.
- Legacy unidentified PDF artifacts and custom project aliases remain supported
  for compatibility.

## Alternatives Considered

### Rename keys after metadata enrichment

This produces prettier keys but would require project-wide citation rewrites
and make a supposedly stable identifier depend on enrichment timing.

### Use UUIDs in citations

UUIDs are reliably unique but difficult to remember and unpleasant to author.

### Require metadata before accepting a PDF

This preserves complete records but interrupts capture and recreates the
separate unidentified queue that made Library intake overwhelming.
