# ADR-193: Persist a Citation Research Queue

**Status:** Implemented

**Date:** 2026-07-30

## Context

Reference trails support immediate traversal and expansion, but researchers
also need to set aside promising neighboring works without changing reading
status or opening more browser tabs. Reading priority describes the state of a
Library work and should not double as hidden trail workflow state.

A general task manager would add unrelated concepts. Browser-only state would
lose the discovery seed and disappear across devices.

## Decision

The owner Reference Library stores a bounded queue of at most 128 references.
Each item retains the queued reference, the seed from which it was found,
whether it was an outgoing reference or incoming citing work, and its server
timestamp. A reference appears at most once; queueing it again updates its
trail provenance.

The citation trail exposes add and remove actions beside accessible
relationship cards and renders the same durable queue above the graph. Queue
items navigate through existing addressable reference trails. Queue mutation
does not expand providers, alter reading state, or create references.

## Consequences

**Positive:**

- Promising works survive navigation and device changes with their discovery
  context intact.
- Reading status and priority keep their existing independent meaning.
- The queue remains a small citation-workflow feature rather than a task system.

**Negative:**

- The Reference Library gains one table, migration, and owner-scoped API.
- One reference can retain only its latest queue origin.
- Queue completion is represented by removal rather than a permanent screening
  history.

## Alternatives Considered

### Encode queue membership as high-priority unread

This reuses existing storage but overwrites researcher-managed reading fields
and loses citation direction and seed provenance.

### Store the queue in session storage

This matches a single browser session but loses useful research intent across
tabs, devices, and sign-ins.

### Add a general research task model

Tasks, due dates, assignments, and status transitions are not required for
guided snowballing and would broaden the product substantially.
