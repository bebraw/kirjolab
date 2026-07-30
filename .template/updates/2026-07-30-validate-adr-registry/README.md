# Validate the ADR Registry

Use this update when ADR identifiers, lifecycle metadata, index coverage, or
relative links can drift during parallel work.

## Apply

1. Add the read-only ADR registry validator and its tooling tests.
2. Register `check:adrs` in `package.json` and include it in the fast gate.
3. Run the check from affected-file guardrails when ADR records or the validator
   change.
4. Repair existing identifier collisions before enabling the check. Preserve
   the earlier decision's identifier and update links to any renumbered record.
5. Document the guard in the repository's quality-gate spec.

Adapt the lifecycle-directory rules if the target repository uses a different
ADR status model.

## Fallback

If the target has very few ADRs, run the validator only in CI rather than adding
it to affected-file guardrails. Keep unique identifiers and complete index
coverage as non-negotiable invariants.

## Verify

- `npm run check:adrs`
- `npm run test:tooling`
- `npm run ci:local`
