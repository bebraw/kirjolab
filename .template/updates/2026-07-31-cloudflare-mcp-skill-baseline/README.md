# Use Cloudflare MCP With A Focused Skill Baseline

Use this update when a Cloudflare Worker project has a connected Cloudflare MCP
and still vendors the broad Cloudflare skill suite.

## Apply

1. Confirm that the Cloudflare MCP provides current documentation search, API
   discovery, and required account operations.
2. Keep `workers-best-practices` for Worker implementation and review guidance.
3. Keep `wrangler` for local development, configuration, testing, types, and
   deployment guidance.
4. Remove the general `cloudflare`, `agents-sdk`, and
   `cloudflare-email-service` directories from each repository-local skill
   root.
5. Preserve any specialized skill whose product is already used by the target
   project, such as Kirjolab's `durable-objects` skill.
6. Add other specialized Cloudflare skills on demand.

## Fallback

If the target does not have a reliable Cloudflare MCP connection, keep the
general skill until a current documentation source is available. Preserve
product-specific skills for capabilities the target actually uses.

## Verify

- Confirm `workers-best-practices` and `wrangler` remain in every supported
  repository-local skill root.
- Confirm required specialized skills remain.
- Confirm unused broad and product-specific Cloudflare directories are absent.
- Run `npm run format:check` or the target repository's documentation check.
