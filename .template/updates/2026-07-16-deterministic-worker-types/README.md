# Make Worker Type Generation Deterministic

Use this when committed Wrangler types differ between local development and a
clean CI or Cloudflare build because ignored `.env` or `.dev.vars` files affect
generation.

## Apply

1. Add canonical `worker:types` and `worker:types:check` package scripts that set
   `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false`.
2. Add `worker:types:check` to the fast quality gate.
3. Regenerate `worker-configuration.d.ts` with `npm run worker:types` and commit
   the result.
4. Use the same disabled-discovery environment in every production Wrangler
   subprocess.
5. Document the canonical generation command for contributors and operators.

## Verify

- `npm run worker:types:check`
- `npm run quality:gate`
- `npm run ci:local`

The check must pass even when ignored local environment files are present.
