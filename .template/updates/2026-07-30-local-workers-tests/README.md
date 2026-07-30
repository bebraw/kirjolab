# Keep Worker Tests Local

Use this update when a Wrangler binding causes the Workers Vitest pool to open
remote preview sessions during the local readiness gate.

## Apply

1. Set `remoteBindings: false` in the `cloudflareTest()` options.
2. Mark services that are intrinsically remote, such as Workers AI, explicitly
   remote in production Wrangler configuration.
3. Add a tooling assertion so the local-only test policy cannot drift silently.
4. Document that remote-service integration tests require an explicit test
   double or an opt-in diagnostic outside routine readiness.

## Fallback

If a project intentionally tests remote bindings, keep those tests in a
separate command that is not part of offline-capable local CI and disclose its
credential, quota, data-transfer, and availability requirements.

## Verify

- `npm run test:tooling`
- `npm run test:workers`
- Run with Cloudflare credentials absent and confirm no preview session starts.
