# Protect Main With Authoritative CI

Use this update after a repository's automatic GitHub Actions triggers have
produced recent check runs and the default branch still accepts unguarded
updates.

## Apply

1. Record the intended default-branch policy in project documentation.
2. Require pull requests for the default branch.
3. Require every authoritative CI job by its exact check-run name.
4. Require branches to be current before merge.
5. Pin each required check to the GitHub App that recently produced it.
6. Apply the policy to administrators and block force pushes and deletion.
7. Require review conversations to be resolved.
8. Choose an approval count that matches the maintainer model. Use zero for a
   solo-owned repository because authors cannot approve their own pull request.

Do not require deployment or preview checks unless the project's quality
contract explicitly treats them as merge authorities.

## Fallback

If GitHub will not accept a required check, confirm that an automatic push or
pull-request run produced the exact context in the repository during the last
seven days. If the provider cannot be pinned reliably, stop and inspect the
check-run App identity instead of allowing any App to satisfy the context.

## Verify

- Read the effective protection rule through GitHub's branch protection API.
- Confirm the expected check names and App IDs.
- Confirm pull requests are required, strict checks are enabled, administrators
  are included, conversations must resolve, and force pushes and deletion are
  disabled.
