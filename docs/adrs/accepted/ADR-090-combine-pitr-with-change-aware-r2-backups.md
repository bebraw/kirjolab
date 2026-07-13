# ADR-090: Combine PITR with Change-Aware R2 Backups

**Status:** Accepted

**Date:** 2026-07-13

## Context

Kirjolab stores strongly consistent metadata in SQLite-backed Durable Objects
and immutable source bytes in R2. Cloudflare automatically retains 30 days of
Durable Object point-in-time recovery history, but R2 durability does not make
an intentionally deleted application object recoverable and the repository has
no owner inventory, scheduled backup, or restore drill.

A naive daily export would repeatedly write identical manuscripts and large
PDFs. A backup that cannot be located, authenticated, or restored is not useful
production protection.

## Decision

Add one SQLite-backed `BackupCoordinator` Durable Object selected by a fixed
internal name. Every successfully authenticated hosted owner will be registered
idempotently with an opaque owner key and normalized email. A daily UTC Cron
Trigger will ask the coordinator to process registered owners sequentially.

For each owner, the coordinator will read the owner catalog and private library,
include only workspaces where that identity is the recorded owner, and collect
the current project snapshot, revision seed, membership, library state, and
PITR bookmarks for each authoritative Durable Object. It will also collect every
R2 key referenced by those snapshots.

The coordinator will compute a canonical digest that excludes observation time
and PITR bookmark churn. If it equals the previous successful digest, the run
will record an unchanged check and write no R2 object. If it differs, the
coordinator will stream missing referenced binaries to immutable,
content-addressed objects under `backups/blobs/`, then write one versioned owner
manifest under `backups/manifests/`. Only a fully written manifest advances the
successful digest.

PITR is the exact 30-day recovery path. Logical manifests and binary copies are
the longer-lived application recovery path. Recovery drills must use isolated
recovery identities; no scheduled or browser action may overwrite canonical
state automatically.

## Trigger

The application is about to store its first production manuscripts and private
research sources.

## Consequences

**Positive:**

- Normal unchanged days do not duplicate manifests or binaries.
- Accidental deletion of an R2 source does not delete its immutable backup copy.
- Exact short-window recovery and portable longer-lived recovery have explicit,
  complementary roles.
- Backup ownership stays private and paths do not expose email addresses.

**Negative:**

- The coordinator is a bounded registry and scheduled orchestrator that must be
  tested against partial R2 failures.
- Backup copies in the same Cloudflare account do not protect against account
  loss; cross-account replication remains future work.
- Logical restore requires versioned import code as schemas evolve.

**Neutral:**

- Scheduled processing is intentionally sequential and bounded for the initial
  private deployment rather than designed as a high-volume backup service.

## Alternatives Considered

### Rely only on Durable Object PITR and R2 durability

PITR is valuable but expires after 30 days, and R2 durability does not recover
objects deleted through valid application or operator actions.

### Write a complete archive every day

This is simple but duplicates unchanged PDFs and manifests, increases cost, and
does not satisfy the requested change-aware behavior.

### Use a third-party backup service immediately

Cross-provider replication would improve account-loss resilience but adds
credentials and another operational dependency before the first private launch.
