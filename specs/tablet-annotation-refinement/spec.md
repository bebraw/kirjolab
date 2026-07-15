# Feature: Tablet Annotation Refinement

## Blueprint

### Context

iPad and stylus selections are useful even when their boundaries or extracted
text are not word-perfect. Refinement must preserve the researcher's evidence
identity and downstream work.

### Architecture

- Each stored highlight stroke exposes quotation correction and normalized
  geometry adjustment.
- Geometry operations nudge, widen/narrow, and lengthen/shorten every rectangle
  in one stroke.
- Operations clamp to zero-to-one page coordinates with a visible minimum
  width and height.
- Controls use touch-sized targets and remain keyboard accessible.
- Private PDF page navigation and Select, Text, Note, and Draw modes share one
  persistent icon rail on the left so the page retains the full remaining
  width.
- Annotation editing, overview, and project-sharing controls use a transient
  inspector. Creating or selecting an annotation opens it automatically; the
  annotation-list control opens it deliberately, and closing it clears any
  unsaved draft.
- Draw color, width, and undo remain contextual to the Draw icon instead of
  reserving a permanent sidebar.
- Updating a stroke advances annotation version and project history without
  mutating imported PDF bytes.
- Citation, claim, and manuscript-link actions remain separate from annotation
  refinement.

## Contract

### Definition of Done

- [x] Researchers can correct extracted stroke text.
- [x] Researchers can nudge and resize stroke geometry.
- [x] Stable annotation and stroke ids survive adjustment.
- [x] Geometry cannot leave the PDF page or collapse invisibly.
- [x] Private PDF tools remain available as labelled, keyboard-operable icons
      in the left rail.
- [x] The annotation inspector does not reserve page width while closed.
- [x] Creation and selection reveal the inspector when editing controls are
      required.
- [x] Pure, Workers-runtime, and browser tests cover adjustment.

### Regression Guardrails

- Never rewrite PDF files to persist Kirjolab annotations.
- Never replace annotation identity for a geometry correction.
- Model evidence must use the new annotation update version after adjustment.
