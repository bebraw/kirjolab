# ADR-180: Delegate Artifact-Analysis Persistence

**Status:** Implemented

**Date:** 2026-07-29

## Context

The owner-scoped `ReferenceLibrary` Durable Object combined migrations, RPC
methods, and persistence for bibliographic records, PDFs, annotations, web
captures, research state, metadata refinement, citation assertions, and
background artifact analysis in one implementation file.

Artifact analysis already has a cohesive lifecycle and contract: a PDF
fingerprint and request identity guard the queued, running, ready, and failed
states. Keeping its SQL, row validation, and result decoding inside the
Durable Object class made that independent lifecycle harder to evolve without
touching the complete Library authority.

## Decision

Keep `ReferenceLibrary` as the stable Durable Object RPC and migration facade.
Delegate artifact-analysis queue, lookup, start, completion, and failure
persistence to an adjacent `ArtifactAnalysisService`.

The service receives only the Durable Object's SQL capability. It imports the
narrow artifact-analysis domain contract, owns its persisted row mapping and
result validation, and does not import API, client, queue-consumer, or broader
Library authorities. Public RPC method names and signatures remain on
`ReferenceLibrary`.

Each lifecycle transition remains one SQLite statement or one read followed by
one statement, as before. The extraction does not introduce a hidden
transaction or move any multi-resource invariant out of the Durable Object.

## Trigger

The modularization and dependency RFC selected internal Durable Object
decomposition as the first application-authority workstream. Artifact analysis
is the first bounded vertical slice because it has independent state,
fingerprint-qualified concurrency rules, and existing Workers-runtime coverage.

## Consequences

**Positive:**

- Artifact-analysis persistence can change without expanding the main Library
  implementation file.
- The Durable Object retains a small, stable RPC facade for existing callers.
- Persisted result validation depends on the narrow domain capability rather
  than the compatibility facade.
- The first extraction establishes a repeatable service boundary for later
  Durable Object slices.

**Negative:**

- The service still depends on the Cloudflare SQLite contract and is not a
  reusable domain library.
- The Durable Object and service must be read together when tracing one RPC
  transition.
- Further decomposition remains incremental; the Library authority is still
  large.

**Neutral:**

- API behavior, analysis schemas, migrations, authorization, and queue delivery
  remain unchanged.
- No external dependency or npm package is introduced.

## Alternatives Considered

### Move the complete Library Durable Object at once

Rejected because a broad mechanical split would obscure transaction placement
and make behavioral parity harder to review.

### Extract only SQL helper functions

Rejected because free-standing helpers would reduce line count without giving
the artifact-analysis lifecycle one explicit owner.

### Publish the lifecycle as a package

Rejected because it is coupled to Kirjolab's persisted schema and Cloudflare
SQLite. It has no independent consumer or stable public release contract.
