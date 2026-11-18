# ADR-254: Summarize the Manuscript Outline on Demand

**Status:** Implemented

**Date:** 2026-11-18

## Context

The outline in [ADR-246](./ADR-246-place-live-outline-and-hints-in-context.md)
shows source excerpts. Readers still have to read the prose to see how
paragraphs and sections advance the manuscript.

## Decision

Add a Summaries view to the existing locally derived outline. A separate
explicit action sends bounded batches of manuscript prose to the configured
writing model, starting at the current section. Summaries describe the draft
and attach to its existing rows. Existing source ranges remain authoritative
for navigation.

Generate paragraph summaries within their own section. Synthesize a heading
summary from its own batch summaries and its subsections' summaries. This
avoids repeatedly submitting descendant prose and supports headings with no
direct paragraphs. Use source excerpts when a paragraph has no valid summary.
Mark changed sections out of date, check captured content before publishing,
and offer section refresh. The browser owns generation and holds results in
memory. Summary requests create neither manuscript edits nor candidates.

## Consequences

- Readers can switch between original excerpts and a summary of the draft.
- An explicit outline run sends prose from multiple sections over time. The
  existing paragraph guidance opt-in continues to authorize only the
  selected paragraph and its nearby context.
- Bounded requests suit local model connections and make progress visible
  as sections complete. Long sections and nested headings can require more
  requests, and synthesis can lose detail.
- Outline navigation works immediately and remains available during failures
  or edits. The view does not review the whole manuscript's scientific
  argument or propose changes to it.

## Alternatives Considered

- **One document prompt** would repeat the full document after a small edit
  and depend on a model's context capacity.
- **Reuse caret-driven guidance** would only cover visited paragraphs and
  tie outline generation to authoring activity.
- **Persist shared summaries** would require ownership, revision, and
  refresh rules for generated project data.
