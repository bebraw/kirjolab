# ADR-189: Reconcile Library References Explicitly

**Status:** Implemented

**Date:** 2026-07-29

## Context

Reference intake can create two stable Library identities for the same work.
This is expected when one record arrives with a DOI and another begins as a
provisional PDF record. Automatically collapsing likely matches risks losing
private research, choosing inferior metadata, or rewriting project citation
aliases across independent Durable Objects without review.

The owner Library already contains the private artifacts and citation
assertions that can be moved transactionally. Project links, captured web
history, and project shares cross additional authority boundaries.

## Decision

Kirjolab will report only strong reconciliation candidates: equal normalized
DOIs, or equal normalized title, publication year, and first-author surname.
Conflicting non-empty DOIs never form a candidate.

The owner must choose which record remains canonical. The Library Durable
Object revalidates the match and both record timestamps, then moves private
artifacts, notes, highlights, PDF markups, organization, reading state, PDF
review links, and citation assertions in one synchronous transaction. Existing
canonical metadata wins; missing canonical fields may be filled from the
duplicate with provenance. The duplicate becomes a soft-deleted tombstone.

A record with a project dependency, captured web history, or research share
cannot be selected as the duplicate. The owner must first remove that external
dependency. This keeps reconciliation inside one authority instead of
attempting a distributed project rewrite.

## Consequences

**Positive:**

- Duplicate detection is reviewable and cannot silently conflate uncertain
  works.
- Private research and citation trails move atomically with their stable
  identities.
- Stale browser decisions and cross-authority rewrites fail safely.

**Negative:**

- Some legitimate duplicates with incomplete author or year metadata are not
  suggested.
- Linked records require an explicit unlink or share cleanup before they can be
  merged away.
- The tombstone remains in storage for referential history and recovery work.

## Alternatives Considered

### Merge automatically during intake

This reduces cleanup but makes a probabilistic identity decision irreversible
before the researcher can compare metadata and attached research.

### Rewrite every linked project during reconciliation

This is more convenient but requires a distributed transaction across owner
and project Durable Objects, including alias-collision policy and partial
failure recovery.

### Keep both records and add an equivalence edge

This preserves all identities but leaves searches, exports, reading state, and
citation graphs duplicated. Equivalence may still be useful for less certain
matches later, but it does not resolve strong duplicates.
