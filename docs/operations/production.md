# Production Runbook

## One-Time Cloudflare Setup

1. Create the private bucket: `npx wrangler r2 bucket create kirjolab-papers`.
2. Add the intended custom hostname to the Worker zone.
3. Create a Cloudflare Access self-hosted application covering that exact
   hostname and restrict its policy to intended researchers.
4. Copy the Access team domain and application audience tag.
5. Disable or leave unadvertised any `workers.dev` route. Kirjolab rejects
   requests without the matching Access assertion even if an origin is exposed.

Do not store Access assertions, API tokens, or Cloudflare credentials in the
repository. The team domain and audience identify the Access application but do
not grant access by themselves.

## Release Inputs

Set these in the operator shell:

```bash
export KIRJOLAB_PRODUCTION_URL=https://write.your-domain.example
export KIRJOLAB_ACCESS_TEAM_DOMAIN=https://your-team.cloudflareaccess.com
export KIRJOLAB_ACCESS_AUD=your_application_audience_tag
export KIRJOLAB_CROSSREF_MAILTO=you@example.org
```

`KIRJOLAB_CROSSREF_MAILTO` may be omitted. The other values are required and
the preflight rejects blank, loopback, `workers.dev`, `pages.dev`, malformed,
and placeholder values.

For broader reviewed metadata discovery, configure provider keys as Worker
secrets. OpenAlex runs before Crossref when configured. Semantic Scholar uses
its throttled public pool without a key and uses the configured key when one is
available. A failed provider does not prevent another provider from returning
reviewable results. Do not pass these keys through deployment variables or
commit them to `.dev.vars`.

```bash
npx wrangler secret put OPENALEX_API_KEY
npx wrangler secret put SEMANTIC_SCHOLAR_API_KEY
```

## Validate Without Uploading

```bash
npm run deploy:dry-run
```

This checks generated binding types and executes the exact production Wrangler
configuration with `--strict --dry-run`. It does not create or modify a Worker.
If the binding check is stale after changing `wrangler.jsonc`, regenerate it
with `npm run worker:types`; do not use bare `wrangler types`, which may load
ignored machine-local environment files.

## Deploy

```bash
npm run deploy
```

The command repeats the strict dry run, deploys only after it succeeds, and
lists deployed versions. Record the release commit and deployed version ID.

## Smoke Checks

From a signed-out browser, opening the production URL must be blocked by
Cloudflare Access. After signing in as the owner:

1. Open `/api/session` and confirm `mode` is `access` and the expected email is
   shown.
2. Open the workspace list and the starter project.
3. Make a small manuscript edit, reload, and confirm it persisted.
4. Upload and reopen a small disposable PDF, then delete it.
5. Open the private Library and export its metadata archive.
6. Inspect recent structured logs without copying JWTs, email addresses,
   manuscript content, or backup bodies into tickets or chat.

Tail error logs with:

```bash
npx wrangler tail kirjolab --status error
```

## Offline Authoring Check

Offline authoring is prepared after a signed-in project completes its first
Yjs synchronization. The browser stores authenticated project metadata and
manuscript state locally; use a trusted device. PDFs, Library mutations,
project-tree changes, sharing, model operations, and exports still require the
Worker.

For each browser family used in production:

1. Open a project online and wait for `Saved`.
2. Disable the network, reload the same project, and confirm the existing
   Markdown files remain editable and report `Saved offline`.
3. Reload once more while offline and confirm the edit remains.
4. Restore the network and confirm the status returns to `Live` and `Saved`.
5. Reload from the server and confirm the offline edit was synchronized.
6. Use the application logout control and confirm the next disconnected visit
   no longer opens the cached project.

Browser storage is a recoverability aid, not a backup. It may be evicted and is
not included in server history until reconnection completes.

## Backup Check and Recovery Drill

After the first authenticated request has registered the owner, use the signed-in
browser console to create and inspect the first backup:

```js
await fetch("/api/backups", { method: "POST" }).then((response) => response.json());
await fetch("/api/backups").then((response) => response.json());
```

The first response must report `created`. A second `POST` without an intervening
data change must report `unchanged` with the same `digest` and `manifestKey`.
The daily Cron Trigger runs at 02:17 UTC and applies the same check to every
registered hosted owner. A failed scheduled owner causes an error log rather
than advancing its last known-good manifest.

Current manifests use `kirjolab-owner-backup-v2`. A workspace's ReviewStudy is
not embedded in the 10 MiB manifest. Instead, the manifest records an
owner-scoped reference to a canonical payload at
`backups/reviews/{ownerKey}/{payloadDigest}.json`, including its byte count,
payload and unblinded-authority SHA-256 digests, review revision, protocol
revision, and reconstructible history floor. The backup coordinator reuses an
already-present content-addressed payload and includes the reference in the
owner digest, so an unchanged review does not cause another payload write.

Run the non-destructive recovery drill from the same signed-in console:

```js
await fetch("/api/backups/drill", { method: "POST" }).then((response) => response.json());
```

The result must report `verified`, the latest backup digest, an isolated
`recoveryIdentity`, the number of immutable binary copies checked, and
`reviewsChecked`. The drill restores the logical manifest into a dedicated
recovery Durable Object and reads it back before comparing the digest. For each
v2 review reference it also checks the R2 payload, restores the allowlisted
relational tables into
`review-drill:{ownerKey}:{manifestDigest}:{workspaceId}`, reads that live
ReviewStudy back, and compares both digests and all pinned revisions. The
reported review count must equal the number of non-null review references in
the manifest. A missing, wrong-sized, non-canonical, out-of-owner-scope, or
digest-mismatched payload fails the drill.

The isolated identities are derived from the immutable manifest digest, so a
repeated drill is idempotent for the same manifest. The drill never addresses
canonical catalog, library, access, document, or review Durable Objects. A
valid `kirjolab-owner-backup-v1` manifest remains readable and receives the
legacy manifest-only drill; it is not reported as a live review restore.

`GET /api/backups/latest` downloads the authenticated owner's latest manifest.
All backup and drill endpoints are authenticated, owner-scoped, same-origin for
mutations, and returned with `Cache-Control: no-store`.

## Exact Point-in-Time Recovery

Each hosted manifest records a Durable Object PITR bookmark for the owner
catalog, project-template catalog, private library, and every included
workspace access, document, and ReviewStudy object. Cloudflare retains these
bookmarks for 30 days. PITR is unavailable in local development.

An exact restore is an incident operation, not a normal browser workflow:

1. Stop application writes and download the latest known-good manifest.
2. Identify the affected object and its bookmark in `recovery`.
3. Preserve the current manifest and R2 objects before changing state.
4. Use a reviewed, temporary operator-only Worker revision to call
   `storage.onNextSessionRestoreBookmark(bookmark)` inside that exact Durable
   Object, record the undo bookmark returned by Cloudflare, then call
   `ctx.abort()` to complete the restart.
5. Verify the restored object and its linked R2 bytes, then remove the temporary
   recovery revision before resuming writes.
6. If verification fails, repeat the operation with the recorded undo bookmark.

Do not expose PITR as an authenticated application endpoint and do not apply a
bookmark to a differently named object. Cloudflare documents the exact
next-session and undo behavior in its
[SQLite Durable Object PITR API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#pitr-point-in-time-recovery-api).

## Versions and Rollback

Inspect releases:

```bash
npx wrangler versions list
```

If smoke checks find a release regression, roll back to the last verified
version and repeat the smoke checks:

```bash
npx wrangler rollback VERSION_ID
```

Rollback changes Worker code and configuration; it does not reverse Durable
Object data migrations or restore deleted data. Use the recovery procedure for
state recovery.
