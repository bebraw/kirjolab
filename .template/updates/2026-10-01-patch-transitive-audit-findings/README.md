# Patch Transitive Audit Findings

Refresh the existing dependency graph to fix the October 2026 audit findings
without changing direct dependencies or the supported Node/npm baseline:

- Change the existing `fast-uri` override from `3.1.6` to `3.1.8`.
- Refresh transitive `hono` from `4.13.4` to `4.13.12`.
- Refresh transitive `ip-address` from `10.5.0` to `10.7.2`.

These releases fix URI authority parsing, HTTP parsing and rendering, and IP
address classification issues. They retain the installed major versions and
satisfy their parent dependencies' existing constraints.

## Apply

1. Check and apply `patch.diff` against the target project's existing pins and
   lockfile. Preserve any newer compatible security fixes already installed.
2. Run `npm install --ignore-scripts` with the project's pinned toolchain to
   synchronize installed packages with the updated lockfile.
3. Run `npm run security:audit` and `npm run ci:local` before pushing.

## Fallback

If the patch does not apply, update the existing `fast-uri` override to `3.1.8`
and run `npm update hono ip-address --ignore-scripts`. Inspect the resulting
lockfile and verify that all three patched versions are installed. Do not use
`npm audit fix --force` or introduce a major upgrade to clear these findings.
Record this update ID in the target project's template update record.

## Verify

Kirjolab's CI audit command checks the production dependency graph, including
its runtime peer dependencies. A successful CI audit does not assert that
unrelated development dependencies have no advisories. Use the target's
existing audit policy and complete native CI rather than weakening its gate.
