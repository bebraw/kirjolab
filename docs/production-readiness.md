# Production Readiness

Kirjolab's first hosted deployment is a private, Cloudflare Access-protected
application for real scholarly work. This inventory is the launch boundary, not
a general SaaS checklist.

## Launch-Critical Inventory

| Area                 | Current evidence                                                                                                                                                     | Required before launch                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication       | The Worker verifies Access JWT signature, issuer, audience, time claims, subject, and email; local identity fails closed away from loopback.                         | Production deploy must require Access configuration and a protected custom hostname.                                                          |
| Authorization        | Workspace, PDF, WebSocket, and private-library routes use verified owner/member state and same-origin mutation checks.                                               | Run an authenticated owner smoke test and an unauthenticated denial test on the production hostname.                                          |
| Durable metadata     | All application metadata is stored in SQLite-backed Durable Objects with ordered in-object migrations. Cloudflare retains 30 days of point-in-time recovery history. | Record recovery bookmarks and document an exact PITR recovery procedure.                                                                      |
| Binary research data | PDFs and web captures are streamed into private R2 objects. R2 provides storage durability but deleted objects are not an application recovery path.                 | Copy newly referenced binaries into a retained backup prefix before recording a successful logical backup.                                    |
| Scheduled backups    | No scheduled handler or backup registry exists.                                                                                                                      | Run a daily owner-scoped backup, write a manifest only when its stable content digest changes, and expose authenticated backup status.        |
| Restore              | Project revision seeds and portable library import exist, but there is no production recovery runbook.                                                               | Verify PITR recovery and logical restore into non-canonical recovery identities before launch. Never overwrite live state during a drill.     |
| Deployment           | Wrangler config includes bindings, migrations, generated assets, and observability, but defaults to local auth and has no custom-domain preflight.                   | A production command must require hostname, Access team domain, and audience; run strict dry-run checks; and refuse placeholder/local values. |
| Observability        | Workers logs and sampled traces are enabled. `/api/health` is public and `/api/session` is authenticated.                                                            | Document log tailing, smoke checks, version inspection, and rollback. Do not log JWTs, email addresses, manuscript text, or backup bodies.    |
| Quality              | Unit, Workers-runtime, browser, coverage, mutation, and local Agent CI gates exist.                                                                                  | Run the full gate, local CI, Wrangler type check, deploy dry run, and startup check on the release commit.                                    |

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
