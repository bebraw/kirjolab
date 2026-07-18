# OpenAI Build Week 2026 Submission Notes

## Decision

Submit Kirjolab to the **Work & Productivity** track as an integrated scholarly
workspace that connects research material, evidence, model assistance, and
portable authoring.

Lead with the research-to-authoring loop. Treat the structured SLR/MLR workflow
as an advanced extension rather than the product identity, and leave it out of
the initial three-minute video unless the core story can be shown clearly first.

## Submission Identity

**Working title:** Kirjolab

**One-line description:** An integrated AI-assisted workspace that keeps
scholarly sources, evidence, reasoning, and portable manuscripts connected.

**Core claim:** Most AI research tools generate answers. Kirjolab preserves the
inspectable chain from source evidence, through human-reviewed model assistance,
to the final manuscript.

## Audience and Problem

The initial audience is a researcher-writer who works with scholarly sources,
portable text, citations, and local tools. Their work moves repeatedly between
search, reading, annotation, reasoning, drafting, revision, collaboration, and
publication.

Existing tool chains separate those activities across a reference manager, PDF
reader, notes, AI chat, and manuscript editor. A citation may survive the
handoffs, but the source passage, reasoning, model context, and human decision
behind it become difficult to reconstruct.

## Contest-Period Product Story

The submission should demonstrate one closed loop:

1. Author portable Markdown with a live scientific preview.
2. Open a reference and its PDF beside the manuscript.
3. Preserve an exact highlight as evidence.
4. Connect that evidence to a claim or authored passage.
5. Ask a local model for a bounded operation using selected context.
6. Inspect and explicitly accept, edit, or reject the candidate.
7. Collaborate with anchored comments and recoverable history.
8. Export portable source and publication-ready projections.

The most important product boundary is **AI proposes; the researcher decides**.
Model output is a reviewable candidate with provenance. Rejection changes no
canonical review or manuscript state.

## Eligible Implementation Delta

Kirjolab existed before the July 13 submission-period start. The entry presents
the full product for context while distinguishing the large contest-period
implementation range from the earlier foundation.

### Integrated Build Week range

- **Pre-period baseline:** `8ef9892edc29b8604e58f81e122d0d86f9febd30`
  on July 12 at 22:13 EEST
- **First period commit:** `49810b211316f14ee68ff378123ee6e8525366db`
  on July 13 at 09:40 EEST
- **Current reviewed submission head:** `3f4ac9e`
- **Diff:** 305 commits, 437 files, 78,181 insertions, 15,785 deletions

Inspect that range with:

```bash
git log --reverse --stat 8ef9892..3f4ac9e
git diff --stat 8ef9892..3f4ac9e
```

This broader range includes the integrated research context, editor and preview
refinement, private and project libraries, PDF intake and annotation, evidence-
backed claims, reviewable local-model operations, collaboration and sharing,
scientific import and export, offline and recovery work, and the later
structured-review extension.

### Nested review-study range

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

### Pre-period foundation

The following foundations predate July 13 and must not be represented as newly
built during the contest:

- the core Markdown workspace and scientific preview
- Yjs collaboration and Durable Object document coordination
- the reference library, PDF reader, annotations, and evidence links
- the general local-model provider boundary
- project history, backup, sharing, and production deployment foundations

The video may show the complete running product. Its Build Week slide and
description must identify the dated range above so judges can distinguish
product context from eligible implementation.

### Dated verification evidence

- [`specs/review-studies/spec.md`](../specs/review-studies/spec.md) records the
  implemented feature contract and scenarios.
- [`docs/ui-review-notes-2026-07-17.md`](./ui-review-notes-2026-07-17.md)
  records a complete running review-study walkthrough and its findings.
- [`docs/ui-review-follow-up-2026-07-17.md`](./ui-review-follow-up-2026-07-17.md)
  records the corrections, browser re-review, and passing local CI results.

## Judging-Criteria Case

### Technological implementation

- Portable Markdown and BibTeX with semantic parsing and scientific projections
- Collaborative Yjs text coordinated through Durable Objects and recoverable
  materialized source
- Stable publications, PDFs, annotations, claims, passages, and model candidates
- Provider-neutral local-model operations with immutable context and explicit
  disposition
- Structured SLR/MLR authority as an extension of the same evidence model
- Domain, Workers-runtime, browser, security, accessibility, and mutation tests

### Design

- One split workspace for meaningful source, scientific preview, and research
  context
- Direct navigation among citations, references, PDFs, annotations, claims, and
  authored passages
- Explicit model target, evidence, provider, candidate, accept, and reject states
- No hidden mutation of research relationships or authored prose

### Potential impact

- Reduces the coordination cost between reading, reasoning, writing, and
  publishing
- Makes model assistance usable in audit-sensitive scholarly work
- Keeps evidence connected to claims and manuscript passages
- Preserves portable Markdown, BibTeX, source artifacts, and publication outputs

### Quality of the idea

The differentiator is not generic AI writing. It is an inspectable path from a
source passage to evidence, reasoning, a human-reviewed model candidate, and
cited prose—inside one portable authoring workflow.

## Three-Minute Video Outline

- **0:00–0:18 — Problem:** The evidence trail fades across disconnected research
  and writing tools.
- **0:18–0:45 — Author:** Show portable Markdown and the live scientific preview.
- **0:45–1:15 — Research:** Open a reference, PDF, and exact annotation beside
  the manuscript.
- **1:15–1:45 — Connect:** Show evidence supporting a claim and authored passage.
- **1:45–2:15 — Assist:** Review a bounded local-model candidate with explicit
  evidence, model identity, and accept or reject controls.
- **2:15–2:35 — Collaborate and export:** Show comments or history and portable
  source plus publication projections.
- **2:35–2:56 — Build Week and close:** Identify the full July 13 onward range,
  verified Codex/GPT-5.6 contribution, and core product principle.

## Submission Requirements

Source of truth:

- <https://openai.devpost.com/>
- <https://openai.devpost.com/rules>

Deadline: **July 21, 2026 at 5:00 PM PDT**, or **July 22 at 03:00 EEST**.

- [ ] Join the challenge and choose Work & Productivity.
- [x] Draft the English Devpost project description.
- [ ] Add verified GPT-5.6/session facts and paste the description into Devpost.
- [ ] Upload a public YouTube demonstration shorter than three minutes.
- [x] Draft the timed three-minute demo script and shot plan.
- [x] Produce and validate the initial SLR-focused review cut.
- [x] Produce the integrated research-to-authoring cut with the styled slide set.
- [ ] Approve and record the final human narration.
- [x] License the repository for public judging under MIT.
- [x] Verify that the GitHub repository is publicly visible.
- [ ] Push the submission materials and MIT license to public `main`.
- [ ] Make a working project available to judges.
- [x] Document setup, sample data, the eligible implementation delta, and Codex
      collaboration in the README.
- [ ] Provide the qualifying `/feedback` Codex Session ID.
- [ ] Verify and document GPT-5.6 use during the submission period.
- [ ] Keep the working project available through the judging period.

### Owner-only handoff

These actions require the entrant's accounts, original Codex thread, or release
authority and are intentionally not performed by repository automation:

| Action                     | Exact completion condition                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Join challenge             | Devpost shows Kirjolab under the entrant's projects in Work & Productivity.                                    |
| Complete description       | The draft is pasted into Devpost with verified GPT-5.6 and session facts.                                      |
| Publish repository updates | Local submission commits are pushed to public `main`, and GitHub recognizes the MIT license.                   |
| Publish demo               | The approved sub-three-minute MP4 is uploaded as a public YouTube video and linked in Devpost.                 |
| Provide working project    | A deployed judge URL is smoke-tested, or Devpost explicitly directs judges to the credential-free local guide. |
| Provide Codex evidence     | The qualifying original thread supplies its `/feedback` identifier and exact active model.                     |
| Maintain availability      | Repository, video, and working project remain unchanged and accessible until the judging period ends August 5. |

Before pressing **Submit**, open every public link in a signed-out browser
window and confirm that no private credentials, research material, or local-only
paths appear in the Devpost entry.

Judge setup and synthetic sample data are maintained in the
[Build Week judge guide](./build-week-2026-judge-guide.md). The local macOS path
is credential-free; the final hosted URL remains a submission blocker until it
has been deployed and smoke-tested.

The English submission copy is maintained in the
[Devpost description draft](./build-week-2026-devpost-description.md). It is
ready except for the qualifying GPT-5.6 and session facts that only the original
Codex thread can establish.

The timed narration and shot sequence are maintained in the
[three-minute demo script](./build-week-2026-demo-script.md). The generated
integrated cut must retain its verification warning until the original Codex thread
facts are inserted.

The superseded SLR-focused review cut is generated at
`.generated/build-week-demo/kirjolab-build-week-review-cut.mp4` and is excluded
from version control. It was validated on July 18 at 2:52.72, 1920×1080, with
H.264 video and AAC narration. Keep it only as production evidence; the public
demonstration should use the integrated script and styled slide set.

The integrated review cut is generated at
`.generated/build-week-demo/integrated/kirjolab-build-week-integrated-review-cut.mp4`.
It was validated on July 18 at 2:58, 1920×1080, with H.264 video, 48 kHz AAC
narration, and normalized audio headroom. Its title, Build Week, and closing
frames come from the committed
[demo slide set](./build-week-2026-demo-deck.html). It remains a review artifact
until the qualifying GPT-5.6 contribution and `/feedback` session ID replace the
visible verification marker and synthetic narration.

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
original Codex thread in which most of the contest-period functionality was built.

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
5. Compare the thread transcript with `8ef9892..3f4ac9e` and identify the commits
   containing the majority of the core functionality.
6. Capture dated screenshots or exported session evidence as a backup in case
   the judging team requests verification.

The public description should explain where Codex accelerated implementation,
testing, and review. It should also identify the decisions retained by the
author: the product direction, provenance model, human-disposition boundary,
portable artifacts, and contest scope.

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
