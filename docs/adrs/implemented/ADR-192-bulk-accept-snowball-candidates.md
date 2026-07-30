# ADR-192: Bulk Accept Snowball Candidates

**Status:** Implemented

**Date:** 2026-07-30

**Amends:** [ADR-138](./ADR-138-accept-snowball-candidates-atomically.md)

## Context

Backward and forward citation expansion can return dozens of DOI candidates.
Each candidate could be saved safely, but accepting them one at a time repeated
the expansion fetch and made a reviewed snowballing round needlessly laborious.
PDF bibliography review already established a bounded all-or-nothing batch
pattern for the same owner Library.

## Decision

The existing citation-candidate endpoint accepts either one DOI or a unique
batch of at most 25 DOIs. Batch acceptance refetches and fingerprints the seed
expansion once, verifies every requested DOI belongs to that response, and
fetches complete provider metadata before any Library mutation.

The owner-scoped Durable Object validates the complete metadata batch and saves
or reuses every reference with its directional provider assertion in one
synchronous transaction. A provider or validation failure leaves the entire
batch unchanged. The browser retains candidates after failure and removes only
the accepted DOIs after success.

## Consequences

**Positive:**

- A researcher can turn one reviewed expansion round into a traversable trail
  without repetitive acceptance requests.
- The browser still cannot supply canonical metadata or attach an unrelated
  DOI to a provider response.
- Reference and assertion writes remain all-or-nothing.

**Negative:**

- A batch can perform up to 25 metadata requests before its transaction.
- One unavailable candidate prevents the batch from committing; the individual
  save control remains available for recovery.
- Expansion rounds larger than 25 require another bounded batch.

## Alternatives Considered

### Send 25 independent browser requests

This preserves the single-candidate endpoint but repeats the expansion fetch,
cannot commit atomically, and makes partial failure difficult to explain.

### Trust metadata already rendered in the browser

This reduces provider traffic but breaks the fingerprinted trust boundary.

### Import all 128 provider candidates automatically

This exceeds the chosen request bound and removes the researcher's explicit
selection step.
