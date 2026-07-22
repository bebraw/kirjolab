# ADR-053: Use a Tabbed Research Context Pane

**Status:** Implemented

**Date:** 2026-07-11

## Context

Kirjolab's current desktop shell places the manuscript editor beside its fast
preview, while PDF reading happens in a separate dialog and evidence capture
continues below the primary workspace. The pieces support the scholarly loop,
but the researcher must leave the writing comparison to inspect a source. This
makes it harder to verify a citation against the visible evidence or to create
an annotation while keeping the target prose in view.

Turning the layout into three permanent document-sized panes would preserve
simultaneous visibility at the cost of cramped prose, especially on laptops.
Replacing the preview whenever a source opens would keep two panes but lose the
writer's preview position and obscure whether the right side currently
represents authored output or research evidence.

The interface also needs to preserve the domain distinction between reading a
resource and changing the scholarly record. Opening a publication must not
implicitly add it to the library, cite it, or connect evidence to prose.

## Decision

Kirjolab will use two primary workspace surfaces: authoring on the left and
research context on the right. A compact source or navigation rail may support
these surfaces, but it is not a third document-reading surface.

The research-context pane will use keyboard-operable tabs. It always contains
one non-closable manuscript Preview tab and may contain tabs addressed by stable
publication and PDF resource identities. Opening an already represented
resource focuses its existing tab instead of creating a duplicate. Preview,
publication details, and the PDF reader remain separate view components hosted
by the common pane rather than one component conditionally taking ownership of
another's DOM.

Each opened resource receives a persistent local tab in stable opening order.
Following another citation or evidence link opens or focuses its own
kind-qualified tab and never replaces an earlier resource. Each resource tab
integrates a labelled close icon and remains open until the user activates it.
Each tab retains its own reading position while the user switches context:
preview scroll for the Preview tab, and page, scroll, and focused annotation
for a PDF tab.

When resource tabs are present, a compact overview projects that same ordered
tab state into a complete list. It activates permanent or resource contexts and
offers close actions only for resource tabs. The overview is a navigation
projection, not a second tab registry or persistence boundary.

Open tabs, active tab, and reading positions are local, ephemeral UI
state. They are not Yjs document content, Durable Object resources, or
collaborative presence. Publications, PDFs, annotations, claims, and their
typed links remain authorized, shared scholarly resources. A context target is
identified by its stable resource identity even when its current tab state is
local. Local context is scoped to the authorized workspace and is discarded or
reconciled when the workspace changes or a target is no longer available.

The interface will expose three distinct actions:

- **Add to library** creates or reconciles a publication in working memory.
- **Cite in manuscript** deliberately changes canonical Markdown or BibTeX at
  an explicit authoring position.
- **Connect as evidence** deliberately creates an annotation, claim, or typed
  manuscript relationship.

Viewing, opening, switching, or closing context must not perform any
of these mutations implicitly. A publication with no linked PDF opens a useful
publication representation rather than pretending that every publication owns
one artifact. Its context lists zero, one, or several explicitly linked PDF
resources defined by ADR-054; each linked artifact opens its own PDF tab. An
unlinked PDF remains a valid standalone research context.

At widths that cannot support two readable surfaces, Kirjolab will present one
primary surface at a time with an explicit Authoring/Context switch. Switching
the visible surface preserves the same local tabs and reading positions; it
does not close or remount durable resources as new identities.

## Trigger

The next product slice integrates the existing PDF reader into the primary
writing workflow so evidence can remain visible while prose is authored.

## Consequences

**Positive:**

- Researchers can compare prose with either rendered output or source evidence
  without leaving the primary workspace.
- The permanent Preview tab preserves the established fast WYSIWYM loop.
- Stable resource-keyed tabs make hypermedia navigation predictable and avoid
  duplicate views of the same resource.
- Local reading state avoids collaborative noise and unnecessary persistence.
- Explicit mutation actions preserve clear scholarly provenance.

**Negative:**

- The client must coordinate focus, tab lifecycle, and per-view reading state.
- A full PDF reader inside half of a laptop display has less width than a modal
  reader and needs deliberate responsive controls.
- Citation-to-publication-to-PDF navigation remains incomplete until the
  researcher or an import adapter establishes the corresponding typed resource
  relationships.

**Neutral:**

- The existing PDF.js display layer and immutable annotation model remain in
  effect; only their application-shell placement changes.
- Session restoration may later persist local tab state without making it
  collaborative domain state.

## Alternatives Considered

### Replace the preview with the active PDF

This keeps two columns but makes manuscript output disappear whenever evidence
is inspected and loses a stable home for preview state.

### Add a permanent third document pane

This displays editor, preview, and PDF simultaneously on wide monitors, but
produces narrow reading measures on common laptops and creates no graceful
small-screen model.

### Keep PDF reading in a modal dialog

The current dialog gives the PDF more space, but it covers or removes the
authoring comparison that makes in-context reference checking valuable.

### Synchronize context tabs between collaborators

Shared tabs would reveal where another collaborator is reading, but would also
make routine local navigation disruptive. Collaborative presence can later
share intentional attention signals without treating local pane state as
document state.
