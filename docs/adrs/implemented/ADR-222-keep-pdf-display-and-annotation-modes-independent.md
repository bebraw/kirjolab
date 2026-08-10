# ADR-222: Keep PDF Display and Annotation Modes Independent

**Status:** Implemented

**Date:** 2026-08-10

## Context

The private-PDF viewer persisted single, continuous, and spread display modes,
but Note and Draw disabled text selection and also forced the viewer back to
single-page mode. That transition overwrote the researcher's saved display
preference. It existed because the single page contained the only private-markup
layer; flowing pages rendered PDF links, highlights, and text without saved
notes, drawings, or a page-local interaction surface.

Private markup already uses normalized page coordinates, so a display-mode
transition is not required to disambiguate its owning page. The reader should
keep expensive flowing-page rendering bounded and retain the existing markup
layer's gesture and mutation responsibilities.

## Decision

Treat PDF display mode and private-annotation tool mode as independent state.
Only explicit view controls change or persist the display mode.

The continuous-view owner accepts a page-overlay factory. When a flowing page
is rendered, the context-resource presenter supplies a `LibraryPdfMarkupLayer`
initialized from the canonical artifact, page-filtered markups, and current
drawing style. The presenter synchronizes tool selection, saved-resource
selection, drawing style, note-draft cleanup, and refreshed canonical
projections across the single-page and visited flowing layers. It registers the
same typed-outcome handler directly on each layer, so an asynchronous mutation
completion remains routable without depending on a current DOM parent.

Pointer sampling, note dragging, drawing recognition, and mutation transport
remain local to the layer under the pointer. A distant flowing page releases its
expensive canvas, text, link, and highlight content but retains its lightweight
markup layer. Same-document resize, rotation, and zoom rebuilds reuse that layer
so pending mutations and retryable failures keep their owner. This extends the
ownership boundaries in ADR-172 and the separation of frequent annotation tools
from view controls in ADR-201.

On pointer release, the owning layer moves a valid stroke into a transient
painted projection before starting persistence. It retains that projection
through the pending and retryable-failure states, replaces its transport data
with the server-confirmed drawing when available, and removes it only in the
same update that adopts the matching canonical drawing. Before transport, each
stroke receives a provisional identity that the presenter projects into
existing and new page layers and reuses as the drawing-creation mutation UUID.
The presenter keys pending and failed-save recovery by that same identity, so
Retry and Discard remain available on current and subsequently created sibling
surfaces after a display or artifact change. Retrying from any such surface
reuses the original mutation identity. The accepted drawing uses that UUID as
its canonical identity. The client may reuse it only while creation remains
unresolved; an equivalent retry against the unchanged live result returns the
same drawing, while conflicting reuse fails closed. Canonical adoption is one-
to-one so one server row cannot retire two concurrent provisional strokes with
identical geometry. Library refreshes apply monotonically. A failed refresh
retains the bridge; the corresponding successful authoritative refresh replaces
it when the stable identity is present or retires only that correlated
provisional identity when absent.
Canonical deletion therefore wins, concurrent saves remain independent, and
canonical and transient projections are deduplicated by identity. Undo is
suppressed on the owning artifact and page until the newest visible stroke has
a safe server identity. The toolbar may then target that server-confirmed
bridge for Undo before refresh; its completion carries the deleted identity so
stale in-flight snapshots remain tombstoned until authoritative absence is
observed. Repeating that deletion after an ambiguous transport failure
converges even when the row is already absent.

## Trigger

Researchers reported that continuous mode hid their notes and drawings and that
selecting Note unexpectedly returned them to single-page mode. They also
reported a completed stroke disappearing between pointer release and the
post-save Library refresh.

## Consequences

**Positive:**

- Saved notes and drawings remain visible in single, continuous, and spread
  layouts.
- Note and Draw preserve both the active and remembered display mode.
- Coordinate-sensitive interactions resolve against the page-local layer under
  the pointer without duplicating gesture or persistence logic.
- Lazy overlay creation and release of expensive PDF content preserve bounded
  flowing-page rendering.
- A completed stroke stays painted exactly once while creation and canonical
  refresh are in flight, including retryable failures and display changes.
- Equivalent drawing-creation retries made while the outcome is unresolved and
  its live result is unchanged, plus Undo retries, converge without duplicating
  live ink or trapping the deletion workflow.

**Negative:**

- The presenter must synchronize non-gesture state across multiple markup-layer
  instances.
- Lightweight overlays for visited pages remain allocated until the document is
  closed so in-flight and failed mutations retain their local state.
- Released drawings require bounded, per-stroke transient client projection
  until the corresponding canonical refresh succeeds or the researcher
  explicitly discards a failed stroke.
- The Library workspace must reject late older refresh results and the presenter
  must reconcile successful creation cycles explicitly.
- Drawing clients must supply and retain a stable UUID for each creation
  attempt, and the server must reject conflicting reuse.

**Neutral:**

- Private markup storage shape, normalized geometry, and export do not change.

## Alternatives Considered

### Continue forcing single-page mode

This keeps one interaction surface but makes annotation tools overwrite an
unrelated reading preference and leaves saved markup absent from flowing views.

### Render read-only markup in flowing layouts

Static notes and ink would solve visibility only. Note placement, drawing,
selection, and movement would still behave differently by display mode.

### Move one markup layer between flowing pages

A single movable layer preserves one stateful instance, but only one visible
page can expose markup at a time and the first pointer action on another page
has no correctly targeted surface.

### Release the complete distant-page subtree

Reconstructing every overlay from canonical state would use less client memory,
but a save that settles after release could no longer reach the coordinator and
a failed drawing would lose its local Retry state.
