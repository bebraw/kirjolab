# ADR-003: Require Spec Updates and High Coverage

**Status:** Accepted

**Date:** 2026-03-28

## Context

`vibe-template` already treats ADRs as the durable record for architectural intent, but completed feature work can still leave important behavior implicit if the relevant feature spec is missing or stale. That creates the same long-term problem at the feature level that missing ADRs create at the architectural level: later work has to infer expected behavior from code and recent memory instead of from committed documentation.

The repo also had tests in the baseline quality gate, but not a coverage requirement. That allows changes to satisfy the process by adding a small number of tests while leaving critical paths in `src/` under-exercised. For a template intended to codify good delivery habits, that baseline is too weak.

The template needs a clearer default:

- completed feature work should leave an explicit feature spec
- completed `src/` code should be held to high automated unit coverage

## Decision

We will treat feature specs as part of done work.

Whenever a change introduces or changes feature behavior, workflows, contracts, or regression guardrails, the same change set must create `specs/{feature-domain}/spec.md` or update the existing relevant spec.

We will also add a unit coverage gate for `src/` code. If `src/` contains source files, the baseline quality gate must require automated unit coverage with high thresholds before the change is considered ready.

The empty-template case remains lightweight: if no `src/` code exists yet, the coverage gate may pass without forcing placeholder tests.

## Trigger

The repo already had a spec baseline and a test runner, but neither one made it explicit that finished feature work must leave an updated spec or that test quality should be measured by coverage rather than mere execution. This ADR closes both gaps.

## Consequences

**Positive:**

- Feature behavior becomes durable, reviewable, and discoverable through committed specs instead of relying on memory or chat history.
- Contributors have a clear same-change-set rule for spec maintenance.
- The quality gate now measures test strength more directly for `src/` code.

**Negative:**

- Feature work that changes behavior now carries extra documentation and testing obligations.
- Coverage thresholds can force additional test refactoring when code is hard to exercise.

**Neutral:**

- The template remains lightweight until a project actually adds `src/` code.
- Coverage reporting becomes part of normal unit-test workflow once source code exists.

## Alternatives Considered

### Keep specs optional and rely on contributor discipline

This was rejected because the repo already showed that "update the spec when behavior changes" is too easy to treat as guidance instead of done-work criteria.

### Require tests to run but do not enforce coverage

This was rejected because execution alone does not show whether critical code paths are exercised. High coverage is not sufficient for correctness, but it is a better baseline than unmeasured tests.
