# Retry Transient npm Audit Failures

Use this update when npm registry outages make an otherwise healthy quality
gate wait for the default five-minute fetch timeout and fail without retrying
the audit POST request.

## Apply

1. Add `scripts/run-security-audit.mjs` and its tooling test.
2. Point the canonical `security:audit` package script at the runner.
3. Keep the production-dependency omission and high-severity failure threshold
   in the runner's npm arguments.
4. Document that only explicit registry transport failures are retried.

The runner makes at most three 60-second requests with 5- and 15-second
backoffs. HTTP 429, HTTP 5xx, and recognized network failures are retryable. A
completed vulnerability report, a local invocation error, or exhausted retries
remains blocking.

## Fallback

If the target repository already owns a retry runner, add npm audit as a
fail-closed operation there. Do not use `continue-on-error`, disable the audit,
or treat registry unavailability as a successful security result.

## Verify

- `npm run test:tooling`
- `npm run security:audit`
- `npm run ci:local`

Confirm the focused tests cover recovery after HTTP 503 and network timeout,
retry exhaustion, and immediate failure for a completed vulnerability report.
