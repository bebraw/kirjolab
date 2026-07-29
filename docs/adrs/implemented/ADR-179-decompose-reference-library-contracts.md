# ADR-179: Decompose Reference-Library Contracts

**Status:** Implemented

**Date:** 2026-07-29

## Context

The reference-library domain module grew to 1,090 lines and became a mixed
contract surface for 82 dependents. Bibliographic metadata, PDF artifacts,
annotations, background analysis, web captures, private research, and snapshot
validation changed through one file even though most consumers needed only one
capability.

Turning the complete reference library into a published package would preserve
that coupling behind a package boundary. Removing the old entry point in one
change would create a broad import migration without changing behavior.

## Decision

Keep reference-library contracts source-local and split them into capability
modules for metadata, artifacts, PDF annotations, artifact analysis, web
sources, research, and snapshots. Retain `src/domain/reference-library.ts` as a
compatibility facade that re-exports those public contracts while existing
consumers migrate incrementally.

New consumers import the narrow capability module. Capability modules may
depend on lower-level contracts but must not import the compatibility facade or
application, API, browser-component, Durable Object, or Cloudflare runtime
authorities.

This is a responsibility split only. It does not tighten persisted snapshot
validation, change public API shapes, or approve an npm workspace or published
package.

## Trigger

The modularization and dependency RFC identified the reference-library module
as the highest fan-in mixed domain surface and selected internal decomposition
before evaluating package publication.

## Consequences

**Positive:**

- Changes to one reference-library capability have a smaller implementation
  surface.
- PDF analysis and other reusable mechanics can depend on narrow contracts.
- Existing consumers remain source-compatible during incremental migration.
- A future package decision can evaluate coherent capabilities instead of one
  application-wide domain blob.

**Negative:**

- The compatibility facade temporarily preserves broad imports and can hide
  incomplete consumer migration.
- Cross-capability types require explicit directional dependencies.
- File count increases even though executable behavior is unchanged.

**Neutral:**

- Persistence, authorization, API routes, and feature behavior remain in their
  existing authorities.
- Package publication still requires a separate consumer and decision.

## Alternatives Considered

### Publish the complete reference library

Rejected because the module contains Kirjolab product policy and unrelated
capabilities. A package boundary would add versioning without reducing
coupling.

### Remove the old module and rewrite every consumer atomically

Rejected because a broad mechanical migration would increase review risk while
providing no additional runtime value. The facade permits focused migrations.

### Leave the mixed module intact

Rejected because its fan-in made unrelated contract changes share one
implementation and validation unit.
