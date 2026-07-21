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
  width. Page navigation and annotation tools stay grouped at the top so iPad
  browser chrome cannot cover drawing controls near the lower viewport edge.
- Annotation editing, overview, and project-sharing controls use a transient
  inspector. Creating or selecting an annotation opens it automatically; the
  annotation-list control opens it deliberately, and closing it clears any
  unsaved draft.
- Draw color, width, and undo remain contextual to the Draw icon instead of
  reserving a permanent sidebar.
- An unzoomed PDF accumulates horizontally dominant Mac trackpad wheel input
  into one previous/next page action. Vertical scroll remains native, while
  zoomed pages retain horizontal panning instead of changing page.
- Trackpad and touch pinch zoom transform the current page immediately, then
  debounce rendering and atomically replace the live canvas and text layer only
  after the new frame is complete.
- Trackpad zoom remains anchored at the pointer and touch pinch zoom remains
  anchored at the gesture midpoint through the committed render.
- A pending page note becomes an annotation only after a stationary tap ends;
  scroll and swipe movement cancel it.
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
- [x] Tablet-sized PDF rails and contextual Draw controls remain fully inside
      the visible viewport without causing horizontal page overflow.
- [x] The annotation inspector does not reserve page width while closed.
- [x] Creation and selection reveal the inspector when editing controls are
      required.
- [x] Two-finger horizontal Mac trackpad swipes turn one page per gesture
      without capturing vertical scroll or zoomed-page panning.
- [x] Mac trackpad pinch zoom keeps the previous page frame visible until its
      replacement is ready.
- [x] Trackpad and touch zoom preserve their pointer or pinch-midpoint origin.
- [x] Fitted-page swipes turn pages without creating notes during navigation.
- [x] Pure, Workers-runtime, and browser tests cover adjustment.

### Regression Guardrails

- Never rewrite PDF files to persist Kirjolab annotations.
- Never replace annotation identity for a geometry correction.
- Model evidence must use the new annotation update version after adjustment.
- Tablet layouts must not push PDF annotation tools to the bottom edge or allow
  the contextual Draw controls to overflow the viewport.
