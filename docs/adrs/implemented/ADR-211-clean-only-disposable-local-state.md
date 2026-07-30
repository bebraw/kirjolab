# ADR-211: Clean Only Disposable Local State

**Status:** Implemented

**Date:** 2026-07-30

## Context

Repeated mutation, Wrangler, coverage, and browser runs had accumulated several
gigabytes of ignored output. The repository documented where tools write, but
offered no bounded cleanup path. A broad removal command would risk deleting
the local Durable Object and R2 state under `.wrangler/state` or manually
captured output under `.generated`.

## Decision

Provide `npm run maintenance:clean` with an explicit repository-relative
allowlist. It may remove Stryker sandboxes, Wrangler temporary bundles and logs,
coverage, mutation, and Lighthouse reports, Playwright test results, and the
Prettier cache.

Resolve every target beneath the selected project root and reject a target when
its root is a symbolic link. Preserve `.wrangler/state`, `.generated`, and every
unknown ignored path. Expanding the allowlist requires a reviewed code and
documentation change.

## Consequences

**Positive:**

- Contributors can reclaim reproducible local output through one documented
  command.
- Local application data and manually captured media are outside the deletion
  boundary.
- Tests protect the allowlist and symbolic-link refusal.

**Negative:**

- Some ignored output remains intentionally outside routine cleanup and may
  still need a separate explicit owner.

**Neutral:**

- Removed reports and bundles are not recoverable, but their producing commands
  can recreate them.

## Alternatives Considered

### Remove Every Ignored Path

Rejected because ignore status does not mean data is disposable; Wrangler state
and generated media can represent valuable local work.

### Document Shell Commands Only

Rejected because ad hoc recursive commands do not provide a stable reviewed
allowlist or symlink guard.
