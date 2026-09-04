# ADR-235: Stress-Test Claims with Researcher Questions

**Status:** Implemented

**Date:** 2026-09-04

**Amends:** [ADR-119](./ADR-119-model-writing-as-typed-contextual-operations.md)

## Context

Kirjolab already separates source annotations from researcher-authored claims,
records typed evidence relationships, and lets a writing model propose
reviewable passage revisions. Those contracts make the evidence and conclusion
inspectable, but they do not help the researcher examine the inferential bridge
between them or the conditions that limit a manuscript claim.

Toulmin's argument layout distinguishes the claim and data from the warrant
that connects them, backing for that warrant, the qualifier that calibrates the
claim, and reservations under which it may not hold. Requiring that full layout
as persistent metadata would impose one argumentative vocabulary across
disciplines before Kirjolab has evidence that researchers want to maintain it.
Automatically scoring prose against the layout would be weaker still because
warrants are frequently implicit and field-dependent.

## Decision

Add `stress-test-claim` as a typed, transient Writing assistant operation. It
uses one exact visible manuscript target, one to twelve selected annotation or
claim evidence snapshots, a bounded researcher instruction, and the captured
source revision.

The first provider request returns exactly three bounded assessments and
questions, presented to the researcher as **Reasoning**, **Scope and strength**,
and **Exceptions**. The model may identify what needs examination, but it must
not supply the missing reasoning, assume an unstated inference is true, invent
counterevidence, or assign an argument-quality score.

The researcher answers all three questions in their own words. A second typed
request may then return two to four bounded complete passage replacements based
only on the supplied evidence and those answers. Choosing one replacement
creates an ordinary `revise-selection-v1` candidate with the original evidence
references, target, and source revision. Existing exact-target review, stale-
base rejection, explicit apply, and rejection behavior remain authoritative.

Keep the questions, assessments, unchosen revisions, and researcher answers
browser-local except for the bounded instruction recorded on the chosen normal
revision candidate. Do not add Toulmin fields to `ClaimResource`, introduce an
argument score, or persist a second argument graph in this slice.

Do not equate Kirjolab's `contradicts` evidence relation with a Toulmin
reservation. Contradictory evidence is a source relationship; the Exceptions
answer records the researcher's statement of conditions under which the
inference may fail. Backing for warrants remains out of scope until a durable
argument unit can distinguish evidence for a claim from evidence for its
reasoning.

## Trigger

The evidence-to-claim workflow exposed a useful next question: not merely
whether evidence is attached, but why that evidence supports the visible claim
and how far the conclusion can responsibly travel.

## Consequences

**Positive:**

- Researchers remain the source of warrants, qualifications, and exceptions.
- The assistant can expose overbroad or implicit reasoning without claiming to
  judge scientific validity.
- A useful Toulmin-inspired workflow lands without a schema migration or new
  canonical file format.
- Chosen wording reuses the established evidence-bearing candidate boundary.

**Negative:**

- The reasoning analysis is not retained as independently searchable project
  knowledge.
- Three required answers add friction compared with a one-shot rewrite.
- The model can still ask an unhelpful question, though it cannot turn that
  question into a canonical edit without researcher input and review.

**Neutral:**

- Existing claims, evidence links, and manuscript links do not change.
- The operation uses reader-facing language rather than requiring researchers
  to learn Toulmin terminology.
- A later durable argument model requires a separate decision based on observed
  use of this transient workflow.

## Alternatives Considered

### Persist All Six Toulmin Elements on Every Claim

This would make argument structure searchable, but a warrant can apply to a
particular group of evidence rather than to the claim globally. Flat claim
fields would encode that relationship poorly and impose unused structure on
simple or discipline-specific claims.

### Add a Deterministic Toulmin Editing Pass

Local cues are appropriate for observable syntax such as missing citations.
They cannot reliably distinguish evidence from an implicit warrant or decide
whether a qualifier is scientifically appropriate, so such a pass would risk
presenting a contextual judgment as a deterministic finding.

### Ask the Model to Rewrite in One Step

A one-shot prompt would be smaller, but it would encourage the model to invent
the missing inferential bridge and exceptions. The two-stage operation makes
researcher judgment an explicit input before any wording is proposed.
