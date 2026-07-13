# Feature: Production Operations

## Context

Kirjolab stores manuscripts, research metadata, annotations, and private source
documents. Its first production deployment must fail closed, retain recoverable
state, and give one operator a deterministic deploy, backup, restore, smoke, and
rollback workflow without adding a second identity system.

## Architecture

- Cloudflare Access remains the hosted identity boundary. The Worker still
  validates every Access assertion independently.
- A production deploy preflight supplies `AUTH_MODE=access`, the exact team
  domain, application audience, and protected custom hostname. Local development
  remains an explicit loopback-only command.
- SQLite Durable Object PITR is the exact short-window recovery mechanism.
- One SQLite-backed backup coordinator registers authenticated owners, records
  recovery bookmarks, builds owner-scoped logical snapshots, and stores backup
  metadata in R2.
- A daily UTC Cron Trigger asks the coordinator to inspect registered owners.
  The coordinator computes a stable digest over canonical owner state and
  referenced R2 object identities. It writes a new manifest only when that
  digest differs from the last successful backup.
- Binary backup objects are immutable and content-addressed under a reserved
  `backups/` prefix. A manifest is committed only after every referenced binary
  is present in that prefix.
- Recovery drills target isolated recovery Durable Object names and never
  mutate canonical owner or workspace identities.
- Backup payloads and logs never contain Access tokens. R2 paths use opaque
  owner keys rather than email addresses.

## Contract

### Definition of Done

- [x] Production deployment refuses local auth, blank Access configuration,
      placeholder values, and a non-HTTPS or Access-team hostname.
- [x] The production command performs a strict Wrangler dry run before upload.
- [x] A daily scheduled handler invokes the backup coordinator.
- [x] Authenticated owners are registered idempotently for scheduled backup.
- [x] An unchanged owner state produces no new manifest or binary write.
- [x] A changed owner state produces one stable, versioned manifest after all
      referenced binary backup objects are available.
- [x] Backup status is available only to the authenticated owner and is
      non-cacheable.
- [x] Durable Object recovery bookmarks are included for every backed-up
      catalog, library, access object, and document room.
- [x] A recovery drill restores logical data into isolated identities and
      verifies the manifest digest without overwriting production.
- [x] Production logs, smoke checks, versions, and rollback commands are
      documented.
- [ ] Full quality gate, local Agent CI, generated type check, startup check,
      and production dry run pass.

### Bounds

- Back up at most 50 registered owners and 200 catalog workspaces per owner in
  one scheduled run.
- Process owners and R2 copies sequentially so one run does not exhaust Worker
  subrequest concurrency.
- Reject a logical manifest above 10 MiB instead of writing a partial backup.
- Never follow an R2 key outside the application-owned workspace, library, web
  capture, or reserved backup prefixes discovered from authoritative snapshots.
- Never delete the latest successful manifest automatically.

### Scenarios

**Unchanged scheduled run**

- Given an owner has a successful backup digest
- When the daily trigger observes identical logical state and binary identities
- Then it records a successful unchanged check without writing another manifest
  or copying any binary

**Changed scheduled run**

- Given an owner has changed a manuscript or collected a source
- When the daily trigger runs
- Then every referenced binary has an immutable backup copy and exactly one new
  manifest records the changed stable digest and recovery bookmarks

**Fail-closed deployment**

- Given production Access or hostname configuration is blank, local, malformed,
  or placeholder text
- When production deploy is requested
- Then preflight exits before Wrangler uploads a Worker

**Recovery drill**

- Given a successful backup manifest
- When an operator starts a drill
- Then the restored state uses isolated recovery identities, its stable digest
  matches the manifest, and canonical production data remains unchanged
