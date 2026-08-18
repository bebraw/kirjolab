# ADR-186: Promote Source Modules Through Evidence Gates

**Status:** Implemented

**Date:** 2026-07-29

**Clarified:** 2026-08-18

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

Use three explicit maturity states: source-local module, private package
candidate, and published package. A private candidate may be a workspace package
or a deterministic installable tarball. Promotion is evidence-based and never
implied by file size or reuse within one application.

A candidate may become a private package only when all of these are true:

1. Independent consumption evidence exists through either two independently
   built in-repository executables or one named, maintained external adapter that
   consumes the same coherent capability through its own build and runtime.
   Tests, fixtures, examples, spikes, compatibility facades, and an unmaintained
   prospective integration do not count as the consumer.
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

The first candidate manifest remains private, uses a `0.x` version, and exposes
explicit exports only. Adding workspace configuration is a separate structural
change, not an automatic consequence of passing the conceptual gates. A
deterministic private tarball and isolated consumer test may be created to let a
named external adapter qualify this gate; producing that candidate is not
registry publication and does not by itself prove maintained external use.

Public publication requires every private-candidate gate plus:

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

The paper-import core is the first candidate evaluated through the maintained-
external-adapter route. Slideotter supplies a named independent runtime and a
concrete archive, conversion, provenance, preview-identity, conformance, and PDF
extraction contract. Kirjolab may therefore prepare and test a private `0.x`
candidate for that adapter without inventing a second Kirjolab executable. The
candidate remains private until the adapter demonstrates maintained consumption;
it does not satisfy the public-publication gates below.

The PDF-analysis core still reaches only the main browser and generated
artifact-analyzer entry point, which share one application build, dependency
policy, and runtime lifecycle. The reference contracts, Durable Object slice,
review domain, and UI primitives likewise remain application-owned until they
produce equivalent independent-consumer evidence.

## Consequences

**Positive:**

- Internal modularity can improve without prematurely freezing public APIs.
- Workspace and release overhead must correspond to a demonstrated boundary.
- A maintained external adapter can provide stronger package-boundary evidence
  than an artificial second executable inside Kirjolab.
- Publication cannot accidentally widen Kirjolab product-policy or security
  authorities into a general library.
- Future promotion reviews have a repeatable checklist and explicit owner.

**Negative:**

- A promising library may remain source-local longer than an early adopter
  would prefer.
- A private candidate created to bootstrap an external adapter may be discarded
  or revised before that adapter establishes maintained consumption.
- Every promotion adds an ADR and verification work before implementation.

**Neutral:**

- Source-local entry points remain allowed to evolve with their Kirjolab
  consumers.
- A qualifying private candidate may add a manifest and deterministic tarball,
  but no registry, credentials, or public release workflow.

## Alternatives Considered

### Convert the repository to npm workspaces now

Rejected because Kirjolab has one build unit. Workspaces would add manifests,
dependency coordination, and quality-gate routing without an independent
consumer or runtime boundary.

### Require two Kirjolab executables despite a maintained external adapter

Rejected because it would create an artificial in-repository consumer after an
independent product already demonstrates the dependency, runtime, and versioning
boundary that the gate is meant to establish. The external adapter must still be
named and maintained and must install and test the actual private candidate.

### Publish the PDF-analysis core now

Rejected because highlight and reference analysis are two capabilities inside
one application pipeline, not independently maintained consumers. The core API
is intentionally still incubating.

### Use import count or line count as the promotion trigger

Rejected because both measurements can be high for application-specific policy.
They reveal coupling pressure but do not demonstrate a stable reusable contract
or justify release ownership.
