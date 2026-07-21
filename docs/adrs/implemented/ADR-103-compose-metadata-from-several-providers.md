# ADR-103: Compose Metadata from Several Providers

**Status:** Partially superseded by [ADR-157](./ADR-157-project-metadata-suggestions-into-the-editor.md)

**Date:** 2026-07-14

**Amends:** [ADR-085](./ADR-085-unify-reviewed-metadata-refinement.md),
[ADR-100](./ADR-100-order-reviewed-scholarly-metadata-providers.md)

## Context

The reviewed metadata flow exposes several scholarly services but lets the
researcher inspect and accept only one provider record at a time. This loses
useful complementary data: a registry may have the strongest title and author
list while an index has a better abstract or venue. Repeating single-provider
acceptance also permits partial updates and obscures which source supplied each
field.

Provider search can return several plausible works. Combining fields before
establishing that records describe the same work would be more dangerous than
choosing one imperfect source.

## Decision

Group preview candidates by normalized DOI. The researcher chooses one work
group when discovery returns several works, then chooses a source independently
for each differing bibliographic field. Keep current metadata as an explicit
field option. Retain the separate editable PDF-suggestion section because those
values are locally extracted and use a different trust boundary.

Retain provider variants for the same DOI instead of deduplicating them into one
record. Exact-DOI refinement queries every configured provider plus Crossref and
DataCite. Bibliographic discovery retains unique provider-and-DOI pairs and
returns at most twelve candidates.

Accept one to four provider selections for a single DOI. Fields must be unique
within and across selections. The Worker refetches every selected provider,
verifies each preview fingerprint, and rechecks DOI ownership before invoking
one Durable Object mutation. The library writes all selected values once and
records each field's actual provider. Any validation, provider, fingerprint, or
DOI failure occurs before mutation and leaves the record unchanged.

Keep the legacy single-provider acceptance body compatible for existing
callers.

## Consequences

**Positive:**

- One review can combine complementary registry and index metadata.
- DOI grouping prevents accidental field mixing across different works.
- One library write prevents partial multi-provider acceptance.
- Existing per-field provenance identifies the source of every accepted value.
- The field-first selector stays compact as provider coverage grows.

**Negative:**

- Exact-DOI preview performs more provider requests than a first-success cascade.
- Acceptance may refetch up to four providers.
- A larger twelve-candidate preview bound is required to retain useful variants.

**Neutral:**

- PDF extraction, manual editing, stable reference identity, and finalized keys
  keep their existing contracts.
- Provider previews remain ephemeral and untrusted.

## Alternatives Considered

### Apply providers one after another

This needs no new API shape but can leave a partially updated record when a
later fingerprint or provider request fails.

### Show a full provider-by-field matrix

This makes every value visible simultaneously but becomes too wide and dense in
the compact Library surface. Per-field source selectors retain the comparison
without a large table.

### Automatically merge the highest-quality fields

Provider quality varies by publication type and field. Automatic precedence
would hide judgment and weaken the explicit-review contract.
