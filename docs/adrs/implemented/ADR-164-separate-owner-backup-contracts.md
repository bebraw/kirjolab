# ADR-164: Separate Owner Backup Contracts Behind One Facade

**Status:** Implemented

**Date:** 2026-07-22

**Supports:** [ADR-090](./ADR-090-combine-pitr-with-change-aware-r2-backups.md), [ADR-151](./ADR-151-model-reviews-as-independent-resources.md)

## Context

The owner-backup domain accumulated four distinct responsibilities in one
module: public schema generations and status types, canonical digest and key
projection, referenced-binary collection, and compatibility validation for v1,
v2, and v3 manifests. The coordinator, API, and tests benefit from a stable
import boundary, but changing any one responsibility made the entire 499-line
module appear coupled to every backup consumer.

The validation boundary is security- and recovery-sensitive. It needs focused
mutation testing without making callers aware of which compatibility validator
or projection helper implements the public contract.

## Decision

Keep `src/domain/backups.ts` as the stable public facade and separate its
implementation by responsibility:

- `backup-types.ts` owns schema constants, manifest generations, owner state,
  recovery, binary, and status types;
- `backup-projection.ts` owns canonical digest serialization, content-addressed
  keys, manifest keys, binary-reference collection, and owner-key checks;
- `backup-validation.ts` owns bounded parsing and v1-v3 compatibility
  validation.
- `canonical-json.ts` and `sha256.ts` provide the shared deterministic ordering
  and text-digest primitives used by owner manifests, review payloads, and
  recovery comparison.

Projection may depend on schema types but cannot depend on manifest validation
or Durable Object coordinator state. Validation may depend on schema types and
the existing review-catalog and review-payload validators. Existing consumers
continue importing `backups.ts`.

## Consequences

**Positive:**

- Schema, deterministic projection, and compatibility validation have focused
  implementation and mutation surfaces.
- Coordinator and API imports remain stable.
- Compatibility logic can evolve without mixing hashing and R2 key rules into
  the same source unit.

**Negative:**

- The backup domain contains three implementation modules plus a facade.
- Internal imports add one intentional dependency layer.

**Neutral:**

- Manifest bytes, digests, keys, limits, accepted schema generations, and
  validation behavior remain unchanged.

## Alternatives Considered

### Keep one owner-backup module

This minimizes file count but preserves the mixed responsibilities and broad
change surface identified by maintainability analysis.

### Make consumers import implementation modules directly

This removes the facade but couples coordinator, API, and test code to the
internal split, making future maintenance moves application-wide changes.

### Split each schema generation into a separate validator

This gives each version a file but duplicates the shared envelope, binary,
review-access, and identifier rules. The current compatibility validator is a
more cohesive boundary until version-specific behavior grows independently.
