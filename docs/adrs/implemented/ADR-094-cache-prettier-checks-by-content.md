# ADR-094: Cache Prettier Checks by Content

**Status:** Implemented

**Date:** 2026-07-14

## Context

The full fast gate runs Prettier across every project-owned file. Most files are
unchanged between repeated local checks, so reformat analysis adds latency
without increasing confidence. Metadata-only cache invalidation is unsafe
across branch switches and file restores because timestamps can change without
content changing, or vice versa.

## Decision

Run `prettier --check` with its content cache and store the disposable result at
`.cache/prettier`. Keep `.cache/` ignored. A missing cache always triggers a
normal cold check, and remote CI does not restore or publish the cache.

Affected-file formatting remains naturally narrow and does not need a separate
cache contract.

## Consequences

**Positive:**

- Repeated local gates avoid rechecking unchanged files.
- Content hashing remains correct across timestamp and branch changes.
- Clean environments retain the same cold-path verification.

**Negative:**

- Local checks create one additional ignored cache file.
- Contributors may need to remove the cache when measuring cold formatting
  performance.

**Neutral:**

- Formatting rules and ownership scope do not change.
- CI correctness does not depend on a persistent cache.

## Alternatives Considered

### Use metadata cache invalidation

This may be marginally faster but trusts timestamps that branch and restore
workflows can change independently of content.

### Keep every formatting check stateless

This is simpler but repeats measurable work for unchanged files during normal
iteration.
