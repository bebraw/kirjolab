# OpenAI Build Week 2026 Submission Notes

## Decision

Submit Kirjolab to the **Work & Productivity** track as a focused extension for
auditable systematic and multivocal literature reviews.

Do not present the complete scholarly workspace as the contest-period project.
Present the review-study workflow added during Build Week and show how it uses
Kirjolab's existing evidence and manuscript boundaries.

## Submission Identity

**Working title:** Kirjolab Review

**One-line description:** An auditable AI-assisted workspace that turns
systematic-review evidence into traceable scholarly writing.

**Core claim:** Most AI research tools generate answers. Kirjolab preserves the
inspectable chain from source evidence, through human-reviewed model assistance,
to the final manuscript.

## Audience and Problem

The initial audience is a researcher or research team conducting a systematic
literature review (SLR) or multivocal literature review (MLR). Their work spans
protocol design, several search systems, duplicate records, independent
screening, quality appraisal, structured extraction, synthesis, reporting, and
manuscript writing.

Existing tool chains often separate those stages and make it difficult to
reconstruct why a study, value, finding, or generated passage entered the final
work. Model assistance raises the stakes: a plausible result is not useful when
its evidence, prompt scope, model identity, and human disposition cannot be
inspected.

## Contest-Period Product Story

The submission should demonstrate one closed loop:

1. Define and freeze a versioned review protocol.
2. Generate source-specific search queries.
3. Import and deduplicate records without losing source occurrences.
4. Record attributed, append-only screening decisions.
5. Appraise studies and extract typed values with exact evidence.
6. Review a bounded model candidate instead of accepting an automatic mutation.
7. Derive revision-pinned synthesis and PRISMA reporting.
8. Publish a review artifact into the manuscript.
9. Export a deterministic review package with digests and disclosure.

The most important product boundary is **AI proposes; the researcher decides**.
Model output is a reviewable candidate with provenance. Rejection changes no
canonical review or manuscript state.

## Eligible Implementation Delta

Kirjolab existed before the July 13 submission-period start. The entry asks
judges to evaluate the review-study extension, not the pre-existing product.

### Primary review-study range

- **Baseline:** `2a953f60dfd477deb7fd19d73158dd7ab73f7e03`
- **First review-study commit:**
  `918f2ad8c3d583ba82cd9ea7e36189a67a6d9ce5` on July 17 at 13:12 EEST
- **Reviewed implementation head:** `71126f6` on July 17 at 17:08 EEST
- **Diff:** 30 commits, 69 files, 8,747 insertions, 155 deletions

Inspect that range with:

```bash
git log --reverse --stat 2a953f6..71126f6
git diff --stat 2a953f6..71126f6
```

The focused feature sequence is:

1. `918f2ad` — accept the review-study architecture and feature contract.
2. `f00d710` — add protocol planning and source-query generation.
3. `dd1ead6` — add immutable search imports and deduplication.
4. `96b2bf3` — add staged screening and adjudication.
5. `a699124` — add evidence-linked appraisal and extraction.
6. `e84c86b` — add revision-pinned synthesis and manuscript artifacts.
7. `7fe3d0e` — add reviewable local-model candidates.
8. `8abd277` — add reproducible reports and deterministic exports.
9. `be0c249..71126f6` — audit the running workflow, repair findings, and
   complete browser coverage.

### Pre-existing product boundaries

The following capabilities provide context but are not claimed as the focused
contest-period implementation:

- the core Markdown workspace and scientific preview
- Yjs collaboration and Durable Object document coordination
- the reference library, PDF reader, annotations, and evidence links
- the general local-model provider boundary
- project history, backup, sharing, and production deployment foundations

The submission may show those surfaces only where the new review workflow uses
them—for example, selecting existing PDF evidence or publishing synthesis into
an existing manuscript.

### Dated verification evidence

- [`specs/review-studies/spec.md`](../specs/review-studies/spec.md) records the
  implemented feature contract and scenarios.
- [`docs/ui-review-notes-2026-07-17.md`](./ui-review-notes-2026-07-17.md)
  records a complete running review-study walkthrough and its findings.
- [`docs/ui-review-follow-up-2026-07-17.md`](./ui-review-follow-up-2026-07-17.md)
  records the corrections, browser re-review, and passing local CI results.

## Judging-Criteria Case

### Technological implementation

- Project-associated SQLite-backed Durable Object state with monotonic revisions
- Versioned protocols, immutable search runs, append-only decisions, and
  explicit adjudication
- Typed appraisal, extraction, synthesis, model-candidate, and export contracts
- Deterministic JSON, CSV, BibTeX, PRISMA, and digest-manifested ZIP outputs
- Domain, Workers-runtime, browser, security, accessibility, and mutation tests

### Design

- One task sequence: Plan, Search, Screen, Appraise, Extract, Synthesize, Report
- Human-readable research-question labels and visible provenance
- Explicit freeze, conflict, supersede, accept, reject, and publish actions
- No hidden model mutation of evidence, decisions, or authored prose

### Potential impact

- Reduces the manual coordination cost of evidence reviews
- Makes model assistance usable in audit-sensitive scholarly work
- Keeps review outputs connected to the manuscript rather than stranded in a
  separate export tool
- Preserves portable Markdown, BibTeX, review data, and reporting artifacts

### Quality of the idea

The differentiator is not generic AI writing. It is a reproducible path from a
registered protocol and retained source evidence to human-reviewed assistance,
pinned synthesis, and cited prose.

## Three-Minute Video Outline

- **0:00–0:20 — Problem:** Research review decisions and AI output lose their
  evidence trail across disconnected tools.
- **0:20–0:50 — Plan:** Show an SLR protocol, research questions, concept groups,
  source queries, and protocol freeze.
- **0:50–1:20 — Search and screen:** Import a small BibTeX set, retain search
  provenance, deduplicate, and record one screening decision.
- **1:20–1:50 — Grounded assistance:** Generate a screening or extraction
  candidate from selected evidence and explicitly accept, edit, or reject it.
- **1:50–2:20 — Synthesize:** Show PRISMA counts, an evidence matrix, and a
  revision-pinned manuscript artifact.
- **2:20–2:40 — Export:** Open the deterministic review package, manifest, and
  model disclosure.
- **2:40–2:58 — Build Week delta:** Identify the eligible commit range and
  explain where Codex and GPT-5.6 accelerated the work and where human product,
  architecture, and design decisions were made.

## Submission Requirements

Source of truth:

- <https://openai.devpost.com/>
- <https://openai.devpost.com/rules>

Deadline: **July 21, 2026 at 5:00 PM PDT**, or **July 22 at 03:00 EEST**.

- [ ] Join the challenge and choose Work & Productivity.
- [ ] Provide an English project description.
- [ ] Upload a public YouTube demonstration shorter than three minutes.
- [x] License the repository for public judging under MIT.
- [x] Verify that the GitHub repository is publicly visible.
- [ ] Push the submission materials and MIT license to public `main`.
- [ ] Make a working project available to judges.
- [x] Document setup, sample data, the eligible implementation delta, and Codex
      collaboration in the README.
- [ ] Provide the qualifying `/feedback` Codex Session ID.
- [ ] Verify and document GPT-5.6 use during the submission period.
- [ ] Keep the working project available through the judging period.

Judge setup and synthetic sample data are maintained in the
[Build Week judge guide](./build-week-2026-judge-guide.md). The local macOS path
is credential-free; the final hosted URL remains a submission blocker until it
has been deployed and smoke-tested.

### Repository route

Use the public repository at <https://github.com/bebraw/kirjolab>. The root MIT
license permits judging, testing, reuse, and distribution without requiring the
private-repository invitation path. Before submission, verify that the remote
default branch contains the eligible commits, submission notes, judge guide, and
license.

Public visibility was verified on July 18, 2026. At that check, remote `main`
ended at `6dbdf4d` and did not yet contain the local submission commits through
`0dff528`; pushing remains an owner action.

## Codex and GPT-5.6 Evidence Gate

**Submission blocker:** the qualifying session and its active model have not yet
been recorded in this repository. Do not submit until both are verified from the
original Codex thread in which most of the focused review-study functionality was
built.

Required evidence packet:

| Evidence                         | Required value                                   | Status     |
| -------------------------------- | ------------------------------------------------ | ---------- |
| Qualifying Codex thread          | Original thread containing most core work        | Unverified |
| Active model                     | GPT-5.6 shown for the qualifying work            | Unverified |
| Codex feedback identifier        | Identifier returned through the `/feedback` flow | Unverified |
| Session-to-commit correspondence | Focused commits attributable to that thread      | Unverified |
| Human decision record            | Product, architecture, and design choices        | Drafted    |

Verification procedure:

1. Reopen the original qualifying Codex thread; do not create a replacement
   submission-preparation thread.
2. Use `/status` to inspect and capture the thread identifier and active model.
   `/status` is supporting evidence and does not replace the contest's required
   `/feedback` identifier.
3. Run `/feedback` in that original thread and complete the displayed flow with
   logs included when offered.
4. Record the exact returned identifier and the exact model label in the private
   Devpost draft before copying either into public documentation.
5. Compare the thread transcript with `2a953f6..71126f6` and identify the commits
   containing the majority of the core functionality.
6. Capture dated screenshots or exported session evidence as a backup in case
   the judging team requests verification.

The public description should explain where Codex accelerated implementation,
testing, and review. It should also identify the decisions retained by the
author: the review authority, provenance model, human-disposition boundary,
portable artifacts, and focused contest scope.

The Codex manual documents `/status` as the session-configuration view and
`/feedback` as the feedback-and-logs flow. The Build Week rules, not the general
Codex manual, are the source of truth for the contest-specific identifier.

## Scope Guardrails

- Do not demo the entire Kirjolab feature inventory.
- Do not add an OpenAI runtime dependency solely for contest branding.
- Do not describe pre-existing infrastructure as contest-period work.
- Do not claim a GPT-5.6 model, session, deployment, or judge credential until it
  has been verified.
- Do not let setup instructions depend on private research material.
- Do not weaken the local-model and explicit-human-review product boundaries.
