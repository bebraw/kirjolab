# ADR-073: Host Writing Assistant in Context

**Status:** Implemented

**Date:** 2026-07-13

## Context

Writing assistant began as a collapsed drawer spanning the bottom of the
workspace. Although the collapsed entry remains visible, opening it extends the
primary shell below the authoring and research surfaces and introduces a second
navigation pattern for work that already produces resource-keyed candidate
reviews in Context.

The assistant is a recurring workflow destination rather than a brief
confirmation. Researchers move between selecting prose, choosing evidence,
configuring a local model, drafting, and reviewing the resulting candidate.
Preview and Library already establish permanent Context tabs for comparable
singleton destinations.

## Decision

Kirjolab will host Writing assistant as the third permanent Context tab after
Preview and Library. It is unique, non-closable, keyboard navigable, and retains
local scroll state. The three permanent tabs share the same Authoring/Context
split width.

The tab contains the existing selected-passage instruction, model connection
settings, request status, and candidate inventory. Activating it does not start
a request or mutate the manuscript. Explicitly drafting a revision continues
to create a resource-keyed candidate review tab; the permanent assistant tab
remains available, and applying or rejecting the candidate remains explicit.

The separate full-width assistant drawer is removed. Model-provider,
authorization, evidence-bounding, and candidate persistence contracts do not
change.

## Trigger

The post-review UI refinement identified Writing assistant as another recurring
workspace destination that should use the established Context navigation.

## Consequences

**Positive:**

- The primary workspace has one navigation model for preview, library,
  assistant, source reading, and revision review.
- Opening the assistant no longer changes page height or moves the main
  authoring surfaces.
- Assistant configuration and drafts remain reachable by keyboard beside the
  manuscript.
- Candidate review keeps a distinct stable resource identity.

**Negative:**

- Assistant controls have less horizontal space than the former full-width
  drawer and must use a single-column context layout.
- Three permanent tabs consume more of the context tab row before resource tabs
  begin.

**Neutral:**

- Model calls still require an explicit action and bounded selected prose plus
  evidence.
- Local model connection fields remain browser UI state rather than shared
  workspace state.

## Alternatives Considered

### Keep the drawer below the workspace

This preserves maximum horizontal space but retains a second navigation model
and changes the page geometry whenever the assistant opens.

### Make Writing assistant a closable resource tab

The assistant has no project resource id and is a stable workflow destination,
so allowing it to disappear would make model drafting less predictable than
Preview or Library.

### Put assistant controls in the authoring toolbar

This keeps them close to selection but would crowd persistent editing controls
with model configuration and candidate inventory.
