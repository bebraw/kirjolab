# Add Capability Kits For Partial Upgrades

Use this when a downstream project wants to copy reusable practices from the
template without inheriting unrelated starter code.

## Apply

1. Copy `.capabilities/README.md`.
2. Copy only the kits that fit the target project.
3. Preserve target-project package manager, docs, and workflow conventions.
4. Add docs that explain how agents should negotiate kit application.

## Fallback

If the target project only needs one capability, copy just that kit. Do not add
the whole `.capabilities/` tree when it would create unused maintenance surface.

## Verify

- `npm run quality:gate`
- `npm run ci:local`
