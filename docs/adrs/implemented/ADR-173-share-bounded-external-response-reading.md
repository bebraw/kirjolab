# ADR-173: Share Bounded External Response Reading

**Status:** Implemented

**Date:** 2026-07-25

**Amends:** ADR-085, ADR-136, ADR-171

## Context

The Crossref, DataCite, OpenAlex, and Semantic Scholar adapters independently
implemented the same response-body mechanics: reject an oversized declared
length, read and count streamed chunks, cancel an oversized stream, assemble
the bytes, and parse JSON. The GitHub clients already used a shared helper for
the same commodity mechanics.

Provider-specific byte ceilings, errors, response mappings, and business rules
must remain explicit. A general HTTP client would obscure those boundaries and
introduce more adaptation than this repeated code warrants.

## Decision

Use one stateless, request-local helper for bounded external response text and
JSON reading. The caller supplies the byte ceiling and factories for its
boundary-specific size and invalid-body errors.

The JSON helper rejects missing and empty bodies before parsing. Each provider
continues to own request construction, HTTP status handling, response-shape
validation, domain mapping, and public error semantics.

Never retain a response, reader, promise, or chunk buffer in module state.

## Trigger

The dependency-reduction follow-up found four nearly identical scholarly
response readers after the GitHub clients had successfully adopted the shared
bounded transport primitive.

## Consequences

**Positive:**

- Four scholarly adapters no longer maintain independent stream-reading code.
- Declared and observed byte limits are enforced consistently.
- The change removes 71 source lines without changing provider mappings.

**Negative:**

- Provider adapters depend on a small shared transport primitive.
- A change to the primitive requires focused coverage across every consumer.

**Neutral:**

- Every scholarly provider retains its existing 1 MB ceiling and error text.
- No new production dependency or externally visible behavior is introduced.

## Alternatives Considered

### Keep one reader per provider

This preserves local implementation independence but leaves security-relevant
stream bounds duplicated and vulnerable to drifting behavior.

### Introduce a general HTTP or provider SDK

This could also own request construction and parsing, but the current overlap
is limited to bounded body reading. A broader client would add dependency and
adaptation cost without removing Kirjolab's domain-specific validation.
