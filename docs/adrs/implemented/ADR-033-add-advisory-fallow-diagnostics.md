# ADR-033: Add Advisory Fallow Diagnostics

**Status:** Implemented

**Date:** 2026-06-17

## Context

The template already has a strict quality baseline: formatting, type checking,
runtime dependency audit, unit coverage, browser tests, mutation testing,
affected-file guardrails, and local Agent CI.

Those checks are mostly correctness and confidence checks. They do not give a
direct repository-level readability signal for cognitive complexity,
duplication, cleanup opportunities, or codebase health trends.

Fallow provides deterministic TypeScript and JavaScript codebase diagnostics for
changed-code risk, complexity, duplication, dependency hygiene, cleanup
evidence, health scoring, hotspots, and refactoring targets.

## Decision

Add Fallow as a pinned development dependency and expose it through advisory
diagnostic scripts:

- `npm run diagnostics:readability`
- `npm run diagnostics:health`
- `npm run diagnostics:codebase`

These scripts are not part of `npm run quality:gate`,
`npm run quality:gate:fast`, `npm run quality:affected`, or `npm run ci:local`.
They support review and refactoring decisions, but they do not replace
formatting, type checking, runtime dependency audit, unit coverage, browser
tests, mutation testing, or Worker-specific guardrails.

The scripts pass `--no-cache` so normal diagnostic runs do not create a
persistent `.fallow/` cache. `.fallow/` is ignored for contributors who run
cached Fallow commands manually.

The changed-code readability diagnostic keeps Fallow's default cognitive and
cyclomatic complexity thresholds, but raises the CRAP threshold to reduce noise
from untested template tooling scripts. Whole-repo health diagnostics still
surface those risk scores as refactoring evidence.

The project keeps a small `.fallowrc.json` to mark Playwright E2E tests and the
esbuild browser application, review application, and service worker roots as
entry points. It ignores the Stryker JSDoc type-only dependency that is resolved
through installed Stryker packages and the aliased TypeScript 7 compiler invoked
directly by the typecheck scripts.

## Trigger

The user asked whether Fallow could replace existing diagnostics, identified
cognitive complexity of changes as the likely main value, then asked to
implement it.

## Consequences

**Positive:**

- Contributors and agents get a direct readability and maintainability signal.
- Changed-code audit can highlight risk that tests and type checks do not
  describe.
- Whole-repo health output can prioritize refactoring without adding a hard CI
  gate.

**Negative:**

- The template gains one more pinned development dependency.
- Fallow findings need light project configuration to avoid framework and
  toolchain false positives.

**Neutral:**

- The existing readiness baseline remains unchanged.
- The diagnostic may exit non-zero when it finds issues because it is an
  explicit review command, not a required gate.

## Alternatives Considered

### Replace Existing Diagnostics With Fallow

This was rejected because Fallow does not replace type checking, formatting,
runtime vulnerability auditing, unit coverage, mutation testing, browser tests,
or repo-specific Worker/view guardrails.

### Add Fallow To The Hard Quality Gate

This was rejected for the first adoption step because the template should learn
from advisory output before making readability metrics a merge blocker.

### Keep Using One-Off `npx fallow`

This was rejected because a reusable template practice should be pinned,
documented, and configured rather than relying on the latest package at runtime.
