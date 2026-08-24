# Production Runbook

This runbook governs Kirjolab's Cloudflare-hosted deployment. The repository's
Docker Compose profile is a loopback-only, single-user evaluation surface; it
does not provide the identity, backup, recovery, multiplayer, or availability
guarantees described here.

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
lists deployed versions. The upload is authoritative: it intentionally allows
Wrangler to replace conflicting Dashboard-managed route metadata after the
repository-controlled preflight passes. Keep production bindings and routes in
the repository deployment configuration instead of editing them independently
in the Dashboard. Record the release commit and deployed version ID.

## Research Corpus Service

Research Corpus is deployed as the separate `kirjolab-research-corpus` Worker.
It reaches the existing `ReferenceLibrary` Durable Object namespace through a
cross-script binding and uses the same private R2 bucket and analysis Queue.
Deploy the primary `kirjolab` Worker first: it owns the Durable Object class and
the sole Queue consumer. The corpus config contains no migrations and must not
be changed to create another `ReferenceLibrary` namespace.

Create a second Cloudflare Access self-hosted application for the corpus custom
hostname. It may use the same policy and team as Kirjolab, but record its own
application audience. In the Access application's CORS settings, enable
**Bypass OPTIONS requests to origin**. The corpus Worker then validates the
requested route and exact `Origin` itself and answers preflight without reading
owner state; Access must continue to authenticate every non-`OPTIONS` request.
Do not configure Access to answer preflight on the Worker's behalf because that
would omit the corpus-specific conditional, range, and MCP headers. Disable the
Worker's `workers.dev` route. Then set:

In the same Access application's **Advanced settings**, enable **Managed
OAuth**. Keep the Access policy user-based and do not add a Service Auth policy:
the corpus owner is derived from the verified user email, and service tokens
do not define an owner. Allow `localhost` or `127.0.0.1` dynamic-client redirect
URIs only when the chosen MCP client needs them, and otherwise list the exact
HTTPS redirect URIs used by approved clients. Keep the OAuth access-token
lifetime short and let the longer Access grant session drive refresh and policy
re-evaluation.

```bash
export KIRJOLAB_CORPUS_PRODUCTION_URL=https://corpus.your-domain.example
export KIRJOLAB_CORPUS_ACCESS_AUD=your_corpus_application_audience_tag
export KIRJOLAB_CORPUS_ALLOWED_ORIGINS=https://write.your-domain.example
```

`KIRJOLAB_ACCESS_TEAM_DOMAIN` remains the shared Access team domain. Separate
multiple allowed frontend origins with commas. Every entry must be a canonical
HTTPS origin without a path, query, fragment, credentials, or trailing slash.
Do not use `*`; the deploy preflight rejects non-origin values and the Worker
reflects CORS only after an exact match.

Validate and deploy only after the primary Worker is available:

```bash
npm run deploy:corpus:dry-run
npm run deploy:corpus
```

The release command validates the custom hostname, corpus audience, and exact
origin list, checks `research-corpus-configuration.d.ts` against
`wrangler.corpus.jsonc`, performs a strict dry run, uploads, and lists corpus
versions. The config defaults to local authentication, so a bare deploy is not
a production shortcut.

From a signed-in browser, verify `GET /v1/artifacts` returns only the expected
owner's safe artifact metadata. With a designated smoke-test owner, upload a
small disposable PDF through `POST /v1/artifacts`, verify the response contains
no object or owner locator, open its protected original representation, request
or inspect `pdf-text` extraction, and read one extracted page. Remove the smoke
artifact through the existing Kirjolab Library UI after verification. Verify an
unconfigured browser origin receives `403`.

Connect an RFC 8707-compatible MCP client to the full
`https://corpus.your-domain.example/mcp` URL. The first request should receive
Access authorization metadata, open the user's browser login, and then complete
tool discovery as that user. Confirm `list_corpus_artifacts` returns only that
user's corpus. The Worker validates the Access JWT supplied after this flow; it
does not accept the opaque OAuth token as an application credential itself.

For a user-operated client that supports custom headers but not Managed OAuth,
`cloudflared` is the fallback:

```bash
cloudflared access login https://corpus.your-domain.example
export KIRJOLAB_CORPUS_USER_TOKEN="$(cloudflared access token -app=https://corpus.your-domain.example)"
```

Configure that client to send
`cf-access-token: $KIRJOLAB_CORPUS_USER_TOKEN`, then clear the shell variable
after the session. Never paste this token into repository configuration, logs,
or chat. This is still an interactive user identity, not a service token.

Managed OAuth is approved only for the private Access deployment. Do not make
the MCP endpoint public or introduce service identities until an ADR defines
multi-tenant authorization and explicit identity-to-owner mapping.

Inspect or roll back this Worker with the explicit config so the operation does
not target Kirjolab accidentally:

```bash
npx wrangler versions list --config wrangler.corpus.jsonc
npx wrangler rollback VERSION_ID --config wrangler.corpus.jsonc
```

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

Current manifests use `kirjolab-owner-backup-v3`. Independent reviews are a
top-level collection beside workspaces. Each entry retains its catalog record,
ReviewAccess membership and complete project-link ledger, revision seed, and an
owner-scoped reference to a canonical ReviewStudy payload at
`backups/reviews/{ownerKey}/{payloadDigest}.json`. The reference includes byte
count, payload and unblinded-authority SHA-256 digests, review revision,
protocol revision, and reconstructible history floor. The backup coordinator
reuses an already-present content-addressed payload and includes the reference
in the owner digest, so an unchanged review does not cause another payload
write. Hidden owner locators retained only to retry deleted-review cleanup are
excluded from logical review entries; exact platform bookmarks retain their
underlying tombstone state for the normal point-in-time retention window.

Run the non-destructive recovery drill from the same signed-in console:

```js
await fetch("/api/backups/drill", { method: "POST" }).then((response) => response.json());
```

The result must report `verified`, the latest backup digest, an isolated
`recoveryIdentity`, the number of immutable binary copies checked, and
`reviewsChecked`. The drill restores the logical manifest into a dedicated
recovery Durable Object and reads it back before comparing the digest. For a v3
manifest it restores the review catalog at
`review-catalog-drill:{manifestDigest}` and each review's ReviewAccess and
ReviewStudy authorities at `review-drill:{manifestDigest}:{reviewId}`. It then
compares catalog locators, membership and project-link history, payload and
authority digests, and every pinned revision. The reported review count must
equal the number of non-null top-level review payload references in the
manifest. A missing, wrong-sized, non-canonical, out-of-owner-scope, or
digest-mismatched payload fails the drill.

The isolated identities are derived from the immutable manifest digest, so a
repeated drill is idempotent for the same manifest. The drill never addresses
canonical catalog, library, access, document, or review Durable Objects. A
valid project-associated `kirjolab-owner-backup-v2` manifest retains its
workspace-keyed isolated ReviewStudy drill, and a valid
`kirjolab-owner-backup-v1` manifest remains readable through the legacy
manifest-only drill without being reported as a live review restore.

`GET /api/backups/latest` downloads the authenticated owner's latest manifest.
All backup and drill endpoints are authenticated, owner-scoped, same-origin for
mutations, and returned with `Cache-Control: no-store`.

## Exact Point-in-Time Recovery

Each hosted manifest records a Durable Object PITR bookmark for the owner
project catalog, project-template catalog, private library, review catalog,
every included workspace access and document object, and every owned review's
ReviewAccess and ReviewStudy object. Cloudflare retains these bookmarks for 30
days. PITR is unavailable in local development.

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
