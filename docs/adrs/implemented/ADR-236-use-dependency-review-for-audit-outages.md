# ADR-236: Use Dependency Review For Audit Outages

**Status:** Implemented

**Date:** 2026-09-04

**Amends:** [ADR-009](./ADR-009-split-fast-and-browser-verification.md),
[ADR-213](./ADR-213-protect-main-with-authoritative-ci.md)

## Context

The fast quality gate audits shipped runtime dependencies through npm. npm 11
posts that audit to the registry's bulk-advisory endpoint, which repeatedly
timed out or returned HTTP 503 while the rest of pull-request CI passed. The
retry wrapper bounded each request and retried explicit transport failures, but
an extended upstream outage still prevented an otherwise ready pull request
from merging.

Registry unavailability must not become an unconditional security bypass. A
fallback needs an independent vulnerability source, must cover the dependency
changes introduced by the pull request, and must not hide a completed npm audit
that reports a vulnerability.

## Decision

Run GitHub's Dependency Review Action in the `quality-fast` job for pull
requests before the repository fast gate. Pin the action to a full commit SHA,
check runtime dependency changes, fail at high severity, and leave license
policy outside this check. Keep the repository dependency graph enabled because
the action's comparison API requires it.

After that step succeeds, expose an explicit one-step environment capability to
the npm audit wrapper. The wrapper still makes its three bounded npm audit
attempts. It may accept only an exhausted, recognized registry transport
failure while that capability is present. A completed vulnerability report,
an unrecognized command failure, or a dependency-review failure remains
blocking.

Do not expose the capability during local CI, manual workflow dispatch, or
pushes to `main`. Those full-tree npm audits remain fail-closed.

## Trigger

npm publicly acknowledged an audit endpoint outage, and two pull-request runs
failed after retries while the browser and mutation checks passed. The user
authorized an independent fallback so the ready work could merge without
turning off vulnerability review.

## Consequences

**Positive:**

- Pull requests can progress through an npm audit endpoint outage after an
  independent review of newly introduced runtime dependencies passes.
- Completed npm vulnerability reports still fail immediately.
- Local and post-merge full-tree audits preserve the existing fail-closed
  baseline.

**Negative:**

- Degraded pull-request coverage is change-focused rather than a second audit
  of the complete installed runtime tree.
- Pull-request CI now also depends on GitHub's dependency graph and advisory
  service.

**Neutral:**

- npm audit remains the canonical full-tree runtime dependency check.
- The required branch-protection check remains named `quality-fast`.

## Alternatives Considered

### Keep rerunning npm audit

Rejected because retries already exhausted repeatedly during the acknowledged
outage and provided no independent security signal.

### Continue on every npm audit error

Rejected because it would also hide completed vulnerability reports and local
invocation failures.

### Replace npm audit with OSV-Scanner

OSV-Scanner is a credible independent source, but its policy and dependency
scope differ from the existing npm gate. GitHub Dependency Review is the
smaller pull-request-specific fallback for introduced runtime dependencies.

### Route audits through another registry

Rejected without an already trusted registry proxy because it adds a broader
supply-chain and operational trust boundary to solve a temporary advisory
endpoint outage.
