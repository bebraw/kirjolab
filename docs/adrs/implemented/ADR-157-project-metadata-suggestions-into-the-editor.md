# ADR-157: Project Metadata Suggestions into the Editor

**Status:** Implemented

**Date:** 2026-07-21

**Amends:** [ADR-103](./ADR-103-compose-metadata-from-several-providers.md)

## Context

Reviewed PDF and scholarly metadata currently appears in a second field-oriented
review surface below the attached PDF. Researchers must compare that surface
with the canonical metadata form above it, even though both are organized around
the same eight bibliographic fields.

Preview must remain non-mutating, PDF and provider acceptance must preserve their
different provenance boundaries, and a provider batch must remain atomic. The
change should therefore reduce presentation duplication without turning manual
form submission into a trusted-provider acceptance path.

## Decision

The existing metadata editor will be the only bibliographic field surface.
Starting refinement beside **Save details** will project each PDF or scholarly
alternative directly beneath its corresponding input. Provider work selection,
per-field source selection, and the existing trust-boundary-specific apply
actions remain explicit.

Primary-PDF refinement belongs beside the form actions. Additional attached PDFs
retain an artifact-specific refinement action so their identity is not hidden.
Manual save, reviewed PDF acceptance, and atomic scholarly-provider acceptance
continue to use their existing API contracts and provenance semantics.

## Consequences

**Positive:**

- Current and suggested values can be compared without scanning between two forms.
- The interface has one stable location for every bibliographic field.
- Existing provider refetch, fingerprint, grouping, and atomicity guarantees remain intact.

**Negative:**

- Suggestions are distributed across the form, so a compact action summary is
  still required to explain which trust boundary will be applied.
- PDF and scholarly suggestions cannot be committed through one button without a
  new cross-boundary atomic API.

**Neutral:**

- Preview remains ephemeral and manual editing remains available before or after refinement.
- No storage, provider, or Durable Object contract changes.

## Alternatives Considered

### Keep a duplicate review form

This preserves the current implementation structure but makes researchers map
the same field names and values between two vertically separated surfaces.

### Copy suggestions into the form and use Save details

This is visually simple but would record reviewed provider values as manual
edits, bypass provider refetch and lose truthful field-level provenance.

### Add one mixed PDF-and-provider acceptance endpoint

This could provide one apply action, but it expands the server contract and
atomic mutation model for a presentation problem. Separate compact actions keep
the trust boundaries visible without backend churn.
