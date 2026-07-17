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
- A compact two-button control straddles the authoring/context divider while
  the Preview tab is active in desktop split view. The right arrow reveals the
  passage centered in the source editor in Preview; the left arrow reveals the
  passage centered in Preview in the source editor.
- Clicking non-interactive Preview content reveals that element's start in the
  source editor. Citation buttons, links, and form controls retain their own
  actions.
- Clicking or selecting source, and moving the caret with navigation keys,
  follows into Preview only when both panes are visible. Typing does not move
  Preview, so composition remains stable while prose is entered.
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
  and show Authoring on a single-pane layout. Direct Preview clicks reveal the
  mapped source without forcing viewport centering.
- **Unavailable mapping:** Keep the current panes and selections unchanged.
- **Narrow layouts:** Hide the divider control because both panes are not
  simultaneously visible. Direct Preview clicks remain available and return
  the user to Authoring.

### Anti-Patterns

- Do not infer correspondence by matching rendered text.
- Do not persist Preview DOM offsets or use them as durable manuscript anchors.
- Do not follow every input event or steal source focus while typing.
- Do not let Preview synchronization scroll the outer workspace document.
- Do not let Sync override citations, links, or other interactive Preview
  elements.

### Validation

- Pure tests cover both mapping directions, included files, boundaries, gaps,
  and repeated includes.
- Markdown tests verify source-position attributes survive the Preview
  sanitizer without exposing unrelated positional metadata.
- View tests verify the bidirectional control and its accessible names.

## Current Milestone

- Implemented: bidirectional explicit Sync, Preview-to-source click navigation,
  conservative desktop source following, composed-file mapping, and transient
  target highlighting.
