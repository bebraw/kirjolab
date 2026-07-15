# ADR-109: Draft Reviewed Evidence-Backed Claims

**Status:** Proposed

**Date:** 2026-07-15

**Amends:** [ADR-039](../implemented/ADR-039-require-reviewable-model-operations.md),
[ADR-047](../implemented/ADR-047-model-evidence-backed-claims.md), and
[ADR-056](../implemented/ADR-056-persist-grounded-passage-revisions.md)

## Context

Kirjolab already preserves annotations separately from researcher-authored
claims and requires model output to cross a candidate-review-apply boundary.
The only implemented model operation revises a selected manuscript passage.
Researchers must still manually turn a set of related annotations into an
initial claim before they can use that claim in writing.

A model can help draft that proposition, but it must not silently decide the
epistemic relationship between evidence and claim or write directly into the
canonical claim graph. A first implementation should also avoid a multi-item
approval workflow before the single-candidate review contract is proven.

## Decision

Add one `draft-claim` model operation with prompt version `draft-claim-v1`.
Each request uses one to twelve current annotation snapshots, one bounded
research instruction, one researcher-selected evidence relation, and the
configured local provider identity. Claims are not accepted as evidence for
this operation because that would draft a claim from another conclusion rather
than from preserved source material.

The local provider returns one bounded proposition and optional working note.
Kirjolab persists them as a project-scoped model candidate together with the
immutable annotation snapshots, instruction, relation, provider, model, and
prompt version. The relation is never inferred or overridden by the model.

Applying a current pending candidate revalidates every annotation version and
atomically creates one ordinary `ClaimResource`, its typed evidence links, a
logical project revision, and the accepted candidate status. Rejecting changes
only candidate status. Editing the resulting claim continues through the
existing claim workflow.

Reuse the Writing assistant and resource-keyed candidate review Context tab.
The assistant explicitly switches between passage revision and claim drafting;
it does not infer the operation from current selection state. The first slice
returns exactly one candidate claim per request.

## Trigger

The completed first vertical slice exposed a natural next step between PDF
annotation and authored prose: help the researcher formulate a reviewable
claim without weakening provenance or human control.

## Consequences

**Positive:**

- The annotation-to-claim workflow gains local-model assistance while retaining
  explicit human acceptance.
- Accepted output uses the existing claim and evidence-link model rather than a
  parallel generated-claim type.
- Researchers control whether evidence supports, contradicts, or extends the
  drafted proposition.
- One proposal per request keeps review, persistence, and stale-input behavior
  understandable.

**Negative:**

- Synthesizing several plausible claims requires several requests.
- A changed or deleted annotation makes a pending candidate inapplicable even
  though its immutable snapshots remain inspectable.
- Candidate persistence gains a second operation-specific SQLite table and
  projection.

**Neutral:**

- The hosted Worker still performs no model-provider network request.
- Passage revision behavior and its Yjs-relative target contract do not change.
- Claims remain editable after acceptance through the normal human-authored
  claim workflow.

## Alternatives Considered

### Return several claims in one candidate

Batch output can reduce provider calls, but it introduces partial acceptance,
per-proposal lifecycle state, and more complex stale-evidence semantics. One
claim proves the operation with the smaller architecture.

### Let the model choose evidence relations

The model may describe why a proposition follows from evidence, but assigning
`supports`, `contradicts`, or `extends` is a scholarly judgment that should
remain explicit and inspectable.

### Create claims immediately after provider output

This removes a click but violates the established review boundary and would
make model output canonical before the researcher inspects its evidence and
wording.
