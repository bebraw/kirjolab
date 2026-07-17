# Prefer Native Local CI

Use this update when routine Agent CI containers are substantially slower or
less observable than the repository's native full quality gate.

## Apply

1. Point `ci:local` at the existing full native quality gate.
2. Retain the Agent CI wrapper under the exceptional
   `ci:local:container` command.
3. Rename its retry command to `ci:local:container:retry`.
4. Update contributor and agent guidance so only native local CI is mandatory.
5. Keep remote GitHub Actions as the clean Linux and workflow authority.

Do not copy check commands into a second script. Delegate to the target
project's existing full gate so native and remote jobs continue sharing package
script authorities.

## Fallback

If the target project supports multiple local operating systems or depends on
Linux-only behavior, retain container CI as its normal baseline and improve
the slowest measured step instead.

## Verify

- `npm run ci:local`
- Confirm `npm run ci:local:container` still resolves the optional Agent CI
  wrapper when parity debugging is needed.
