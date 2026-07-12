# ADR-064: Model Editable PDF Highlights as Strokes

**Status:** Implemented

**Date:** 2026-07-12

## Context

PDF text selection is imprecise on touch devices, and research highlighting is
usually iterative. Treating every pointer selection as a complete immutable
annotation forces repetitive form submission and makes small corrections
disproportionately expensive. Replacing an annotation's single quote and
rectangle array also loses which selection a researcher intended to undo or
erase.

## Decision

Keep each annotation as the stable scholarly resource chosen by ADR-038, but
model its painted content as an ordered group of independently identified
strokes. Every stroke retains its exact quote, prefix, suffix, normalized page
geometry, and creation time.

Selecting PDF text in paint mode persists a stroke immediately. Painting over
an existing annotation on the same page appends to that resource rather than
creating a duplicate. Undo and eraser operations remove identified strokes;
removing the final stroke deletes an otherwise unreferenced annotation.

Annotation commentary remains editable separately. Deleting an annotation
removes its manuscript passage links after explicit confirmation but is blocked
while a claim still depends on it. Imported PDF bytes remain immutable.

The current SQLite representation stores the versioned stroke group inside the
existing annotation geometry JSON column. Legacy rectangle arrays project as
one compatible stroke, so no destructive table migration or history rewrite is
required.

## Consequences

**Positive:**

- Highlighting becomes immediate and touch-friendly.
- Additive painting, undo, and erasing have stable mutation targets.
- Annotation identity and downstream scholarly links survive ordinary stroke
  edits.
- Legacy annotations and retained project revisions remain readable.

**Negative:**

- A grouped annotation may summarize non-contiguous quotations.
- Erasing a stroke is coarser than pixel-level geometry subtraction.
- Consumers must use the annotation update version rather than creation time
  when validating mutable evidence.

## Alternatives Considered

### Create one annotation per selection

This preserves simple immutable rows but produces duplicates when a researcher
extends one conceptual highlight and makes correction workflows cumbersome.

### Mutate one flat quote and rectangle array

This cannot identify the portion to undo or erase and weakens provenance for
incremental selection.

### Write PDF annotation objects

This conflicts with ADR-038 by mutating imported source artifacts and does not
provide the project-level scholarly relationships Kirjolab requires.
