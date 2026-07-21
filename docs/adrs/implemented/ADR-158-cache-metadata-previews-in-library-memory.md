# ADR-158: Cache Metadata Previews in Library Memory

**Status:** Implemented

**Date:** 2026-07-21

**Amends:** [ADR-085](./ADR-085-unify-reviewed-metadata-refinement.md),
[ADR-103](./ADR-103-compose-metadata-from-several-providers.md)

## Context

Starting metadata refinement repeatedly for the same PDF repeats identical
provider discovery requests even when neither the PDF hints nor canonical
metadata changed. Acceptance already refetches each selected provider and
verifies its fingerprint, so a short-lived preview can reduce avoidable public
API traffic without becoming authoritative.

Kirjolab supports deployments protected by Cloudflare Access. Cloudflare's
Cache API is not available for Access-fronted Workers, so it is not a dependable
cache layer for this workflow. A browser-only cache would not help another tab
or device, while a persistent table would add retention and cleanup policy to
data that is useful only during an active review.

## Decision

Cache metadata-refinement previews in the owner-scoped Reference Library
Durable Object's memory for five minutes, with a maximum of sixteen entries per
owner instance. Key each entry by the reference id, artifact id, effective
title, authors, year, normalized DOI, and enabled provider set.

The cache is deliberately non-durable: entries may disappear before their TTL
when the Durable Object is evicted or restarted. Invalidate every entry for a
reference after manual metadata save, reviewed PDF acceptance, or
scholarly-provider acceptance. Do not cache provider failures.

Acceptance remains uncached: the Worker refetches each selected provider,
verifies the preview fingerprint and DOI constraints, and applies the selected
fields atomically under the existing contracts.

## Consequences

**Positive:**

- Reopening an unchanged review across tabs avoids repeated provider discovery requests.
- No provider candidates enter SQLite or another durable storage service.
- Acceptance retains fresh-provider verification and truthful provenance.
- No new Cloudflare binding or provisioned cache namespace is required.

**Negative:**

- Cache hits are limited to one owner's active Durable Object instance.
- Eviction, restart, or deployment can discard entries before five minutes.
- A five-minute preview may display provider data that changed moments earlier,
  although acceptance detects that change before mutation.

**Neutral:**

- The preview API continues to return `Cache-Control: no-store` to browsers.
- Cache size and lifetime are fixed server constants rather than deployment settings.

## Alternatives Considered

### Use the Cloudflare Cache API

This would share entries within a data center, but it is unavailable when the
Worker is fronted by Cloudflare Access and therefore cannot support the
deployment baseline consistently.

### Cache previews in the browser

This avoids server state but duplicates provider requests across tabs and
devices and makes cache behavior dependent on one page's lifetime.

### Persist previews in SQLite or KV

This would survive eviction but would turn transient third-party candidates
into retained data and require expiry, cleanup, and provisioning policy.

### Cache accepted metadata

This would reduce acceptance requests but remove the refetch-and-fingerprint
guarantee that protects against provider changes between review and mutation.
