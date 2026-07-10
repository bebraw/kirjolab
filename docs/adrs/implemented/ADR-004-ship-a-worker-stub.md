# ADR-004: Ship a Worker Stub

**Status:** Accepted

**Date:** 2026-03-28

## Context

The template already pinned Wrangler, Playwright, Vitest, Lighthouse, and local CI, but it still had no runnable application surface. That meant the repo carried delivery tooling without a concrete app entry point for developers to start from.

Without a starter app surface, new projects have to build their first route, first test target, and first local runtime before they can benefit from the existing workflow. The result is avoidable friction and a gap between the repo's documented practices and what the clone can actually execute on day one.

Because the template already carries Cloudflare-oriented tooling through Wrangler, a minimal Worker stub is the smallest cohesive baseline that turns those flows into real, testable behavior.

## Decision

We will ship a minimal Cloudflare Worker stub in the template.

The template will include:

- a Worker entry point in `src/worker.ts`
- a root HTML route for a visible starting point
- a JSON health endpoint for smoke tests and tooling
- unit and end-to-end tests that exercise the stub

This stub is intentionally small and stateless. It exists to make the template runnable and testable, not to prescribe product behavior beyond the Worker runtime baseline.

## Trigger

The template had accumulated real delivery tooling but still lacked a concrete app surface for developers to run or extend. Adding the Worker stub aligns the codebase with its documented workflow and testing expectations.

## Consequences

**Positive:**

- Developers can clone the template and start a real app immediately.
- Playwright, Vitest coverage, and local CI now have a concrete surface to target.
- The repo has a simple baseline for future Cloudflare-oriented experiments.

**Negative:**

- The template now carries a specific runtime starting point instead of being completely app-agnostic.
- Future projects that do not want a Worker baseline will need to replace or delete the stub.

**Neutral:**

- The stub remains intentionally minimal and does not introduce persistence, auth, or external integrations.

## Alternatives Considered

### Keep the repo app-agnostic and leave the app surface empty

This was rejected because it leaves the testing and local runtime flows abstract instead of executable, which weakens the template's value as a practical starter.

### Add a heavier full-stack starter instead of a stub

This was rejected because it would violate the template's lightweight goal and make pruning harder for small experiments.
