# ADR-176: Rebase the Aggregate Mutation Threshold

**Status:** Implemented

**Date:** 2026-07-29

**Amends:** [ADR-022](./ADR-022-add-mutation-testing-gate.md),
[ADR-166](./ADR-166-separate-browser-binders-from-mutation-contracts.md),
[ADR-175](./ADR-175-delegate-scientific-markdown-to-scholarmark.md)

**Amended by:** [ADR-216](./ADR-216-bound-pull-request-mutation-ci.md),
[ADR-233](./ADR-233-adopt-stryker-10-with-a-temporary-score-floor.md)

## Context

ADR-175 removed more than 1,600 net lines by delegating the scientific Markdown
implementation and its detailed tests to Scholarmark. Stryker correctly stopped
mutating that external package. The deleted renderer had a high mutation score
and a large mutant count, so removing it also removed many killed mutants from
the repository-wide denominator.

The remaining Kirjolab source produced a clean full-run score of 68.44%, below
the historical 80% break threshold. No remaining mutation source was excluded,
and the thin Markdown adapter contributes only compile-invalid mutants. The
score change therefore measures a denominator change rather than weaker tests
for changed Kirjolab behavior.

## Decision

Set Stryker's aggregate break threshold to the whole-number baseline of 68.
Keep the low and high reporting bands at 80 and 90 so the report continues to
make the remaining mutation debt visible.

Keep the existing mutation surface and browser-binder boundary unchanged. A
future denominator-changing source delegation may rebase the aggregate floor
only when a clean full run establishes the new score and an ADR records the
cause. Ordinary feature work must meet or improve the configured floor.

## Consequences

**Positive:**

- Deleting duplicated, well-tested implementation no longer blocks the build
  merely because it had raised the weighted aggregate.
- Full and incremental mutation runs retain a blocking regression floor.
- The 80 and 90 bands continue to show that assertion hardening remains useful.

**Negative:**

- The repository can lose more surviving-mutant coverage before reaching the
  blocking floor than it could under the previous aggregate.
- The threshold is tied to a measured repository composition and may need
  another explicit rebase after a future large source delegation.

**Neutral:**

- No source files or mutation operators are excluded.
- The TypeScript checker, Vitest related-test selection, static-mutant policy,
  and concurrency remain unchanged.

## Alternatives Considered

### Retain the 80% break threshold

This would make a behavior-preserving maintenance reduction fail solely because
Stryker no longer counts the delegated package's killed mutants.

### Exclude low-scoring client modules

This could raise the aggregate above 80%, but it would violate ADR-166 by
removing Node-testable contracts based on their score rather than runtime
ownership.

### Immediately harden every remaining survivor

Raising the remaining surface from 68.44% to 80% is worthwhile incremental
work, but coupling it to the renderer delegation would turn a dependency
migration into an unrelated repository-wide test rewrite.
