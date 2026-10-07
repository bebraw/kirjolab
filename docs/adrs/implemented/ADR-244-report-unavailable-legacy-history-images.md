# ADR-244: Report Unavailable Legacy History Images

**Status:** Implemented

**Date:** 2026-10-07

## Context

Scheduled backups fail every day for an owner whose current project no longer
contains an image, but retained July 17 revisions still reference it. The old
image-delete route physically removed its R2 source before the July 31 retention
fix. Cloudflare logs identify the missing source, and the last successful owner
manifest contains no copy of it. Requiring that lost image prevents every later
backup of otherwise recoverable current state.

R2 consistency and durability cannot reconstruct intentionally deleted bytes.
Deleting historical rows would hide the loss and discard recoverable manuscript
history. Ignoring every missing binary would also conceal new retention failures.

## Decision

Add one narrow exception to the complete-binary requirement in
[ADR-090](./ADR-090-combine-pitr-with-change-aware-r2-backups.md). An unavailable
project image can be recorded as a historical gap only when it is absent from
current state and every retained revision referencing it has a canonical UTC
timestamp strictly before `2026-07-31T00:00:00.000Z`. Exclude the entire retention-fix day
conservatively. Any current reference, newer or undated revision, or PDF remains
required and fails the owner if its source is absent. Require a removal
checkpoint before the same cutoff, and reject any later or undated removal.
An image uploaded long ago but deleted after the retention fix stays required.

Preserve project snapshots, revisions, and milestones. Include the sorted,
unique source-key ledger as optional `state.unavailableHistoricalBinaries` in
the existing v3 manifest and its canonical digest. Omit the field when empty
so complete backups retain their existing digests and v1-v3 compatibility.
Reject gap keys outside the owner's project image scope, keys present in current
project metadata, and keys already represented by copied binaries.

Persist the ledger in owner backup and recovery-drill status through an additive
SQLite migration. Scheduled runs emit `backup-owner-history-gap` warnings and
count affected owners as `ownersWithHistoricalGaps`, while completing the backup
of current logical state and available bytes. Recovery drills verify the logical
manifest and included binaries and return the same gaps; verification does not
claim absent historical bytes were recovered.

Recheck the original source on every run. Restoring its bytes adds the immutable
binary copy, clears the gap, and changes the backup digest. No manual allowlist,
new binding, destructive cleanup, or recurring repair task is introduced.

## Trigger

Cloudflare's daily scheduled invocation reported one failed owner among three.
The error key belongs to an image deleted on July 17, before binary retention
was introduced on July 31. Current owner state needs backup coverage despite
that unavailable historical source.

## Consequences

**Positive:**

- Current manuscripts and available sources regain backup coverage.
- Historical loss remains explicit and protected by the manifest digest.
- New binary-loss regressions continue to fail closed.
- Restored bytes automatically return to complete backup coverage.

**Negative:**

- A legacy history revision referencing a reported gap cannot reconstruct that
  image without an external copy of its original bytes.
- The date boundary remains a product-specific compatibility rule.

**Neutral:**

- Existing complete manifests and isolated recovery identities remain valid.
- Scheduled warnings remain until the lost bytes are restored or the containing
  project is permanently deleted through its existing workflow.

## Alternatives Considered

### Recover the original image before any new backup

This would produce a complete backup, but the source and last successful binary
ledger contain no copy. An external original may be restored later without
blocking all current-state protection now.

### Prune revisions or rewrite historical references

This destroys retained project history or makes historical snapshots inaccurate.

### Ignore all missing historical binaries

This would hide modern retention failures and expand the exception to PDFs with
no evidence that their loss shares this legacy cause.

### Change the manifest schema version

An optional digest-protected field preserves complete v3 manifests and existing
readers; a new schema version would add migration work without a new restore
format or authority model.
