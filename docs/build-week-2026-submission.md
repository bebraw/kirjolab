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
- [ ] Make the repository and a working project available to judges.
- [ ] Document setup, sample data, the eligible implementation delta, and Codex
      collaboration in the README.
- [ ] Provide the qualifying `/feedback` Codex Session ID.
- [ ] Verify and document GPT-5.6 use during the submission period.
- [ ] Keep the working project available through the judging period.

## Scope Guardrails

- Do not demo the entire Kirjolab feature inventory.
- Do not add an OpenAI runtime dependency solely for contest branding.
- Do not describe pre-existing infrastructure as contest-period work.
- Do not claim a GPT-5.6 model, session, deployment, or judge credential until it
  has been verified.
- Do not let setup instructions depend on private research material.
- Do not weaken the local-model and explicit-human-review product boundaries.
