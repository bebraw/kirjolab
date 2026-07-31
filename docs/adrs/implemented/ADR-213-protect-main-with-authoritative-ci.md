# ADR-213: Protect Main With Authoritative CI

**Status:** Implemented

**Date:** 2026-07-31

**Amends:** [ADR-030](./ADR-030-reserve-full-mutation-ci-for-github.md), [ADR-134](./ADR-134-keep-mutation-explicit.md)

## Context

Kirjolab's GitHub Actions workflow supplies separate fast, browser, and full
mutation checks. ADR-030 and ADR-134 make the clean GitHub mutation job the
authoritative mutation signal, but the unprotected default branch allowed
direct updates regardless of those results.

The repository currently has one maintainer. Requiring another person's
approval would make ordinary maintenance impossible, while leaving the branch
unprotected would keep CI advisory.

## Decision

Protect `main` with GitHub's classic branch protection rule.

Require every change to use a pull request, require the branch to be current
with `main`, and require `quality-fast`, `quality-browser`, and
`quality-mutation` from the GitHub Actions App. Require review conversations to
be resolved, enforce the rule for administrators, and keep force pushes and
branch deletion disabled.

Set the required approving-review count to zero while Kirjolab has one
maintainer. Do not require the Cloudflare Workers build check because it is a
deployment signal rather than part of the repository's authoritative CI gate.

## Trigger

A project-state review found that `main` had no branch protection or ruleset,
so failing or absent CI did not prevent direct updates.

## Consequences

**Positive:**

- GitHub cannot merge changes until all three authoritative CI jobs pass.
- Direct pushes, force pushes, and deletion no longer bypass the documented
  quality contract.
- Required checks are pinned to their expected GitHub App provider.
- Review conversations have an explicit resolution boundary even without a
  mandatory approval count.

**Negative:**

- Every change now needs a branch and pull request, including maintainer-only
  documentation changes.
- Strict freshness can rerun long mutation CI after `main` advances.
- The remote rule can drift from the checked-in policy and needs periodic
  verification.

**Neutral:**

- Adding another maintainer does not automatically increase the approval count;
  that remains a separate policy decision.
- Cloudflare deployment status remains visible without blocking merges.

## Alternatives Considered

### Require one approving review

This is stronger for a multi-maintainer project but a pull request author
cannot approve their own change, so it would block the current solo workflow.

### Require checks without pull requests

This can protect direct pushes after checks exist, but it removes the stable
review and conversation boundary and makes the expected contribution flow less
explicit.

### Use a repository ruleset

Rulesets offer broader targeting and bypass controls. A single exact default
branch needs only one lightweight rule today, so classic branch protection is
the smaller configuration surface.

### Require the Cloudflare deployment check

This would couple merge readiness to deployment infrastructure outside the
quality-gate contract. The existing fast, browser, and mutation jobs already
own repository correctness.
