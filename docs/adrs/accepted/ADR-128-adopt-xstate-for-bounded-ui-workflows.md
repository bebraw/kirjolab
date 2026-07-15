# ADR-128: Adopt XState for Bounded UI Workflows

**Status:** Accepted

**Date:** 2026-07-15

## Context

The browser client coordinates collaboration, offline persistence, model
operations, private PDF reading, annotation tools, and routed research context.
Several workflows now rely on combinations of booleans, counters, timers, and
nullable draft objects in the main client coordinator. Those combinations make
invalid intermediate states possible and spread transition rules across event
handlers.

Not every piece of client state has this problem. Route parsing, research tabs,
PDF gestures, and upload queues already use small typed values or pure transition
functions that remain easy to test without a state-machine runtime.

## Decision

Adopt XState 5 as a pinned runtime dependency for bounded, event-driven client
workflows where mutually exclusive states, asynchronous lifecycles, or guarded
transitions are otherwise encoded across several independent fields.

The first workflow is private PDF annotation interaction. Its machine will own:

- the active Select, Text, Note, or Draw tool;
- pending note composition and note editing;
- selected highlights and PDF markups;
- active note dragging; and
- active drawing pointer and sampled points.

The machine will not own PDF resources, DOM elements, persisted library data,
network requests, Yjs document state, URL state, or simple view preferences.
Those remain in their existing authorities. Application code will perform side
effects after explicit machine transitions and render from machine snapshots.

Future adoption requires the same bounded-workflow test: a machine must remove
invalid combinations or materially clarify event ordering. XState will not
become a global store, and existing pure reducers will not be migrated merely
for consistency.

## Consequences

**Positive:**

- Annotation modes and gestures gain one typed transition authority.
- Impossible combinations such as simultaneous note dragging and drawing are
  unrepresentable.
- Transition tests can exercise cancellation and tool changes without the DOM.
- Later assistant or connection workflows may reuse the approach when they meet
  the same threshold.

**Negative:**

- The client gains a runtime dependency and a statechart vocabulary.
- Integration code must translate pointer and form events into machine events.
- A poorly bounded machine could hide ordinary data flow behind unnecessary
  ceremony.

**Neutral:**

- XState actors are local browser orchestration only; they do not replace
  Durable Objects, Yjs, or persisted domain state.
- The PDF annotation UI and API contracts remain unchanged by the pilot.

## Alternatives Considered

### Convert all client state to XState

This would centralize state mechanically but replace compact reducers and route
values that are already clear. The migration cost and conceptual surface would
exceed the benefit.

### Continue with ad hoc fields

This avoids a dependency but leaves tool changes, pointer cancellation, drafts,
and selection cleanup distributed across the main application class.

### Build a project-specific state-machine helper

A smaller helper could cover basic transitions, but it would recreate typed
events, actors, guards, snapshots, and inspection conventions without reducing
long-term maintenance.
