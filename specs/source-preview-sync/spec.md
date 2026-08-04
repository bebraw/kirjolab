# Feature: Source and Preview Synchronization

## Blueprint

### Context

Authors need to move between Markdown source and its rendered Preview without
searching for the same passage twice. Project composition makes text matching
insufficient because one source file may be included more than once and a
Preview offset may belong to a supporting file.

### Architecture

- The Markdown renderer adds sanitized, disposable `data-source-from` and
  `data-source-to` offsets to rendered elements. These attributes describe the
  rendered Markdown input and are never persisted or exported.
- The active project preview's composition source map translates between those
  Preview offsets and stable file-qualified source offsets. Isolated-file
  previews use the same contract.
- The bounded light-DOM workspace Preview owns rendered and fallback content,
  source-span lookup by viewport position, centering, transient target
  emphasis, authorized project-image resolution, anchor scrolling, and click
  classification. It converts non-interactive rendered spans and semantic
  citation buttons into typed source-offset or citation intents without
  exposing Preview elements, and routes those intents plus nested diagnostic
  selections directly through the sync, Context, and project-file owners in
  its existing project binding. The bound synchronization and project owners
  retain composition source-map translation, project-file selection, canonical
  image metadata and hidden-id inputs, publication resolution, citation
  navigation, and resulting transitions.
- A compact three-button control straddles the authoring/context divider while
  the Preview tab is active in desktop split view. The right arrow reveals the
  passage centered in the source editor in Preview; the middle scroll-lock
  action enables or disables continuous viewport synchronization; the left arrow
  reveals the passage centered in Preview in the source editor.
- Clicking non-interactive Preview content reveals that element's start in the
  source editor. Citation buttons, links, and form controls retain their own
  actions.
- Clicking or selecting source, and moving the caret with navigation keys,
  follows into Preview only when both panes are visible. Typing does not move
  Preview, so composition remains stable while prose is entered. The bounded
  synchronization control owns those native source listeners, their navigation-
  key classification, teardown, responsive split-layout eligibility, centered
  versus selected source-offset choice, and explicit-versus-automatic callback
  routing. Bound canonical owners supply the current Preview-context and layout
  state; the workspace Preview retains resulting Preview DOM navigation and
  live geometry, while the project-file lifecycle retains caret and focus
  policy.
- Locked scrolling is opt-in and transient. The most recent deliberate wheel,
  touch, pointer, or scroll-key interaction selects the leading pane. Updates
  are throttled to one animation frame, programmatic movement of the following
  pane does not feed back into the leader, and text input clears the active
  leader. Within a contiguous mapping, each update interpolates the follower
  viewport center through the source-mapped boundaries of logical source lines
  and outermost rendered blocks. Visual and source gaps are bridged only when
  their boundary blocks are adjacent and ordered alike in both source and
  visual indexes, so unequal line and block heights do not cause hold-and-jump
  snapping. Rendered blocks moved out of source order, such as footnotes,
  remain directly addressable without interpolating across intervening or
  reversed boundaries. Preview block references and ranges are cached per
  render while their live geometry is read during interpolation. After finding
  a valid mapping, a leader at its top or bottom endpoint pins the follower to
  the corresponding endpoint.
- Source-led linked scrolling maps the center of the source viewport to
  Preview. Preview-led linked scrolling recenters the source viewport only
  when the mapped content belongs to the active file. It does not move the
  caret, steal focus, or switch files; explicit arrows and Preview clicks
  retain cross-file navigation.
- When a source location occurs more than once through repeated includes, Sync
  chooses the rendered occurrence nearest the current Preview viewport.
- A synchronized Preview target receives a brief token-colored outline. Sync
  state is transient browser state and does not enter project, collaboration,
  route, or history state.

### Interaction Contract

- **Source to Preview:** Preserve source focus and selection, map the logical
  source line nearest the editor viewport center, center the nearest matching
  rendered element within the Preview scroller without moving the outer page,
  and briefly identify it. Deliberate caret navigation still follows the caret
  automatically while both panes are visible.
- **Preview to source:** Select the owning project file, enter Write mode, place
  the caret at the mapped source offset, center its logical line in the editor,
  and show Authoring on a single-pane layout. The project-file owner performs
  file-or-entry fallback, Write-mode entry, and normalized range selection.
  Direct Preview clicks reveal the mapped source without forcing viewport
  centering.
- **Locked scrolling:** Activating the scroll lock lets either pane lead
  continuous viewport alignment until the control is unlinked. The latest
  direct scroll intent determines the leader. Within a contiguous same-file
  mapping, the follower advances proportionally between neighboring semantic
  boundaries instead of remaining centered on one line or rendered block
  until another becomes nearest. This alignment is approximate rather than a
  pixel-exact correspondence between rendered and source text.
- **Unavailable mapping:** Keep the current panes and selections unchanged.
- **Narrow layouts:** Hide the divider control because both panes are not
  simultaneously visible. Direct Preview clicks remain available and return
  the user to Authoring.

### Anti-Patterns

- Do not infer correspondence by matching rendered text.
- Do not persist Preview DOM offsets or use them as durable manuscript anchors.
- Do not follow every input event or steal source focus while typing.
- Do not let Preview synchronization scroll the outer workspace document.
- Do not map linked scrolling by raw scroll percentages or let programmatic
  follower scrolling bounce back into the leading pane.
- Do not repeatedly recenter the nearest line or rendered block, or start a
  browser smooth-scroll animation for every synchronization frame; those
  approaches produce stepping or accumulated lag.
- Do not switch source files during continuous Preview-led scrolling;
  cross-file navigation remains an explicit action.
- Do not let Sync override citations, links, or other interactive Preview
  elements.
- Bind the native source, highlight layer, project-file owner, and workspace
  Preview directly to the synchronization control; do not duplicate focus,
  centered-offset, or source-follow effects as application callbacks.

### Validation

- Pure tests cover both mapping directions, included files, boundaries, gaps,
  and repeated includes.
- Markdown tests verify source-position attributes survive the Preview
  sanitizer without exposing unrelated positional metadata.
- View tests verify the bidirectional control and its accessible names.
- Control and Preview document tests cover link state, latest-intent
  leadership, loop suppression, input interruption, cross-file protection,
  endpoints, interpolation within logical lines and rendered blocks, unequal
  gaps, half-open range tails, and source-reordered rendered blocks.
- Browser tests sample intermediate follower positions in both directions and
  cover linked scrolling without caret movement or feedback loops; endpoint
  alignment alone is not a sufficient continuity assertion.

## Current Milestone

- Implemented: bidirectional explicit Sync, opt-in locked viewport scrolling,
  Preview-to-source click navigation, conservative desktop source following,
  composed-file mapping, and transient target highlighting. The same bounded
  DOM adapter resolves authorized local project images relative to their
  canonical source-file mapping while leaving external and optimistically
  hidden assets untouched.
