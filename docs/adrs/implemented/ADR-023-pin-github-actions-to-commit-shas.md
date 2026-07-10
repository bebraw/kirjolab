# ADR-023: Pin GitHub Actions To Commit SHAs

**Status:** Accepted

**Date:** 2026-05-19

**Amends:** [ADR-009](./ADR-009-split-fast-and-browser-verification.md)

## Context

GitHub Actions workflows execute third-party repository code inside CI. Version tags such as `v4` are mutable references, so a compromised action maintainer account, repository, or release process could move a tag and cause future CI runs to execute different code than the code previously reviewed.

The template uses a small number of official GitHub-owned actions, but the trust boundary is still external to this repository. The workflow should prefer immutable action references so cloned projects inherit a safer baseline.

## Decision

We will pin every GitHub Actions `uses:` reference in `.github/workflows/ci.yml` to a full commit SHA.

The workflow may keep a trailing comment with the human-readable tag that was resolved, such as `# v4`, but the executable reference must be the commit SHA. Updating an action requires resolving and reviewing the new upstream commit, then replacing the SHA in the workflow.

## Trigger

The user asked to check GitHub Actions usage after hearing about a supply-chain attack and requested full commit-hash pinning instead of tag-based action references.

## Consequences

**Positive:**

- CI no longer follows mutable action tags.
- Action updates become explicit, reviewable repository changes.
- Future template clones inherit a safer default workflow.

**Negative:**

- Action update diffs are less readable because the workflow contains long SHAs.
- Keeping actions current requires a deliberate lookup and review step.

**Neutral:**

- The workflow still uses the same actions and job structure.
- The pinned comments preserve the tag family for maintainers without making CI depend on the tag.

## Alternatives Considered

### Keep major-version tags for official actions

This was rejected because official actions are still external code loaded at CI runtime, and mutable tags leave a supply-chain window open.

### Pin only third-party actions

This was rejected because it creates an exception future contributors can misapply. A single rule for every `uses:` reference is easier to audit.
