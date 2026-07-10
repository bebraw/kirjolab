# ADR-047: Model Evidence-Backed Claims

**Status:** Implemented

**Date:** 2026-07-10

## Context

Kirjolab can capture PDF annotations and link them directly to manuscript text,
but its architectural vision identifies a claim as the meaningful middle of the
scholarly path: source material becomes an annotation, annotations inform a
proposition, and the proposition becomes authored prose.

Embedding claim text inside annotations would conflate an observation with the
researcher's interpretation. Embedding evidence ids inside a claim record would
also hide whether evidence supports, contradicts, or extends the proposition
and make those relationships difficult to navigate independently.

## Decision

Model a claim as a stable, workspace-scoped resource containing a concise
proposition, an optional working note, and creation/update timestamps. Claims
are human-authored in this slice and have no workflow status.

Model claim evidence as separate typed links from annotations to claims. The
initial evidence vocabulary is `supports`, `contradicts`, and `extends`. A
claim-annotation pair has at most one current evidence relationship. Creating a
claim requires at least one annotation; updating it atomically replaces the
complete evidence set so the representation cannot expose a partially updated
argument.

Model manuscript usage as a separate `used-in` link from a claim to an exact
current source range. Validate the selected excerpt against materialized
Markdown before storing the link, matching the existing annotation-passage
boundary.

Store claims and their links in the document's SQLite-backed `DocumentRoom`.
They belong to the same workspace consistency boundary as annotations,
materialized source, and other scholarly relationships. Deleting a claim
cascades to its evidence and passage links but never deletes or modifies the
source annotations or manuscript text.

Language models may later propose claims through the candidate-review-apply
boundary in ADR-039. They do not create canonical claims directly.

## Trigger

The evidence-backed claims slice implements the missing annotation-to-claim-to-
prose path in the architectural vision.

## Consequences

**Positive:**

- Observations, interpretations, and authored prose retain distinct identities.
- Evidence semantics remain explicit and independently navigable.
- Claims can be revised without altering their source material.
- The model supports later human or model-assisted synthesis through one
  provenance contract.

**Negative:**

- Replacing the evidence set requires deliberate transactional write behavior.
- Range-backed manuscript links can become stale as collaborative source moves.
- The first claim model does not include review status, authorship attribution,
  or claim version history.

**Neutral:**

- Claims remain workspace resources rather than portable Markdown syntax.
- A later export format may serialize claim provenance without changing the
  canonical manuscript.

## Alternatives Considered

### Store claims as annotation comments

This is simpler but collapses quoted evidence and interpretation into one
resource and cannot synthesize a proposition from multiple annotations.

### Store evidence ids directly on each claim

An id list would represent membership but not whether evidence supports,
contradicts, or extends the claim.

### Let a model extract claims directly into storage

This shortens the interaction but bypasses the review boundary required for
model-generated scholarly assertions.

### Add a claim workflow state machine now

Draft, reviewed, and accepted states may become useful, but they add policy
before the basic evidence-to-prose workflow has been exercised.
