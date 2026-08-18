# Main Branch Protection

Kirjolab protects `main` through GitHub's classic branch protection settings.
The policy is repository state rather than a checked-in workflow, so this file
records the intended configuration and its verification boundary.

## Required Policy

- Changes reach `main` through a pull request.
- The pull request branch must be up to date with `main`.
- These checks must pass and must be reported by the GitHub Actions App:
  - `quality-fast`
  - `quality-browser`
  - `quality-mutation`
- `quality-mutation` is the clean Linux Stryker compatibility smoke. Scored
  affected mutation remains a local pre-push boundary and is not asserted by
  branch protection.
- Review conversations must be resolved before merge.
- Zero approving reviews are required while the repository has one maintainer;
  the pull-request boundary still applies.
- Administrators do not bypass the policy.
- Force pushes and branch deletion remain disabled.
- Cloudflare's `Workers Builds: kirjolab` deployment check is visible but is
  not a required CI authority.

The GitHub Actions App ID observed for the required checks is `15368`. Pinning
the expected app prevents another integration from satisfying a required check
with the same name.

## Verification

Inspect the effective rule:

```sh
gh api repos/bebraw/kirjolab/branches/main/protection
```

Before changing required checks, verify their exact names and provider against
a recent automatic `push` or `pull_request` run. A required check must have run
in the repository recently or GitHub can leave pull requests permanently
pending.

Applied template update: `2026-07-31-protect-main-with-ci`.
