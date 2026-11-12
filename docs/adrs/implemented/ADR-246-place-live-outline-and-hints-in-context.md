# ADR-246: Place the Live Outline and Writing Hints in Context

**Status:** Implemented

**Date:** 2026-11-12

## Context

Kirjolab's manuscript map already derives headings, counts, and local editing
cues, but shares the left Writing guide with research workflows. Authors need
to follow their current passage while inspecting structure and receiving
focused writing help. Thesis Revision Helper demonstrates a useful combination
of a heading-and-paragraph outline with feedback for the selected paragraph.

Kirjolab already has a native collaborative editor, composed-file source maps,
a tabbed right Context pane, and validated model-provider settings. The feature
must preserve those owners and keep editing useful without a model.

## Decision

Add a permanent **Outline & hints** destination to the right Context pane.
Move the manuscript map there and retain research questions, diary, and reviewer
responses in the left Writing guide. Reuse the existing responsive two-surface
layout: choosing the guide replaces the visible Preview or research resource.

Derive a collapsible heading-and-paragraph tree and advisory editing cues
locally from current composed Markdown. Preserve prose before the first
heading, exact file-qualified source navigation, and the distinction between
own-section and descendant-inclusive counts. Keep the caret target separate
from the reading-position indicator; scrolling may follow the outline without
moving source selection or starting model analysis.

After an explicit opt-in for the current session, analyze the active paragraph
through the existing configured provider after a 1.5-second pause. Send only
that paragraph and bounded heading and neighboring-paragraph context. Return
a tentative purpose and at most three hints. Keep analysis and its enablement
in browser memory, suspend requests while the guide is hidden or input-method
composition is active, and discard responses whose passage, context, or model
settings have changed. Label pending, current, stale, unclear, failed, and
unavailable analysis explicitly.

This partially supersedes the every-operation-produces-a-candidate clause in
[ADR-039](./ADR-039-require-reviewable-model-operations.md):
observational paragraph analysis has no apply action and creates no persisted
candidate. All model-proposed manuscript or resource changes retain the existing
review and explicit-apply boundary. Whole-document semantic argument analysis
is outside this decision.

## Trigger

The researcher requested an outline visible beside writing, with contextual
hints, and approved automatic paragraph-purpose analysis in the same feature.

## Consequences

**Positive:**

- Authors can navigate structure and inspect passage-specific guidance beside
  the editor without adding a fourth workspace pane.
- Local navigation and cues remain available without network or model access.
- The existing source maps and provider adapters remain authoritative; no new
  editor dependency, storage target, or backend analysis service is required.

**Negative:**

- Preview and the guide cannot both occupy Context simultaneously.
- Automatic analysis adds provider latency and request cost after opt-in, and
  interpretations may be unhelpful or unavailable.
- Source changes, collaboration, composition, and provider changes require
  explicit cancellation and stale-result guards.

**Neutral:**

- The `outline` Context route is shareable; expansion, reading position,
  analysis enablement, and results are transient.
- Reconsider an independent guide rail only if simultaneous Preview and guide
  use justifies a new responsive layout decision. Whole-document reasoning
  would require a separate scope and analysis-budget decision.

## Alternatives Considered

### Keep the map in the left rail

This preserves placement but competes with project navigation and research
workflows and does not provide the requested writing companion on the right.

### Add a separate permanent outline rail

A fourth pane would compete with the editor and Context at laptop and tablet
widths and require a new responsive layout and resizing contract.

### Analyze the entire manuscript automatically

This would broaden context exposure, provider cost, invalidation work, and the
scope of inferred claims before focused paragraph feedback is established.

### Limit the guide to local heuristics

Local cues remain the default, but they cannot describe a paragraph's specific
rhetorical contribution. Session opt-in permits that additional interpretation
without making structural navigation depend on a model.
