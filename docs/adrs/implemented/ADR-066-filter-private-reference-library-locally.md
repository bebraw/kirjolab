# ADR-066: Filter the Private Reference Library Locally

**Status:** Implemented

**Date:** 2026-07-12

## Context

A reusable reference library quickly becomes difficult to scan. Search alone
does not answer which sources are unread, linked to the current paper, missing
core metadata, or grouped for one chapter. Sending each interaction to the
Worker would add API state and latency while the authorized bounded library
snapshot is already present in the browser.

## Decision

Treat filtering and sorting as a deterministic local projection over the
owner-authorized private-library snapshot. Combine text, type, reading status,
tag or collection, current-project linkage, and core-metadata completeness
facets. Sort by recent update, title, year, or reading priority.

Filtering never changes the snapshot, project links, or private organization.
Search text remains ephemeral browser state and is not persisted, shared, or
sent to a provider. Archived inclusion remains an explicit server query because
it changes which authorized records the snapshot contains.

If the bounded snapshot later becomes too large, the same filter contract may
move behind a paginated owner-library API without changing the UI meaning.

## Consequences

**Positive:**

- Facets combine instantly without a new network or storage contract.
- Private search intent stays in the browser.
- One pure projection is straightforward to test independently of the UI.
- The empty state distinguishes an empty library from no matches.

**Negative:**

- Filtering covers only records present in the bounded snapshot.
- Filter choices do not survive reload.
- Server pagination will eventually require a compatible query representation.

## Alternatives Considered

### Add a server query endpoint now

This duplicates filtering logic and creates pagination semantics before the
current library size requires them.

### Encode workflow state as tags

This conflates researcher taxonomy with reading state, project linkage, and
metadata quality.

### Persist filters per project

This turns temporary navigation into durable project state without a scholarly
reason.
