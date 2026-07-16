# ADR-137: Identify Discovered Works Across Providers

**Status:** Implemented

**Date:** 2026-07-16

**Amends:** [ADR-136](./ADR-136-federate-library-reference-discovery.md)

## Context

DOI is the strongest common identity for many scholarly publications, but it is
not universal. Preprints, older works, repository records, and some books can be
available through scholarly indexes before or without DOI registration.

Federated search also returns the same work through multiple providers. Showing
one card per provider forces researchers to compare duplicates manually and can
lead to repeated imports. Deduplicating only by title would be unsafe because
titles are neither stable nor unique.

## Decision

Represent discovery identity as a bounded typed set containing DOI, OpenAlex,
Semantic Scholar, arXiv, and PubMed identifiers. Provider adapters retain every
recognized identifier and may return a work without DOI when a stable provider
or repository identifier exists.

Merge records when they share any normalized typed identifier. Identity merging
is transitive: if one result connects DOI to an OpenAlex ID and another connects
that OpenAlex ID to a Semantic Scholar ID, all three belong to one displayed
work. The merged result retains contributing provider labels and all identifiers.
It selects the most complete metadata record, then fills empty fields from other
matching records.

DOI remains the preferred import ID and verification link. Without DOI, import
uses the primary typed identifier and canonical provider URL. The existing
library title/author/year identity remains the persistence fallback; discovery
identifiers are not added to the private-library schema in this slice.

## Consequences

**Positive:**

- Non-DOI works are searchable, reviewable, and saveable.
- One scholarly work normally appears once even when several providers return
  it.
- Provider provenance stays visible after metadata is combined.

**Negative:**

- Two provider records with no shared identifier remain separate even if their
  bibliography looks similar.
- Native identifiers are not yet persisted as first-class library fields, so a
  later DOI cannot automatically attach to an imported non-DOI record without
  bibliographic refinement.

## Alternatives Considered

### Require DOI for every result

This is simple and precise, but excludes legitimate scholarly works and makes
provider coverage appear narrower than it is.

### Deduplicate by normalized title, author, and year

This can catch records without shared identifiers but risks collapsing distinct
editions, translations, conference versions, and works with generic titles.

### Persist every provider identifier immediately

That would improve later reconciliation but requires a library schema migration,
interchange changes, and identifier-editing workflows. Keeping the initial
identity expansion inside ephemeral discovery preserves a smaller reviewable
slice.
