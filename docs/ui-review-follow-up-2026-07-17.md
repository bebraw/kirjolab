# UI Workflow Follow-up Review — 2026-07-17

**Status:** The nine findings from the exploratory review were addressed and
re-reviewed. No new high- or medium-priority product issue was found.

This audit follows
[`ui-review-notes-2026-07-17.md`](./ui-review-notes-2026-07-17.md). It reviews
the implementation range from `be0c249` through `71126f6`.

## Verification setup

- Revisited the persistent mock projects in Chrome through CDP at
  `http://127.0.0.1:8787`.
- Checked corrected labels, guidance, empty states, selection behavior, and
  comment behavior in the running application.
- Reviewed the implementation diff and its domain, API, Durable Object,
  client, specification, migration, and test changes.
- Ran the focused stale-comment browser test and the complete native local CI
  gate.

## Finding disposition

| Original finding                                     | Result   | Follow-up evidence                                                                                                                                                 |
| ---------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Extraction asks for hidden RQ IDs                    | Resolved | Extraction accepts visible `RQ1`, `RQ2`, and so on according to question order; synthesis presents those labels rather than UUIDs.                                 |
| Local-model failures collapse into `Failed to fetch` | Resolved | Direct-provider CORS, companion connectivity/origin rejection, provider JSON errors, and incomplete chat-completions paths now produce distinct recovery guidance. |
| Model evidence is difficult to discover              | Resolved | `Choose evidence` opens the Research rail and focuses available grounding; the no-evidence state identifies the required PDF highlight or claim.                   |
| Saved extraction values disappear                    | Resolved | The latest recorded value, provenance, reviewer, and missing reason repopulate the form, and the replacement action is labelled `Supersede value`.                 |
| Blank projects invite an invalid H1                  | Resolved | The source placeholder, accessible editor help, and Blank project description state that chapter sections begin with `##` headings.                                |
| Negative appraisal requires a quotation              | Resolved | Positive answers still require exact evidence; zero-weight or rejecting answers can instead carry a bounded absence rationale.                                     |
| Research file inputs have generic names              | Resolved | Project PDF and BibTeX inputs expose distinct accessible labels.                                                                                                   |
| Template choice has two confirmations                | Resolved | Clicking a template row selects and previews it immediately; `Create project` is the single confirmation.                                                          |
| Stale comments cannot be re-anchored                 | Resolved | Open stale threads expose `Re-anchor to selection`; the replacement anchor preserves the comment identity and historical selector in project revisions.            |

## Second-round finding

The re-anchor behavior initially had domain and Durable Object coverage but no
complete browser-flow assertion. Commit `71126f6` closes that gap by exercising
a collaborative comment from creation through anchor deletion, explicit
re-anchoring to a new selection, and resolution. This was a test-coverage gap,
not an observed product failure.

## Live review notes

- Template rows expose one pressed state, update their structural preview, and
  enable `Create project` without a separate `Use template` action.
- The source editor exposes `Start a chapter section with ## Heading` and is
  described by guidance that names heading level two.
- PDF and BibTeX file inputs are distinguishable in the accessibility tree.
- `Choose evidence` retains the current assistant task while opening Research;
  with no project evidence, the status explains what must be imported or
  authored first.
- The appraisal and extraction stages explain their asymmetric provenance
  rules before the forms.
- Existing resolved stale threads remain immutable, while the new action is
  limited to open stale threads.

The persistent systematic-review mock no longer contained a completed
extraction row during this pass, so extraction repopulation and RQ-labelled
synthesis were rechecked through their focused client/domain tests rather than
by altering the historical review run.

## Automated verification

- Focused Playwright test:
  `converges source edits across two writers` — passed.
- `npm run ci:local` — passed.
  - 743 unit tests passed with the coverage gate.
  - 78 Workers tests passed.
  - 63 Playwright browser tests passed.
  - Formatting, lint, Worker types, TypeScript, client guard, tooling tests,
    and the production dependency audit passed.

The browser run emitted the existing local `Network connection lost` server
message after the relevant requests had completed; the suite continued and
exited successfully.

## Conclusion

The original workflow findings are closed at their reported severity. The
follow-up review found no regression that should block the changes from
landing. Future exploratory work can start with new paper shapes instead of
repeating these four paths, while retaining these flows as regression cases.
