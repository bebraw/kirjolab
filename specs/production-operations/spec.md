# Feature: Production Operations

## Context

Kirjolab stores manuscripts, research metadata, annotations, and private source
documents. Its first production deployment must fail closed, retain recoverable
state, and give one operator a deterministic deploy, backup, restore, smoke, and
rollback workflow without adding a second identity system.

This contract governs the Cloudflare-hosted production deployment. The
loopback-only Docker Compose profile is a separate evaluation surface and must
not be operated under this production runbook or its recovery claims.

## Architecture

- Cloudflare Access remains the hosted identity boundary. The Worker still
  validates every Access assertion independently.
- A production deploy preflight supplies `AUTH_MODE=access`, the exact team
  domain, application audience, and protected custom hostname. Local development
  remains an explicit loopback-only command.
- Browser-shell builds default to Lit's production package export. Vitest,
  Playwright, and the loopback development command opt into Lit development
  diagnostics explicitly. The build validates actual Lit-family esbuild inputs,
  and the repository-owned production deploy overwrites any ambient browser-
  shell mode with `production` before invoking Wrangler.
- The required GitHub mutation check runs only for pull requests and derives a
  clean, non-incremental production scope from the explicit base-to-head diff.
  A NUL-delimited name-status diff preserves deletion status and both rename
  paths. Directly changed surviving sources become coalesced new/head-side
  Stryker line ranges from per-source `git diff --unified=0` output; renamed
  sources pass both paths with rename detection to preserve ancestry. Omit deleted
  sources, but promote a surviving directly changed source to full-file if any
  hunk is deletion-only or no positive new-side span exists because Stryker
  mutates only AST nodes fully contained by a range. Changed, deleted, or renamed
  Node unit tests map to full-file production counterparts only when those
  sources were not directly changed. Package, mutation,
  TypeScript, Vitest, workflow, and selector configuration changes, including
  deletion, add an always-full-file stable production canary. Missing or
  malformed commits fail instead of expanding to a full run. An empty scope
  passes without Stryker. Selected runs ignore static mutants, emit console
  progress plus JSON, require at least 90% changed-mutant coverage and 68%
  covered mutation score, and have a 30-minute job bound. Full repository
  mutation stays an explicit local or manual audit rather than a duplicate
  post-merge job. Pre-push uses the same configuration canary instead of
  forcing a full incremental refresh.
- Committed Wrangler variables remain `AUTH_MODE=local` with blank Access
  values, so a bare `wrangler deploy` is safely unusable on a public hostname.
  Only the repository-owned production command supplies hosted identity values
  after its preflight passes.
- SQLite Durable Object PITR is the exact short-window recovery mechanism.
- One SQLite-backed backup coordinator registers authenticated owners, records
  recovery bookmarks, builds owner-scoped logical snapshots, and stores backup
  metadata in R2.
- A daily UTC Cron Trigger asks the coordinator to inspect registered owners.
  Before snapshotting review catalogs, the coordinator idempotently registers
  legacy ReviewStudy data reachable from active or archived project catalog
  entries so scheduled backup does not depend on a prior UI migration.
  The coordinator computes a stable digest over canonical owner state and
  referenced R2 object identities. It writes a new manifest only when that
  digest differs from the last successful backup.
- Binary backup objects are immutable and content-addressed under a reserved
  `backups/` prefix. A manifest is committed only after every referenced binary
  is present in that prefix.
- Owner manifests use `kirjolab-owner-backup-v3`. Independent reviews are a
  top-level owner collection beside workspaces. Each entry retains its catalog
  record, independent access and link ledger, exact revision seed, and a
  reference to a canonical content-addressed ReviewStudy payload under
  `backups/reviews/{ownerKey}/{payloadDigest}.json`; the potentially large
  relational review authority is never embedded in the 10 MiB owner manifest.
- A review payload contains the allowlisted authoritative ReviewStudy tables
  plus its exact review revision, protocol revision, and reconstructible history
  floor. Its reference pins byte count, payload SHA-256, and a separately
  calculated digest of the complete unblinded export authority. Existing v1
  and project-associated v2 owner manifests remain readable; v2 drills retain
  their historical workspace-keyed restore semantics, while v1 does not gain a
  synthesized live review restore.
- Owner-backup schemas, deterministic digest/key projection, and v1-v3
  compatibility validation remain independently testable modules behind the
  stable `backups.ts` consumer facade. Projection cannot depend on validation
  or Durable Object coordinator state. Owner manifests, review payloads, and
  recovery comparison use one canonical JSON ordering primitive.
- Authoritative project image asset keys are binary backup references alongside
  workspace PDFs; their logical metadata remains in each workspace snapshot.
- Owner-created project template seeds and their recovery bookmark are included
  as logical owner state; templates contain no binary objects.
- Recovery drills target isolated recovery Durable Object names and never
  mutate canonical owner, project, or review identities. For every v3 review,
  the drill restores its catalog projection, ReviewAccess state, and relational
  ReviewStudy payload under isolated review-id-keyed identities, reads the live
  authorities back, and verifies payload and authority digests, memberships,
  links, locators, and pinned revisions.
- Backup payloads and logs never contain Access tokens. R2 paths use opaque
  owner keys rather than email addresses.
- A scheduled owner failure emits one structured `backup-owner-failed` event
  with the opaque owner key and bounded failure reason, never the owner email.
  Missing referenced R2 sources include the exact source key in owner status
  and in that operator-facing event so repair can target the absent object.

## Contract

### Definition of Done

- [x] Production deployment refuses local auth, blank Access configuration,
      placeholder values, and a non-HTTPS or Access-team hostname.
- [x] The production command performs a strict Wrangler dry run before upload.
- [x] Every production Wrangler subprocess disables project-root `.env`
      discovery so local companion settings cannot alter generated Worker types
      or deployment bindings.
- [x] Every production Wrangler subprocess forces the production browser-shell
      mode, and the browser build rejects resolved Lit development inputs in
      production output.
- [x] Worker binding generation and freshness checks use canonical package
      scripts with the same disabled-discovery environment, and the fast quality
      gate rejects environment-dependent generated declarations before deploy.
- [x] A daily scheduled handler invokes the backup coordinator.
- [x] Authenticated owners are registered idempotently for scheduled backup.
- [x] Scheduled owner failures identify the affected opaque owner and concrete
      missing source key without logging owner email or authentication data.
- [x] An unchanged owner state produces no new manifest or binary write.
- [x] A changed owner state produces one stable, versioned manifest after all
      referenced binary backup objects are available.
- [x] Backup status is available only to the authenticated owner and is
      non-cacheable.
- [x] Durable Object recovery bookmarks are included for every backed-up
      catalog, template catalog, library, access object, document room, and
      independent review catalog, access object, and study.
- [x] Review-study state is stored as a bounded canonical external payload;
      owner manifests retain only owner-scoped content-addressed references and
      exact revision seeds.
- [x] A recovery drill restores logical data into isolated identities and
      verifies the manifest digest without overwriting production.
- [x] A v3 recovery drill performs isolated ReviewCatalog, ReviewAccess, and
      ReviewStudy restores keyed by review id, compares access state, payload
      and unblinded-authority digests and revisions, and reports the number of
      review authorities checked.
- [x] Valid v1 and v2 manifests remain readable and preserve their historical
      drill behavior.
- [x] Production logs, smoke checks, versions, and rollback commands are
      documented.
- [x] `quality-mutation` remains a required clean pull-request check, selects
      changed-line ranges for directly changed configured production sources,
      maps test-only changes to full-file sources, and exercises an always-full-
      file stable canary for configuration changes.
- [x] Direct mutation line ranges come from positive new/head-side zero-context
      diff hunks, coalesce when overlapping or adjacent, and use
      `file.ts:start-end`; renamed sources diff both paths with rename detection,
      surviving sources with deletion-only or empty positive spans use full-file
      safety fallback, and deleted sources are omitted.
- [x] A pull request with no selected production mutation source passes the
      required check without starting Stryker.
- [x] The selector rejects malformed or unavailable base and head commits
      without falling back to a full mutation run.
- [x] Pull-request mutation ignores static mutants, emits console progress plus
      JSON, fails closed unless the postprocessed report reaches both result
      floors, and stops at 30 minutes; `npm run mutation` remains the explicit
      full audit and no mutation job repeats on the merge push to `main`.
- [x] Mutation-configuration pushes test affected production sources plus the
      stable canary without automatically rebuilding the full incremental
      report; explicit manual refresh remains available.
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

**Development-mode Lit cannot reach production**

- Given a developer shell has selected Lit development diagnostics
- When the repository-owned production deploy starts its type check, dry run,
  or upload
- Then every Wrangler subprocess rebuilds with Lit production exports and
  rejects any emitted Lit development input

**Affected pull-request mutation**

- Given a pull request directly changes lines in a configured production source
- When the required `quality-mutation` check compares the explicit base and head
- Then it starts a clean non-incremental Stryker run only for the mapped
  coalesced `file.ts:start-end` ranges, ignores static mutants, emits console
  progress plus JSON, and requires at least 90% changed-mutant coverage and 68%
  covered mutation score within 30 minutes

**Test-only pull-request mutation**

- Given a pull request changes, deletes, or renames a colocated Node unit test
  without directly changing its surviving configured production counterpart
- When the required `quality-mutation` check selects its scope
- Then it mutates the mapped production source as a full-file pattern

**Deletion-only pull-request mutation**

- Given a surviving directly changed configured production source has any
  deletion-only hunk or no positive new-side span
- When the required `quality-mutation` check selects its scope
- Then that source becomes a full-file safety fallback

**Deleted-source pull-request mutation**

- Given a pull request deletes a configured production source
- When the required `quality-mutation` check selects its scope
- Then the deleted source contributes no mutation pattern because no head-side
  file remains

**Empty pull-request mutation scope**

- Given a pull request changes no configured production source, mapped unit
  test, or mutation configuration input
- When the required `quality-mutation` check evaluates its base-to-head diff
- Then it succeeds without starting Stryker

**Unavailable pull-request mutation commit**

- Given a pull request base or head SHA is malformed or unavailable in the
  checkout
- When the required `quality-mutation` check selects its scope
- Then it fails with the missing commit instead of silently starting a full
  mutation run

**Mutation configuration canary**

- Given a pull request or pre-push diff changes or deletes `package.json`,
  `package-lock.json`, `stryker.config.mjs`, `tsconfig.json`, or
  `vitest.config.mts` without changing a configured production source, or a
  pull request changes or deletes the CI workflow or an affected-mutation
  routing script
- When the mutation selector chooses its affected scope
- Then it mutates the stable production canary as a full-file pattern instead of
  returning a vacuous success or rebuilding the full incremental report

**Recovery drill**

- Given a successful v3 backup manifest with independent review payload
  references
- When an operator starts a drill
- Then the restored logical state, catalog, access ledger, and each live
  restored review use isolated review-id-keyed recovery identities; their
  payload and authority digests, memberships, links, locators, and revisions
  match the references; `reviewsChecked` matches the referenced review count;
  and canonical production data remains unchanged

**Unavailable review payload**

- Given a manifest references a missing or size-mismatched ReviewStudy payload
- When an operator starts a recovery drill
- Then the isolated recovery returns a typed routine failure, the coordinator
  records the failed drill with the payload error, and no uncaught Durable
  Object exception is emitted

**Legacy manifest drill**

- Given a valid `kirjolab-owner-backup-v1` or project-associated
  `kirjolab-owner-backup-v2` manifest
- When an operator starts a drill
- Then Kirjolab verifies and restores the legacy logical manifest using that
  schema's historical semantics, without pretending that v1's embedded review
  projection is a live relational review restore
