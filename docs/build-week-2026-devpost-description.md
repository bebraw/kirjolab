# Devpost Project Description — Kirjolab

## Elevator Pitch

Kirjolab is an integrated, AI-assisted workspace that keeps scholarly sources,
evidence, reasoning, and portable manuscripts connected.

## Inspiration

Research and writing are usually split across a reference manager, PDF reader,
notes, AI chat, and manuscript editor. Each handoff loses context. A citation may
remain, but the highlighted passage, reasoning, model context, and human decision
behind it are difficult to reconstruct.

We built Kirjolab around one idea: writing and working memory are the same
scholarly system. Evidence should remain inspectable as it becomes a claim, a
citation, and finally prose.

## What It Does

- authors portable Markdown and BibTeX with a live scientific preview
- keeps project references, PDFs, annotations, claims, and notes beside the
  manuscript
- links exact source evidence to claims and authored passages
- imports and refines scholarly metadata through reviewable provider matches
- lets local models explain, compare, draft claims, and revise selected passages
  using explicit context
- records model identity, supplied evidence, and candidate disposition before
  any accepted change reaches canonical source
- supports live collaboration, anchored comments, recoverable history, sharing,
  and offline manuscript edits
- exports portable source plus PDF, LaTeX, bibliography, figures, and statistics
- extends the same evidence model into structured SLR and MLR workflows when a
  project needs protocol, screening, extraction, synthesis, and PRISMA reporting

The core boundary is simple: **AI proposes; the researcher decides.**

## How We Built It

Kirjolab runs on Cloudflare Workers, Durable Objects, and R2. Markdown remains
the canonical authored representation. Relational scholarly resources preserve
stable identities for publications, PDFs, annotations, claims, passages, and
model candidates. Yjs coordinates collaborative text while regular
materialization keeps the project recoverable as ordinary files.

Model operations are provider-neutral, local-capable, and scoped to explicit
resources. Applying a candidate is a separate operation with stale-context
checks; models never receive direct write access to the manuscript or research
graph.

Codex accelerated implementation across the integrated workspace: research
context, evidence-backed claims, local-model operations, collaboration,
scientific import and export, structured reviews, automated tests, and repeated
browser-based UI audits. Repository instructions, specifications, and
architecture decisions kept changes reviewable while the author retained
product and architectural judgment.

## Challenges

The difficult part was not generating text. It was preserving authority across
collaborative source, imported material, annotations, claims, model candidates,
derived previews, and exports without letting a convenient representation become
the only copy of the work.

Another challenge was making provenance useful in the interface. Evidence and
model metadata must stay close enough to the writing task to guide decisions,
without overwhelming the authoring surface.

## Accomplishments

- A complete source-to-evidence-to-prose loop rather than a disconnected AI chat
- Human-review boundaries enforced in domain, persistence, and interface layers
- Portable Markdown and BibTeX as durable artifacts
- Credential-free local development and support for local language models
- Collaboration, recovery, scientific export, and structured-review workflows
  on one scholarly resource model
- Extensive unit, Workers-runtime, browser, accessibility, security, and
  mutation coverage

## What We Learned

Trustworthy research assistance depends more on explicit context and reviewable
state transitions than on a larger prompt. Small typed model tasks are easier to
inspect, reject, retry, and run locally. Research tools also become more useful
when reading and writing are two views of the same resources instead of separate
applications joined by import and export.

## What's Next

Next steps include richer scholarly-provider adapters, deeper evaluations of
evidence-grounded model operations, additional publication projections, and
continued refinement of the structured-review extension.

## How We Used GPT-5.6 and Codex

The qualifying Codex thread, **Fix iPad PDF review issues**, used GPT-5.6 under
the exact model label `gpt-5.6-sol`. It was the largest single integrated
implementation session in the submission period. Codex helped implement and
test PDF annotation, the research library, reviewable writing assistance,
project templates, editor and preview behavior, citations, settings, and the
internal design system. The author directed the product boundaries, reviewed
the results, and required focused commits and quality gates throughout.

The `/feedback` flow uploaded the qualifying thread under Session ID
`019f6472-5ece-7cd3-b66f-ba344ba9e812`.

## Submission Links

- **Source and test build:** <https://github.com/bebraw/kirjolab>
- **Judge walkthrough:**
  <https://github.com/bebraw/kirjolab/blob/main/docs/build-week-2026-judge-guide.md>
- **Public YouTube demo:** insert after upload
- **Hosted app:** omit unless unrestricted judge access has been arranged
