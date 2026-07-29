# ADR-186: Promote Source Modules Through Evidence Gates

**Status:** Implemented

**Date:** 2026-07-29

## Context

Kirjolab's modularization work established narrower reference contracts, a
Durable Object persistence slice, and a source-local PDF-analysis core. Those
boundaries reduce coupling without requiring npm workspaces, independent build
units, version negotiation, or a release process.

Repository size and multiple imports inside one application do not establish a
library market. Tests, examples, compatibility facades, and spikes also do not
prove that an API supports an independent consumer. Promoting too early would
freeze still-evolving contracts and add packaging work without reducing product
maintenance.

## Decision

Use three explicit maturity states: source-local module, private workspace
package, and published package. Promotion is evidence-based and never implied by
file size or reuse within one application.

A candidate may become a private workspace package only when all of these are
true:

1. Two independently built in-repository executables consume the same coherent
   capability. Tests, fixtures, examples, spikes, and compatibility facades do
   not count.
2. The package needs an independent dependency, runtime, build, or release
   boundary that source-local modules cannot express as clearly.
3. Its public entry point is small, typed, documented, and free of imports from
   Kirjolab UI, API, Durable Object, authorization, persistence, or deployment
   authorities unless that authority is the package's declared purpose.
4. Moving the boundary deletes duplicate mechanics or prevents an already
   demonstrated dependency leak; it does not merely relocate files.
5. Independent tests cover the exported contract, the root quality gate covers
   every consumer, and dependency/artifact diagnostics record the cost.
6. An ADR names the package owner, compatibility policy, and reversal path.

The first workspace manifest remains private and exposes explicit exports only.
Adding workspace configuration is a separate structural change, not an
automatic consequence of passing the conceptual gates.

Publication requires every workspace gate plus:

1. A maintained consumer outside the Kirjolab application and repository, or a
   user-approved distribution target with a named adopter and concrete usage.
2. A versioned public contract with semantic-versioning, compatibility,
   deprecation, and changelog policy.
3. Package documentation, license compatibility, supported runtime matrix,
   security reporting route, and a named release owner.
4. A reviewed package tarball containing only intended files, reproducible
   build and test evidence, and no Kirjolab secrets, private fixtures, generated
   state, or application-only imports.
5. A separate ADR approving registry, provenance, credentials, and release
   automation before any public publish occurs.

No current candidate passes every workspace gate. The PDF-analysis core reaches
the main browser and the generated artifact-analyzer entry point, but both ship
through one application build and share one dependency, runtime, and versioning
policy. A package would not establish a useful independent lifecycle. The
reference contracts, Durable Object slice, review domain, and UI primitives
likewise remain application-owned.

## Consequences

**Positive:**

- Internal modularity can improve without prematurely freezing public APIs.
- Workspace and release overhead must correspond to a demonstrated boundary.
- Publication cannot accidentally widen Kirjolab product-policy or security
  authorities into a general library.
- Future promotion reviews have a repeatable checklist and explicit owner.

**Negative:**

- A promising library may remain source-local longer than an early adopter
  would prefer.
- Establishing an independent consumer must precede packaging work, so some
  reuse experiments may need temporary repository-local adapters.
- Every promotion adds an ADR and verification work before implementation.

**Neutral:**

- Source-local entry points remain allowed to evolve with their Kirjolab
  consumers.
- This decision adds no workspace manifest, package, registry, credentials, or
  release workflow.

## Alternatives Considered

### Convert the repository to npm workspaces now

Rejected because Kirjolab has one build unit. Workspaces would add manifests,
dependency coordination, and quality-gate routing without an independent
consumer or runtime boundary.

### Publish the PDF-analysis core now

Rejected because highlight and reference analysis are two capabilities inside
one application pipeline, not independently maintained consumers. The core API
is intentionally still incubating.

### Use import count or line count as the promotion trigger

Rejected because both measurements can be high for application-specific policy.
They reveal coupling pressure but do not demonstrate a stable reusable contract
or justify release ownership.
