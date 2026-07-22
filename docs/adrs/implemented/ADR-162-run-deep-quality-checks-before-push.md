# ADR-162: Run Deep Quality Checks Before Push

**Status:** Implemented

**Date:** 2026-07-22

**Amends:** [ADR-026](./ADR-026-run-affected-guardrails-when-possible.md),
[ADR-033](./ADR-033-add-advisory-fallow-diagnostics.md),
[ADR-134](./ADR-134-keep-mutation-explicit.md)

## Context

Routine local readiness intentionally excludes Fallow and Stryker so normal
development gets fast feedback. That leaves contributors to remember two useful
signals before publishing changes. Fallow currently completes in seconds, while
a stale incremental mutation cache can require a long refresh and several
gigabytes, so neither belongs back in `ci:local`.

Pre-push is a natural boundary: it catches maintainability and assertion-strength
regressions before remote CI without slowing edit-test iteration. Running every
deep check for documentation-only or Worker-only changes would still be wasted
work because Stryker's configured Node mutation surface excludes those files.

## Decision

Keep `ci:local` unchanged. Extend the repo-managed pre-push hook to replay its
exact ref input through affected guardrails and a change-aware deep-check
selector:

- run Fallow when affected files include JavaScript, TypeScript, package
  metadata, or Fallow configuration;
- run Stryker against only affected configured mutation sources, mapping Node
  unit tests back to their production source when available;
- retain Stryker's mutation-time TypeScript checker because project-level
  typechecking does not validate each mutated program;
- force-refresh the full incremental report whenever mutation/test
  configuration changes, because Stryker can otherwise retain mutants removed
  from the configured surface;
- skip irrelevant deep checks for documentation-only and Worker-only pushes;
- preserve `npm run mutation` as the clean authoritative GitHub mutation job.

Any selected command failure blocks the push. Git's explicit `--no-verify`
option remains available for emergencies rather than adding another project
bypass contract.

## Consequences

**Positive:**

- Readability, coupling, and mutation-strength regressions are checked before
  changes leave the machine.
- Routine development and `ci:local` keep their existing bounded feedback loop.
- Documentation-only and Worker-only pushes avoid irrelevant mutation work.
- Routine source pushes mutate only the affected production surface.
- Rare mutation-configuration pushes rebuild the ignored incremental report.

**Negative:**

- A push that changes mutation configuration performs a full local mutation
  refresh, which can take several minutes and use the configured 8 GiB heap
  ceiling.
- The hook owns another affected-file routing table that must stay aligned with
  `stryker.config.mjs` exclusions.
- A targeted mutation score describes only the affected files; the clean full
  GitHub job remains the repository-wide authority.

**Neutral:**

- Fallow remains advisory during iteration but its command exit status is
  enforced when the pre-push selector chooses it.
- GitHub Actions still performs the only clean full mutation run.

## Alternatives Considered

### Put Fallow and mutation back in `ci:local`

This would restore a single maximal command but would again make routine
readiness depend on mutation-cache state.

### Run both tools for every push

This is simpler, but it imposes mutation work on documentation and runtime
surfaces that Stryker does not mutate.

### Keep both checks manual

This preserves the shortest push path but continues relying on contributors to
remember important pre-publication signals.
