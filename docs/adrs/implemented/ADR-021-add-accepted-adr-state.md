# ADR-021: Add Accepted ADR State

**Status:** Accepted

**Date:** 2026-05-15

**Amends:** [ADR-001](./ADR-001-use-architecture-decision-records.md), [ADR-002](./ADR-002-make-architectural-decisions-explicit.md)

## Context

The repo has used `docs/adrs/proposed/` for drafts and `docs/adrs/implemented/` for accepted decisions. That collapsed two different lifecycle states into one location: a decision can be accepted before the repo has actually implemented it.

That ambiguity is risky for agents and maintainers. An ADR in `implemented/` reads like current architectural reality, but an accepted-yet-unimplemented ADR is only intent. Treating both as implemented can cause later work to rely on behavior, tooling, or constraints that do not exist yet.

ASDLC's ADR guidance already recognizes `Accepted` as a lifecycle state separate from `Proposed`. This repo needs a local folder convention that preserves that distinction without adding heavyweight process.

## Decision

We will add `docs/adrs/accepted/` for ADRs whose decisions are approved but not fully implemented.

The ADR lifecycle folders are:

- `docs/adrs/proposed/` for draft ADRs that are still under review.
- `docs/adrs/accepted/` for approved ADRs whose implementation is still pending or incomplete.
- `docs/adrs/implemented/` for ADRs only after the repository actually reflects the decision.

An ADR must not move to `implemented/` merely because the decision has been approved. The move requires confirming that the relevant code, configuration, documentation, specs, or workflow changes have landed.

Superseded ADRs remain wherever the implemented historical decision lives. If an accepted ADR is superseded before implementation, it can remain in `accepted/` with a superseded status because it never became implemented repo reality.

## Trigger

The ADR index and project guardrails described implemented ADRs as accepted decisions that had been implemented, but the available folders did not provide a place for accepted-only decisions. The user explicitly called out that ADRs should move to implemented only after true implementation and suggested an accepted state.

## Consequences

**Positive:**

- `implemented/` becomes a reliable signal that the repo actually reflects the decision.
- Agents can distinguish architectural intent from current architectural reality.
- Approved future work has a clear place without pretending it has already landed.

**Negative:**

- ADR authors must update one more lifecycle location when moving from approval to implementation.
- The ADR index needs to track an additional section.

**Neutral:**

- Existing implemented ADRs stay in `implemented/` because their decisions are already reflected in the repo or preserved as superseded historical records.
- ADR-001 and ADR-002 remain valid for the ADR baseline, but their two-folder lifecycle placement is amended by this decision.

## Alternatives Considered

### Keep two folders and rely on status text

This was rejected because folder placement is the strongest scanning signal in this repo. If accepted-only ADRs live under `implemented/`, agents and humans have to inspect every status line before trusting current architectural reality.

### Rename `implemented/` to `accepted/`

This was rejected because it would lose the useful stronger meaning of implemented decisions and would make the historical log less precise.

### Track implementation state inside specs only

This was rejected because specs describe current behavior and contracts. ADR lifecycle state belongs with the decision record itself.
