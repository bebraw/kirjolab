# ADR-198: Organize Source by Capability

**Status:** Implemented

**Date:** 2026-07-30

## Context

`src/client/` accumulated 312 files in one directory and `src/domain/`
accumulated 119 root files. Their filenames already exposed cohesive areas such
as Library, PDF, project, review, citation, publication, and workspace, but the
filesystem did not communicate those boundaries. Finding related code required
prefix searches, and unrelated capabilities appeared to share one authority.

The existing `src/domain/reference-library/` decomposition demonstrated that a
source-local capability boundary can improve navigation without introducing a
package, build, or release boundary. The browser also has a few genuine bundle
entrypoints whose stable location is useful to build tooling.

## Decision

Organize browser and domain implementation modules into shallow, product-named
capability directories.

Keep `src/client/app.ts`, `src/client/review-app.ts`, and
`src/client/service-worker.ts` at the client root as browser entrypoints. Keep
their feature implementations and colocated tests under directories such as
`assistant/`, `library/`, `pdf/`, `project/`, `review/`, and `workspace/`.
Reserve `app/` for application composition support, `platform/` for
browser-wide technical primitives, and `integrations/` for external-provider
browser surfaces.

Group domain modules that evolve as one capability under directories such as
`review/`, `citation/`, `project/`, `publication/`, `manuscript/`, `backup/`,
and `workspace/`. Leave dependency-light, cross-capability leaf modules at the
domain root. Retain the explicit `reference-library.ts` compatibility facade
required by ADR-179 while its broad consumers are migrated.

Keep filenames descriptive at repository scope even when they repeat their
directory name. Do not add barrel files merely to shorten imports, and do not
replace product capabilities with technical-layer directories such as
`components/`, `controllers/`, `services/`, `models/`, or `utils/`.

This is a source-ownership and navigation change only. It does not introduce a
runtime boundary, published package, authorization change, or behavior change.

## Consequences

**Positive:**

- The filesystem communicates product concepts and likely change scope.
- Related implementation and test files are browsable without prefix searches.
- Browser entrypoints, product capabilities, and technical primitives are
  visibly distinct.
- Future decomposition can happen inside the owning capability without growing
  another flat application-wide directory.

**Negative:**

- Existing imports and path-based tooling require a broad one-time migration.
- Some cross-capability imports remain because this decision exposes current
  ownership; it does not manufacture new runtime boundaries.
- Descriptive filenames can repeat their directory name.

**Neutral:**

- Tests remain colocated with their implementation modules.
- Build outputs and browser entrypoint names remain unchanged.
- Package publication still requires the evidence gates in ADR-186.

## Alternatives Considered

### Retain flat source roots

Rejected because the current file counts make browsing and ownership discovery
depend on filename conventions alone.

### Organize by technical layer

Rejected because components, controllers, services, and models for one product
capability would be scattered across the tree. The filesystem would describe
implementation mechanics instead of the product.

### Create workspace packages

Rejected because the capabilities do not have independent build, runtime,
release, or consumer boundaries. Source-local directories provide the needed
structure without package-management overhead.
