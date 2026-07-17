# UI Stress and Recovery Review Notes — 2026-07-17

**Status:** Targeted novice, failure-recovery, scale, accessibility,
collaboration, and local-model scenarios completed in Chrome through CDP. Five
new findings were recorded; no source changes were made during this review.

This pass follows the original
[`ui-review-notes-2026-07-17.md`](./ui-review-notes-2026-07-17.md) and its
[`follow-up review`](./ui-review-follow-up-2026-07-17.md). Instead of repeating
the four paper workflows, it applies different kinds of pressure to the same
product surfaces.

## Review setup

- Tested the local application at `http://127.0.0.1:8787` in Chrome through
  the Chrome DevTools Protocol.
- Created two persistent projects:
  `UX Round 2 — Novice Recovery` and `UX Round 2 — Scale`.
- Used LM Studio with `qwen/qwen3.5-9b` through the local companion at
  `http://127.0.0.1:8790/v1/chat/completions`.
- Exercised a 45-reference private Library and a synthetic 40-section,
  184,429-character manuscript containing approximately 21,700 words.

## Priority findings

| Priority | Finding                                                                     | Why it matters                                                                                                                                                                                                                                                                  |
| -------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Medium   | A rejected project BibTeX import leaves the UI indefinitely at `Importing…` | The server returns the useful `No valid BibTeX entries found` error, but the client does not catch or present it. The file control and toast remain in an apparent in-progress state until reload.                                                                              |
| Medium   | The New project dialog announces its initial template preview as selected   | `Guided starter` receives `aria-pressed="true"` and focus, but the actual template ID remains empty and `Create project` stays disabled. A novice or screen-reader user is told that a choice is pressed while still being required to choose it again.                         |
| Medium   | Closing New project does not restore a useful focus target                  | The dialog opens from an item inside the temporary Project disclosure. That disclosure closes, and pressing Escape returns to the page without a focused control in the accessibility tree. Keyboard users lose their place.                                                    |
| Medium   | Library reference details contain unnamed form controls                     | Reading status, priority, and rating appear as three comboboxes with values but no accessible names. Other controls rely on generic placeholders such as `abstract` and `Collections, comma separated`; Chrome reports 184 controls without an `id` or `name` at 45 references. |
| Low      | BibTeX capitalization braces appear in Library-facing titles                | Imported titles such as `{A}lpine.js` and `{H}{T}{M}{L} {F}irst` expose storage syntax in headings, edit labels, and search results instead of human-readable display text.                                                                                                     |

## Novice workflow

Created a Blank project using only the visible creation flow, then wrote and
reloaded a small manuscript.

What worked well:

- The blank editor immediately explains the required `##` chapter heading.
- Clicking a template explicitly selects it, updates the structural preview,
  and enables the single `Create project` confirmation.
- An edit made immediately before reload was restored completely and returned
  to `Saved` without an extra recovery step.
- The current project selector made both new test projects easy to find again.

Friction:

- On initial open, the first template is visually previewed and exposed as a
  pressed button even though it is not the form's selected template. Entering
  a title alone therefore leaves `Create project` disabled without explaining
  which apparently selected requirement remains incomplete. The mismatch is
  visible in `src/client/app.ts`: the button's pressed state follows the
  preview ID while form validity follows `newWorkspaceTemplateId`.
- The dialog initially focuses the previewed template rather than the required
  project-title field. This is not inherently invalid, but it strengthens the
  misleading impression that the template has already been selected.

## Failure and interruption workflow

What worked well:

- Reloading immediately after a manuscript input event retained both the
  earlier text and the boundary edit.
- Reloading while Qwen was generating discarded the transient request state,
  retained the manuscript, and returned the assistant to a safe prerequisite
  state. No candidate was applied automatically.
- A companion URL missing `/v1/chat/completions` produced actionable guidance
  about starting the companion, checking the allowed origin, and supplying the
  complete path.
- Restoring the full companion endpoint allowed Qwen to generate four
  reviewable ideation directions. Even poor, overly elaborate prose remained
  outside the manuscript until explicit review.

Friction:

- Importing a file containing `not bibtex at all` sent a request to
  `/bibliography/import`. The response was HTTP 400 with
  `{"error":"No valid BibTeX entries found"}`, but the page retained
  `Importing broken.bib…` and logged an unhandled promise rejection. The
  unguarded path is `#importBibliography()` in `src/client/app.ts`.

## Scale and navigation workflow

Inserted a synthetic manuscript with 40 second-level sections, 600 paragraphs,
184,429 characters, and approximately 21,700 words.

What worked well:

- Dispatching the large edit took approximately 61 ms in the browser test.
- The project returned to `Saved`, Preview contained Section 40, and the
  diagnostic summary remained `No syntax errors`.
- The Writing guide exposed all 40 sections, and the app shell retained its
  fixed-height layout without document-level horizontal overflow.
- Filtering 45 Library references to six `htmx` results completed in roughly
  116 ms and updated the live result count.
- At the Chrome test window's 500 px minimum width, the main page had no
  horizontal document overflow and retained access to Project, Export,
  Authoring, Context, rail tabs, and editor actions.

Residual risk:

- This was a responsiveness observation rather than a formal performance
  benchmark. It did not cover hundreds of project files, PDFs, or active
  comment threads.

## Keyboard and accessibility workflow

What worked well:

- The Library's PDF, BibTeX, and CSL JSON upload controls had distinct names in
  the accessibility tree once Add reference was expanded.
- The manuscript editor was exposed as `Markdown source` with the heading,
  selection, undo, and redo help attached as its description.
- The principal workspace surfaces, rail tabs, disclosures, and project
  actions had meaningful roles and names.

Friction:

- The initial New project preview is exposed as a pressed button while the
  submit action remains disabled.
- Tabbing past the last enabled dialog action briefly placed focus on the page
  body before returning to the title field.
- Closing the dialog with Escape after opening it from the Project disclosure
  left no focused element in the accessibility tree.
- Within an expanded Library reference, the reading-state comboboxes had no
  names. The abstract, collections, and private-note inputs were identifiable
  only through placeholder text.

## Collaboration workflow

Opened the 21,700-word project in two Chrome tabs, then appended a marker from
the second writer.

What worked well:

- Both tabs reported `Live · 2 writers`.
- The 32-character remote insertion appeared exactly in the first tab while it
  was displaying a different surface and URL state.
- Both copies converged on the same 184,461-character manuscript without a
  reload, duplicate insertion, or visible syntax error.
- Returning the second tab to Library reduced the project to one writer as
  expected.

## Local-model workflow

What worked well:

- Companion reconnection and incomplete-path guidance were actionable.
- Generation could be interrupted by navigation without mutating the source.
- Qwen's ideation response was divided into independently reviewable
  directions, each with a full-draft review action.

Observation:

- Qwen interpreted a simple recovery-test sentence in highly abstract terms.
  This is model-quality variation rather than an interface defect: the
  candidate boundary prevented the output from becoming manuscript content.

## Suggested follow-up order

1. Catch project BibTeX import failures, clear the busy state, and surface the
   server's bounded error beside the import control or in the toast.
2. Separate template preview semantics from selection semantics, or select the
   initial preview for real so `aria-pressed`, form state, and submit state
   agree.
3. Restore focus to the Project disclosure after New project closes and keep
   the modal Tab cycle within enabled dialog controls.
4. Give every Library reference-details control a stable label and identifier,
   especially reading status, priority, rating, collections, abstract, and
   private note.
5. Decode BibTeX display markup for human-facing Library text while preserving
   round-trip-safe source metadata.

## Environment and tooling notes

These are not counted as Kirjolab defects:

- The preferred browser-control runtime could not initialize because its
  environment already contained a protected process binding. The existing
  Chrome CDP connection remained healthy and was used for the complete pass.
- Chrome's remote resize helper clamped the requested 390 px viewport to
  500 px. Narrower layouts remain covered by the existing Playwright mobile
  tests but were not manually re-reviewed here.
- Invalid upload content was assigned to the existing file control through
  CDP so the application's normal import handler and server endpoint were
  exercised.
