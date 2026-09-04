# Back npm Audit Outages With Dependency Review

Use this update when npm registry outages make an otherwise healthy quality
gate wait for the default five-minute fetch timeout or fail after bounded
retries of the audit POST request.

## Apply

1. Add `scripts/run-security-audit.mjs` and its tooling test.
2. Point the canonical `security:audit` package script at the runner.
3. Keep the production-dependency omission and high-severity failure threshold
   in the runner's npm arguments.
4. Run a SHA-pinned GitHub Dependency Review step before the pull-request fast
   gate, scoped to high-severity runtime vulnerabilities.
5. Enable the repository dependency graph required by the review action.
6. Let that successful step expose the runner's explicit pull-request fallback
   capability.
7. Document that only explicit registry transport failures are retried or
   eligible for the independent-review fallback.

The runner makes at most three 60-second requests with 5- and 15-second
backoffs. HTTP 429, HTTP 5xx, and recognized network failures are retryable. An
exhausted recognized transport failure may pass only in pull-request CI after
GitHub Dependency Review succeeds. A completed vulnerability report, a local
invocation error, local CI, manual CI, and a push to `main` remain fail-closed.

## Fallback

If the target repository cannot use GitHub Dependency Review, retain the retry
runner as a fail-closed operation. Do not use `continue-on-error`, disable the
audit, or accept registry unavailability without an independent security
signal. Adapt the ADR identifier to the target repository's sequence.

## Verify

- `npm run test:tooling`
- `npm run security:audit`
- `npm run ci:local`

Confirm the focused tests cover recovery after HTTP 503 and network timeout,
fail-closed retry exhaustion, the independently reviewed pull-request fallback,
and immediate failure for a completed vulnerability report.
