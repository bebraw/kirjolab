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

## Validate Without Uploading

```bash
npm run deploy:dry-run
```

This checks generated binding types and executes the exact production Wrangler
configuration with `--strict --dry-run`. It does not create or modify a Worker.

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
