# ADR-172: Use Lit for Bounded Reactive Components

**Status:** Implemented

**Date:** 2026-07-25

## Context

Kirjolab's server-rendered application shell keeps initial navigation and
content available without transferring ownership of the whole page to a client
framework. As browser features accumulated, `WorkspaceApp` also accumulated a
large element registry and imperative presentation updates alongside its
network and workflow coordination.

A component library can reduce that coordination burden over time, but a
whole-shell migration would duplicate application state, weaken server
rendering, and create a large regression surface. Immediate line-count savings
are also a poor measure for the first component because establishing a typed
component boundary has a fixed cost.

## Decision

Use pinned Lit for bounded reactive browser components whose local template,
presentation state, element references, and DOM events can leave
`WorkspaceApp`. Components emit typed intent events; the existing application
coordinator retains network access, Yjs and XState actors, persisted domain
state, and cross-feature workflows.

The first components own bounded GitHub presentation:

- The import account panel owns connected and disconnected messages, reactive
  action visibility, and a typed disconnect intent.
- The workspace sync menu owns repository status, relationship tone, Pull and
  Push availability, and typed Check, Pull, Push, and Settings intents.

It renders into light DOM so the existing semantic token and utility-class
system remains authoritative. The Worker keeps equivalent fallback markup for
the initial server-rendered shell. Future components must replace meaningful
imperative DOM coordination or establish a reusable boundary; Lit is not a
reason to wrap static markup mechanically.

## Consequences

**Positive:**

- The application coordinator addresses one typed presentation component
  instead of managing its internal elements independently.
- The sync menu removes eight internal elements plus their presentation updates
  from the application coordinator's registry.
- Related template, visibility rules, and local event binding now have one
  browser owner.
- Later bounded extractions can reuse the same reactive component model without
  introducing a global frontend store.

**Negative:**

- The first extraction adds more lines than it removes because it establishes
  the boundary and preserves server-rendered fallback content.
- Browser bundles and production installs gain Lit and its transitive packages.
- Component behavior needs browser-level coverage in addition to
  server-template checks.

**Neutral:**

- Network requests, GitHub contracts, and disconnect confirmation remain in
  `WorkspaceApp`.
- The visual language and server-rendered application shell are unchanged.

## Alternatives Considered

### Keep imperative DOM ownership in `WorkspaceApp`

This avoids a dependency but continues growing the element registry, visibility
updates, and event wiring in the main coordinator.

### Adopt a whole-application client framework

React, Vue, or a full Lit shell could centralize rendering, but would require a
large migration and duplicate or replace the current server-rendered authority.

### Build a local reactive component base

A project-owned base could be smaller initially but would recreate scheduling,
property updates, template escaping, and event binding that Lit already
maintains.
