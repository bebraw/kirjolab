# UI Workflow Review Notes — 2026-07-17

**Status:** Four exploratory mock projects completed through Chrome via CDP.
These notes capture observations for later prioritization; they do not propose
or record architectural decisions.

## Review setup

- Tested the local application at `http://127.0.0.1:8787` in a real Chrome
  session attached through the Chrome DevTools Protocol.
- Used LM Studio with `qwen/qwen3.5-9b`, reasoning disabled, through the local
  model companion at `http://127.0.0.1:8790`.
- Created four persistent test projects in the local application:
  `UX Mock 1 — Empirical Paper`, `UX Mock 2 — Evidence Review`,
  `UX Mock 3 — Revision Round`, and `UX Mock 4 — Systematic Review`.
- Used synthetic prose, bibliography records, and an intentionally synthetic
  PDF. No findings below assess the scientific truth of the mock content.

## Priority findings

| Priority | Finding                                                                 | Why it matters                                                                                                                                               |
| -------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| High     | Review extraction asks for RQ IDs but does not expose the generated IDs | A normal entry such as `rq1` is rejected, and omitting IDs produces a synthesis with zero RQ coverage despite extracted evidence.                            |
| High     | Local-model connection failures collapse into `Failed to fetch`         | Direct LM Studio CORS failure, companion origin rejection, and a wrong upstream path are indistinguishable and give no recovery guidance.                    |
| High     | Selected model evidence is difficult to discover                        | The assistant says evidence is required but does not link to or reveal the Research → Project evidence → Highlights selector.                                |
| Medium   | Saved extraction values disappear from their forms after saving         | The matrix eventually proves persistence, but the extraction stage looks blank and remains labelled `In progress`, inviting duplicate entry and uncertainty. |
| Medium   | Blank projects accept an H1 even though preview rejects it              | A conventional first action produces “Chapter source must start sections at level two” without up-front guidance.                                            |
| Medium   | Quality appraisal requires an exact quotation for negative answers      | Absence claims such as “limitations not discussed” cannot be supported naturally by one exact quotation.                                                     |
| Medium   | Research file inputs have generic accessible names                      | Both PDF and BibTeX controls appear as `Choose file`, making them ambiguous to assistive technology and browser automation.                                  |
| Low      | Template selection exposes two competing confirmation steps             | Choosing a template is not sufficient: the user must also press `Use …` before `Create project` enables.                                                     |
| Low      | Stale comment threads cannot be re-anchored                             | The system preserves and labels stale anchors well, but the only apparent closure is resolution.                                                             |

## Mock 1 — Empirical paper

Created a research-article project, wrote a small IMRaD paper across included
section files, previewed it, inserted a table, and opened the unified export.

What worked well:

- The research-article template provides a useful structure without excessive
  scaffolding.
- Composed preview makes the relationship between `main.md` and included
  section files understandable.
- The table workflow is quick and appropriate for small scientific tables.
- Export provides PDF, LaTeX, Markdown, BibTeX, and a source bundle in one
  place, with useful project-, file-, and heading-level word statistics.

Friction:

- The creation modal shows both a template-specific `Use Research article`
  action and `Create project`. Clicking the template card alone does not make
  the final action available, so the selection state is easy to misread.

## Mock 2 — Evidence review with a local model

Created a literature-review project, imported synthetic BibTeX and a PDF,
captured an exact quotation and note, selected that annotation as model
evidence, and asked Qwen to revise a selected sentence.

What worked well:

- BibTeX intake immediately creates a derived, read-only bibliography.
- PDF selection becomes an auto-saved highlight; adding an optional note is a
  clear second step.
- The assistant presents the original, proposal, evidence used, provider,
  model, prompt, and source revision before mutation.
- Rejecting the proposal left the manuscript untouched and retained an
  attributed rejected candidate in history. This is a strong safety boundary.

Friction:

- The PDF and bibliography file inputs lack distinct accessible names.
- Evidence selection is remote from the assistant. The empty-state message
  explains that evidence is required but does not take the user to the
  relevant highlight checkboxes.
- Model setup errors lack diagnostic specificity. During this test:
  - direct LM Studio access failed because its response lacked the required
    browser CORS header;
  - the companion initially rejected the application origin; and
  - using an upstream base URL instead of the full
    `/v1/chat/completions` endpoint returned a 404.
    The interface initially represented these materially different failures as
    the same `Failed to fetch` message.
- Qwen's proposal overreached the selected evidence and emitted an internal-
  looking annotation marker (`^[annotation-id]^`). The review UI made this
  safe to reject, but the result suggests prompt/output validation should
  prevent unsupported generalization and non-publication citation syntax.

## Mock 3 — Revision round

Created a blank project, wrote an intentionally overstated manuscript, added a
Reviewer 2 comment to a selected passage, replaced the manuscript with a more
defensible revision, and resolved the resulting stale thread.

What worked well:

- Preview diagnostics clearly identified the invalid top-level heading.
- Selection survives the move from writing to the Comments tab.
- Comments remain outside manuscript Markdown and show author, status, and
  anchored passage clearly.
- Replacing the passage did not silently detach or delete the discussion. The
  thread became explicitly stale and remained resolvable with its history
  intact.

Friction:

- A blank project's empty `main.md` gives no indication that chapter source
  sections must begin at level two; an ordinary H1 title immediately triggers
  a preview issue.
- A stale thread exposes resolution but no obvious re-anchor action for a
  comment that still applies to revised wording.

## Mock 4 — Systematic review

Created and froze an SLR protocol, generated source-specific search strings,
recorded an immutable three-record search run, screened at title/abstract and
full-text stages, appraised one included study, extracted typed data, produced
a synthesis, published `review/synthesis.md`, and reached the review package.

What worked well:

- Protocol revision and freeze states are explicit, and later search stages
  remain gated until the protocol is frozen.
- Search preview shows a portable base query and source-dialect variants.
- Import preview validates counts before the immutable run is confirmed.
- Search provenance retains source, exact query, execution time, reviewer,
  protocol revision, record count, and SHA-256 digest.
- Screening decisions are append-only and attributed, with separate
  title/abstract and full-text stages.
- Present extraction values require quotation provenance; absent values can
  instead carry an explicit missing reason.
- Synthesis gives an immediately useful PRISMA snapshot and evidence matrix,
  and it can be published back into the project.
- The final package exposes a ZIP plus lossless JSON, long-form CSV, scoped
  BibTeX, and PRISMA JSON/SVG. The manifest promises revision pins, byte counts,
  schema versions, and digests.

Friction:

- The extraction-field format asks for `RQ ids`, and its example uses `rq1` and
  `rq2`, but the saved questions receive UUID-like IDs that are not shown in
  the planning form. Entering the documented-looking IDs blocks saving with
  `Extraction field references an unavailable research question`. Removing
  the links permits progress but yields zero-study RQ coverage in synthesis.
- After each extraction value is saved, the form is cleared and the study
  continues to display `In progress`; previously recorded values are not
  visible until synthesis.
- Requiring an exact quotation for every quality answer works for positive
  evidence but does not model absence well. A `No` answer needs a note or
  location-based rationale rather than a fabricated supporting quotation.
- Internal RQ UUIDs appear directly in the synthesis coverage display. Human
  labels such as `RQ1` and `RQ2` should lead, with internal IDs secondary or
  hidden.

## Environment and tooling notes

These are not counted as Kirjolab defects:

- The available CDP file-upload helper rejected paths inside the workspace.
  Assigning a browser `File` to the existing input through CDP allowed the
  application upload flow itself to be tested successfully.
- A CDP bulk-fill operation inserted literal `\\n` sequences in some
  multiline planning fields. Normalizing them to actual newlines restored the
  application's expected parsing.
- LM Studio was available and healthy at port 1234. The companion required the
  application origin and the complete OpenAI-compatible chat-completions URL.

## Suggested follow-up order

1. Make review RQ assignment human-readable and selectable rather than based
   on manually typed hidden IDs.
2. Add actionable local-model connection diagnostics and a guided companion
   setup path.
3. Put a `Choose evidence` action beside the assistant prerequisite message.
4. Show recorded extraction values in place, including provenance and an edit
   or supersede action.
5. Clarify blank-project heading requirements and negative appraisal evidence.
6. Add distinct accessible labels to research import controls.
