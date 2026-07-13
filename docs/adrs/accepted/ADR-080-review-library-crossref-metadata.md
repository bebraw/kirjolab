# ADR-080: Review Crossref Metadata in the Private Library

**Status:** Accepted

**Date:** 2026-07-13

## Context

ADR-079 lets a researcher review a DOI found inside a private PDF, but accepting
that DOI does not yet retrieve the publication metadata Crossref already knows.
The repository has a bounded Crossref singleton-work adapter and a reviewed
project-era DOI intake flow, while the shared private library is now the
authority for bibliographic metadata and per-field provenance.

Provider metadata may change between preview and acceptance. It may also be
incomplete or conflict with metadata the researcher entered manually or
accepted from the PDF. Treating lookup as mutation would erase those distinctions,
and trusting a preview echoed by the browser would let arbitrary values claim
Crossref provenance.

## Decision

Kirjolab will expose reviewed Crossref enrichment on DOI-backed private-library
records. Preview uses the record's current normalized DOI, retrieves bounded
metadata through the existing singleton-work adapter, and returns a stable
fingerprint without mutating the library.

The inline Library review will compare current and provider values and let the
researcher select fields independently. Acceptance sends only the selected
field names and preview fingerprint. The Worker refetches Crossref metadata,
rejects a changed fingerprint, and asks the owner-keyed library authority to
apply the selected provider values with `crossref` provenance.

Acceptance verifies that the record still owns the same DOI and that no other
active library record owns it. A duplicate conflict returns the existing record
for navigation and never merges, deletes, or relinks research automatically.
Reference UUIDs, immutable reference keys, PDF bytes, and unselected field
values and provenance remain unchanged.

Requests continue to identify Kirjolab through `User-Agent` and use the
configured `mailto` value when available, following Crossref's polite-pool
guidance. Preview tokens are not persisted; refetching keeps the trust boundary
small and avoids a draft lifecycle.

## Consequences

**Positive:**

- A DOI accepted from a PDF can complete common citation metadata without retyping.
- Field-level review preserves stronger manual or PDF-derived choices.
- Refetch and fingerprint verification make Crossref provenance honest.
- Duplicate and concurrent-change paths fail without partial mutation.

**Negative:**

- Normal successful enrichment performs two Crossref requests.
- Provider unavailability can prevent acceptance after a successful preview.
- Duplicate reconciliation remains a separate explicit workflow.

**Neutral:**

- Records without a DOI continue to use manual or PDF metadata review.
- OCR, title search, and other metadata providers remain outside this decision.

## Alternatives Considered

### Apply Crossref metadata immediately after DOI acceptance

This shortens the happy path but conflates local PDF review with a third-party
mutation and provides no field-level comparison.

### Trust the provider preview returned by the browser

This avoids a second request, but an authorized browser could alter values while
the stored provenance still claimed they came from Crossref.

### Persist provider previews server-side

A durable preview could avoid refetching, but adds expiry, cleanup, and migration
policy for a short-lived reversible interaction.
