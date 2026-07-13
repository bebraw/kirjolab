# Production Readiness

Kirjolab's first hosted deployment is a private, Cloudflare Access-protected
application for real scholarly work. This inventory is the launch boundary, not
a general SaaS checklist.

## Launch-Critical Inventory

| Area                 | Current evidence                                                                                                                                                               | Required before launch                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication       | The Worker verifies Access JWT signature, issuer, audience, time claims, subject, and email; local identity fails closed away from loopback.                                   | Production deploy must require Access configuration and a protected custom hostname.                                                          |
| Authorization        | Workspace, PDF, WebSocket, and private-library routes use verified owner/member state and same-origin mutation checks.                                                         | Run an authenticated owner smoke test and an unauthenticated denial test on the production hostname.                                          |
| Durable metadata     | All application metadata is stored in SQLite-backed Durable Objects with ordered migrations; hosted backups record 30-day PITR bookmarks for every authoritative object.       | Verify bookmark presence after the first hosted backup and retain the exact incident procedure.                                               |
| Binary research data | PDFs and web captures stream into private R2; referenced bytes are copied to an immutable content-addressed backup prefix before manifest commit.                              | Verify the first hosted recovery drill can read every referenced backup object.                                                               |
| Scheduled backups    | A daily bounded Cron run registers hosted owners, compares stable state digests, retains last known-good status, and exposes authenticated owner status.                       | Verify the first hosted run reports `created`, then `unchanged` without a new manifest.                                                       |
| Restore              | An authenticated drill verifies the latest manifest and binaries, restores logical state into a dedicated isolated Durable Object, and reads it back before digest comparison. | Run the isolated drill after the first hosted backup. Never overwrite live state during a drill.                                              |
| Deployment           | Wrangler config includes bindings, migrations, generated assets, and observability, but defaults to local auth and has no custom-domain preflight.                             | A production command must require hostname, Access team domain, and audience; run strict dry-run checks; and refuse placeholder/local values. |
| Observability        | Workers logs and sampled traces are enabled. `/api/health` is public and `/api/session` is authenticated.                                                                      | Document log tailing, smoke checks, version inspection, and rollback. Do not log JWTs, email addresses, manuscript text, or backup bodies.    |
| Quality              | Unit, Workers-runtime, browser, coverage, mutation, and local Agent CI gates exist.                                                                                            | Run the full gate, local CI, Wrangler type check, deploy dry run, and startup check on the release commit.                                    |

## Explicitly Deferred

These are useful later but do not block a private Access-protected launch:

- application-owned passwords, OAuth, sessions, or account recovery
- public signup, billing, invitation email delivery, or abuse automation
- public API rate limiting beyond Access and the existing input bounds
- multi-region or cross-provider replication
- unattended destructive restore into canonical production identities
- generalized organization administration or ownership transfer

## Launch Evidence

Launch is ready only when all of the following evidence exists for the exact
release commit:

- production preflight and strict Wrangler dry run pass
- generated Worker binding types are current
- scheduled backup Workers-runtime tests prove unchanged runs do not write
- a backup manifest and its referenced binary copies can be read back
- a recovery drill restores into isolated recovery identities and compares the
  stable digest with the source backup
- authenticated and unauthenticated production smoke checks pass
- the full quality gate and local Agent CI pass
- `wrangler versions list` shows the deployed version and the operator has the
  exact rollback command

Cloudflare dashboard configuration remains operator evidence: the custom
hostname must be covered by the matching Access self-hosted application, and an
unprotected `workers.dev` route must not expose application data.
