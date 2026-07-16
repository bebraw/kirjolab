# ADR-136: Federate Library Reference Discovery

**Status:** Implemented

**Date:** 2026-07-16

## Context

Kirjolab already queried scholarly metadata providers for DOI refinement and a
model-assisted reference operation, but researchers could not initiate a normal
search from the Library. Requiring a local model to formulate every query made
ordinary reference discovery unnecessarily indirect.

Provider APIs also have different credentials, query syntax, response shapes,
and failure modes. Calling them from the browser would expose those differences
to the UI and make request policy harder to enforce.

## Decision

Add a first-class, collapsible discovery surface to the Library. It accepts
bounded keywords and optional author, year, and bibliographic type facets.
Search is read-only; a result enters the private library only after an explicit
save through the existing CSL JSON import boundary.

Keep federation in the Worker. The API fans a normalized query into configured
OpenAlex, Crossref, and Semantic Scholar adapters, tolerates partial provider
failure, validates the normalized domain response, disables caching, and never
returns raw provider payloads. The existing model-assisted operation consumes
the same endpoint rather than defining a second discovery path.

Discovery form state and results are ephemeral browser state. They do not enter
the project document, private library, collaboration state, model settings, or
analytics.

## Consequences

**Positive:**

- Researchers can search and save scholarly works without leaving Kirjolab or
  configuring a model.
- Provider credentials, response bounds, and normalization stay centralized.
- Manual and model-assisted discovery share one review-and-save contract.

**Negative:**

- Search quality depends on the available provider pool and its rate limits.
- Provider-specific advanced query syntax is intentionally not exposed.

## Alternatives Considered

### Open provider websites in new tabs

This avoids an integration surface but breaks the research flow and duplicates
manual metadata transfer that the Library already knows how to review.

### Query providers directly from the browser

This would spread credentials, rate-limit behavior, and normalization across the
UI. The Worker is the existing trusted boundary for external scholarly I/O.

### Require model-formulated queries

Models remain useful for deriving a search from selected prose, but normal
keyword search should not require a model connection or transmit manuscript
content.
