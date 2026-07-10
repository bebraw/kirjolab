# ADR-026: Run Affected Guardrails When Possible

**Status:** Implemented

**Date:** 2026-05-25

## Context

The fast quality gate gives a useful baseline, but it still runs full-repo work even when a change only affects a small set of files. That cost is unnecessary during iteration and before push when a narrower guardrail can provide the same signal for the files that changed.

Some checks can be safely scoped to affected files. Others, such as TypeScript project checking, may still need project-level execution because the tools or repo contracts are not safely per-file. Runtime test checks can usually run through Vitest's related-test selection, but they still need a coverage fallback when affected files change the test environment or no related tests are found.

## Decision

Add `npm run quality:affected` backed by `scripts/run-affected-guardrails.mjs` and `npm run test:affected` backed by `scripts/run-affected-tests.mjs`.

The affected guardrail path detects changed files from the working tree, staged changes, pre-push refs, or branch diff fallback. It then:

- runs Prettier only for affected files, with unknown file types ignored
- runs JavaScript syntax checks only for affected JavaScript files
- runs project typecheck only when affected files can influence typed code or typed tooling
- runs the Worker client-code guard only for affected Worker/view runtime files
- runs package audit only when `package.json` or `package-lock.json` changes
- runs affected unit tests only when affected files include runtime source or unit tests

The affected test path runs tests related to affected runtime files and directly runs affected unit test files. It falls back to full unit coverage when affected files include package metadata, TypeScript config, Vitest config, coverage-gate logic, affected-test logic, or runtime files with no related tests.

The repo-managed pre-push hook now runs this affected guardrail path instead of the full fast gate. The full readiness baseline remains `npm run quality:gate` and `npm run ci:local` for non-documentation changes.

## Trigger

The template already has strong guardrails, but agents can waste time repeatedly running checks over unrelated files. The workflow should keep the same quality expectations while avoiding unnecessary work when affected-file scoping is available.

## Consequences

**Positive:**

- Local iteration and pre-push checks avoid avoidable full-repo work.
- Guardrails still run broader project checks when safe affected-file or related-test scoping is not available.
- The affected path gives agents an explicit command for lightweight validation.

**Negative:**

- The verification workflow has one more script to understand.
- Affected-file detection has edge cases around unusual Git states, so the full gate remains the readiness baseline.
- Related-test selection can miss broad environment changes, so the affected test path keeps explicit full-coverage fallbacks.

**Neutral:**

- Remote CI behavior is unchanged.
- Full quality and local CI checks remain available and required for executable changes before readiness.

## Alternatives Considered

### Replace The Full Fast Gate Everywhere

This was rejected because the full fast gate is still valuable as a stable baseline and catches cross-file issues that affected-file heuristics can miss.

### Keep Running Only Full-Repo Guardrails

This was rejected because formatting, package audit, and Worker client-code checks can be scoped without losing useful signal.
