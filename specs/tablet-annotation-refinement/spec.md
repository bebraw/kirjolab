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
- [x] Pure, Workers-runtime, and browser tests cover adjustment.

### Regression Guardrails

- Never rewrite PDF files to persist Kirjolab annotations.
- Never replace annotation identity for a geometry correction.
- Model evidence must use the new annotation update version after adjustment.
