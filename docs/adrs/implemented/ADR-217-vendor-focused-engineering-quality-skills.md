# ADR-217: Vendor Focused Engineering Quality Skills

**Status:** Implemented

**Date:** 2026-08-03

## Context

Kirjolab already has broad review, security, and simplification guidance, but it
lacks dedicated workflows for proving logic defects with concrete triggers,
evaluating whether tests protect meaningful behavior, and debugging failures
from reproduction through regression coverage.

The public `cniska/skills` collection provides concise skills for those gaps.
Importing the whole collection would duplicate existing Kirjolab capabilities
and introduce conventions that do not necessarily match this repository's
living specs, authorization boundaries, or readiness gates.

## Decision

Vendor only `correctness-review`, `test-review`, and `debug` from
`cniska/skills` revision `7d79c7754f2b9d656f7db7b9ecefcb7532b6d256`
under the canonical `.codex/skills/` root.

Retain each upstream MIT license and record the reviewed source revision in the
skill. Adapt only the integration points needed to preserve Kirjolab's evidence
thresholds, authorization boundaries, specification workflow, and quality
commands. Keep the broad `review` skill as the default merge-readiness pass;
the two focused review skills are independent evidence-driven lenses, and
`debug` is a stop-the-line workflow for reproducing, localizing, and explaining
observed failures. It continues into a fix and regression guard only when the
user authorizes implementation.

Do not add `.github/skills/` copies unless a compatibility or distribution
surface explicitly requires them. Project-local skill ownership remains in
`.codex/skills/`; when the same skill is maintained there, any intentional copy
must remain equivalent or document its adaptation.

## Trigger

The user asked Kirjolab to review newer reusable `vibe-template` improvements
and approved the low-risk focused engineering workflow batch.

## Consequences

**Positive:**

- Correctness findings require a triggering input and an observable wrong
  result rather than speculation.
- Test review focuses on meaningful regression protection instead of coverage
  volume alone.
- Debugging gains a repeatable evidence-first workflow that preserves the
  boundary between diagnosis and authorized repair.
- The skills add no runtime dependency or product behavior.

**Negative:**

- Vendored guidance can drift from its upstream source and requires deliberate
  review when upstream changes.
- More specialized skill names add a small discovery and routing burden.

**Neutral:**

- Kirjolab's existing review, security, simplification, test, and readiness
  policies remain authoritative.
- The reusable template update pack carries the migration guidance; it does not
  make `.github/skills/` a second source of truth.

## Alternatives Considered

### Install the entire upstream collection

Rejected because most upstream skills duplicate current repository-local
capabilities or assume workflows that conflict with Kirjolab's durable context
and authorization rules.

### Fold every workflow into the broad review skill

Rejected because correctness review, test review, and debugging answer distinct
questions and should remain independently invocable without making every review
heavier.

### Reference upstream skills without vendoring

Rejected because Kirjolab needs pinned, reviewable workflows that remain stable
when the upstream collection changes.
