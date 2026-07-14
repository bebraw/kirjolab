# ADR-105: Keep PDF Markup Private and Page-Anchored

**Status:** Implemented

**Date:** 2026-07-14

## Context

The private PDF reader devoted a large fixed panel to saving one text quote.
It had no spatial notes or pen input, and expanding the project annotation
model would make personal reading marks visible beyond their intended scope.

## Decision

Private PDF annotation uses a compact Text, Note, and Draw toolbar. Editors
appear only for an active text selection or newly placed note. Notes store a
page plus normalized x/y anchor. Drawings store a bounded normalized point
sequence, a six-digit color, and a 1–24 pixel width; red is the UI default.

The owner-scoped Reference Library Durable Object stores these markups in its
SQLite schema. Existing authenticated private-library routes create and delete
them. They are deliberately excluded from project research-share kinds.

## Consequences

The PDF remains the dominant surface, notes stay attached through responsive
resizing, and touch or pen drawing works without a separate canvas document.
Normalized paths are compact and portable but do not encode pressure, tilt, or
editable vector shapes. Sharing a PDF or quotation never shares personal note
pins or ink implicitly.

## Alternatives Considered

Keeping the full-height form preserves the old implementation but obscures the
document. Storing pixel coordinates is simpler but drifts whenever PDF scale
changes. Reusing project annotations would blur owner-private and collaborative
security boundaries.
