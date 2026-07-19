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
- Owner manifests use `kirjolab-owner-backup-v2`. Each backed-up workspace
  carries a reference to a canonical, content-addressed ReviewStudy payload
  under `backups/reviews/{ownerKey}/{payloadDigest}.json`; the potentially large
  relational review authority is never embedded in the 10 MiB owner manifest.
- A review payload contains the allowlisted authoritative ReviewStudy tables
  plus its exact review revision, protocol revision, and reconstructible history
  floor. Its reference pins byte count, payload SHA-256, and a separately
  calculated digest of the complete unblinded export authority. Existing v1
  owner manifests remain readable but do not gain a synthesized live review
  restore.
- Authoritative project image asset keys are binary backup references alongside
  workspace PDFs; their logical metadata remains in each workspace snapshot.
- Owner-created project template seeds and their recovery bookmark are included
  as logical owner state; templates contain no binary objects.
- Recovery drills target isolated recovery Durable Object names and never
  mutate canonical owner or workspace identities. For every v2 review
  reference, the drill checks the R2 object, restores its relational payload
  into `review-drill:{ownerKey}:{manifestDigest}:{workspaceId}`, reads the live
  restored authority back, and verifies both payload and authority digests plus
  all pinned revisions.
- Backup payloads and logs never contain Access tokens. R2 paths use opaque
  owner keys rather than email addresses.

## Contract

### Definition of Done

- [x] Production deployment refuses local auth, blank Access configuration,
      placeholder values, and a non-HTTPS or Access-team hostname.
- [x] The production command performs a strict Wrangler dry run before upload.
- [x] Every production Wrangler subprocess disables project-root `.env`
      discovery so local companion settings cannot alter generated Worker types
      or deployment bindings.
- [x] Worker binding generation and freshness checks use canonical package
      scripts with the same disabled-discovery environment, and the fast quality
      gate rejects environment-dependent generated declarations before deploy.
- [x] A daily scheduled handler invokes the backup coordinator.
- [x] Authenticated owners are registered idempotently for scheduled backup.
- [x] An unchanged owner state produces no new manifest or binary write.
- [x] A changed owner state produces one stable, versioned manifest after all
      referenced binary backup objects are available.
- [x] Backup status is available only to the authenticated owner and is
      non-cacheable.
- [x] Durable Object recovery bookmarks are included for every backed-up
      catalog, template catalog, library, access object, document room, and
      review study.
- [x] Review-study state is stored as a bounded canonical external payload;
      owner manifests retain only owner-scoped content-addressed references and
      exact revision seeds.
- [x] A recovery drill restores logical data into isolated identities and
      verifies the manifest digest without overwriting production.
- [x] A v2 recovery drill performs a live isolated ReviewStudy restore, compares
      payload and unblinded-authority digests and revisions, and reports the
      number of review authorities checked.
- [x] Production logs, smoke checks, versions, and rollback commands are
      documented.
- [x] Full quality gate, local Agent CI, generated type check, startup check,
      and production dry run pass.

### Bounds

- Back up at most 50 registered owners and 200 catalog workspaces per owner in
  one scheduled run.
- Process owners and R2 copies sequentially so one run does not exhaust Worker
  subrequest concurrency.
- Reject a logical manifest above 10 MiB instead of writing a partial backup.
- Reject one canonical ReviewStudy payload above 64 MiB. The external payload
  is not counted as embedded owner-manifest bytes, but its complete reference
  is part of the stable owner backup digest.
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

- Given an owner has changed a manuscript, review study, or collected source
- When the daily trigger runs
- Then every referenced binary and review payload has an immutable
  content-addressed backup object and exactly one new manifest records the
  changed stable digest, payload references, and recovery bookmarks

**Fail-closed deployment**

- Given production Access or hostname configuration is blank, local, malformed,
  or placeholder text
- When production deploy is requested
- Then preflight exits before Wrangler uploads a Worker

**Recovery drill**

- Given a successful v2 backup manifest with review payload references
- When an operator starts a drill
- Then the restored logical state and each live restored review use isolated
  recovery identities, their payload and authority digests and revisions match
  the references, `reviewsChecked` matches the referenced review count, and
  canonical production data remains unchanged

**Legacy manifest drill**

- Given a valid `kirjolab-owner-backup-v1` manifest
- When an operator starts a drill
- Then Kirjolab verifies and restores the legacy logical manifest without
  pretending that its embedded review projection is a live relational review
  restore
