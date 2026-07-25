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

The adopted components own bounded presentation:

- The import account panel owns connected and disconnected messages, reactive
  action visibility, and a typed disconnect intent.
- The import picker panel owns local field values, account/repository/branch
  option rendering, readiness, preview/status rendering, and typed Cancel and
  Confirm intents.
- The workspace sync menu owns repository status, relationship tone, Pull and
  Push availability, and typed Check, Pull, Push, and Settings intents.
- The workspace sync review owns Pull and Publish diff rendering, conflict
  choices, commit-message input, readiness, progress, and typed preview,
  confirmation, and disconnect intents.
- The new-project starting-point browser owns template and existing-project
  groups, local selection and preview state, bounded preview rendering, and
  typed selection, project-load, and template-delete intents.
- The workspace sharing panel owns member and capability-link presentation,
  invitation input, clipboard interaction, and typed close, invite, share-link,
  and notice intents.
- The workspace catalog panel owns project filtering, result and empty-state
  rendering, metadata labels, focus reset, and a typed close intent.
- The project history panel owns timeline, comparison controls, busy and error
  states, revision cards, inspectors, and typed revision-operation intents.
- Reused writing-workflow panels own research-question and reviewer-response
  Markdown-to-item adaptation, counts, empty states, action labels, and typed
  open, download, and source-selection intents.
- The assistant result panel owns validated-table previews, clarity input,
  transient revision choices, reference-discovery cards, local save progress,
  and typed continuation, selection, insertion, and save intents.
- The project map panel owns provenance-lane rendering, measured SVG connector
  geometry, responsive relayout, focus and hover emphasis, and a typed resource
  selection intent.
- The candidate review panel owns before/after and provenance rendering,
  decision availability and progress, local scroll state, and typed apply,
  reject, and evidence-navigation intents.
- The publication context panel owns scholarly metadata, linked-paper and
  project-PDF option rendering, citation readiness, local scroll state, and
  typed citation, paper, link, and unlink intents.
- The knowledge search panel owns query capture, empty, result, and error
  presentation, and typed search and resource-selection intents.
- The claim list panel owns claim, evidence-link, passage-link, grounding
  selection, empty-state, and action presentation with typed claim and
  navigation intents.
- The manuscript comment list owns comment, anchor status, empty-state, and
  action presentation with typed open, re-anchor, and resolve intents.
- The project publication list owns reference metadata, alias and DOI labels,
  empty-state, and action presentation with typed open, manage, and enrich
  intents.
- The model candidate list owns revision and claim-draft summaries, empty-state,
  and a typed review-opening intent.
- The context-tab overview owns overflow visibility, counts, tab summaries, and
  typed activate and close intents.

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
- The import picker replaces ten internal element references, the coordinator's
  repository-option cache, and its imperative option and preview DOM assembly.
- The sharing panel replaces fifteen internal element references and the
  coordinator's member/link DOM assembly while leaving membership, capability,
  and authorization requests in the application coordinator.
- The catalog panel replaces three internal element references and the
  coordinator's filter/result DOM assembly while leaving catalog fetching,
  workspace switching, and navigation authority in the application
  coordinator.
- The history panel replaces six internal element references and the
  coordinator's timeline/inspector DOM assembly while leaving its XState actor,
  fetches, confirmations, mutations, reloads, and navigation in the
  application coordinator.
- The writing-workflow panels replace five internal element references and two
  parallel imperative list renderers while leaving file creation, response
  export, and source navigation in the application coordinator.
- The assistant result panel replaces six imperative result renderers and their
  local event bindings while leaving model requests, workflow state, candidate
  persistence, document edits, and Library imports in the application
  coordinator.
- The project map panel replaces three internal element references, two
  coordinator fields, and imperative node, connector, resize, focus, and hover
  management while leaving graph derivation and resource navigation in the
  application coordinator.
- The candidate review panel replaces thirteen internal element references and
  the coordinator's candidate-copy, status, evidence, and action renderers while
  leaving applicability checks, workflow transitions, canonical mutations, and
  evidence navigation in the application coordinator.
- The publication context panel replaces eight internal element references and
  imperative metadata, paper-row, and link-form renderers while leaving
  manuscript insertion, PDF navigation, and link mutations in the application
  coordinator.
- The knowledge search panel replaces three internal element references and
  imperative result-card rendering while leaving authorized fetches, response
  validation, and resource navigation in the application coordinator.
- The claim list panel replaces one internal list reference and five imperative
  claim render helpers while leaving evidence-selection state, dialogs,
  mutations, passage navigation, and annotation navigation in the application
  coordinator.
- The manuscript comment list replaces one internal list reference and its
  imperative card renderer while leaving comment creation, anchor selection,
  mutations, refreshes, and passage navigation in the application coordinator.
- The project publication list replaces one internal list reference and its
  imperative card renderer while leaving context navigation, Library
  management, metadata enrichment, and refreshes in the application
  coordinator.
- The model candidate list replaces one internal list reference and its
  imperative card renderer while leaving generation, candidate state, context
  navigation, applicability checks, and decisions in the application
  coordinator.
- The context-tab overview replaces three internal element references and its
  imperative row and close-action renderers while leaving tab titles, routing,
  canonical context state, focus restoration, and transitions in the
  application coordinator.
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

- Network requests, GitHub and workspace-access contracts, authorization
  handling, and disconnect confirmation remain in `WorkspaceApp`.
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
