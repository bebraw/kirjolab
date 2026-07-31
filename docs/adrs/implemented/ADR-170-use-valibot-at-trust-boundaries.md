# ADR-170: Use Valibot at Trust Boundaries

**Status:** Implemented

**Date:** 2026-07-25

## Context

Kirjolab validates API payloads, imported files, persisted snapshots, model
responses, and integration responses at runtime. These boundaries accumulated
parallel TypeScript interfaces and handwritten structural predicates, including
dozens of local `isRecord` helpers. The duplication makes contract changes
easy to apply to the static type without applying them to runtime validation,
or vice versa.

Replacing every predicate mechanically would hide domain invariants in a schema
vocabulary and add dependency coupling without reducing maintenance. A useful
schema library must stay confined to unknown-data boundaries and preserve
Kirjolab's explicit resource limits and cross-record rules.

## Decision

Use pinned Valibot schemas for bounded external or persisted data contracts when
one schema can replace duplicated structural types and predicates. Infer the
accepted payload type from the schema where practical.

Adopted boundaries are:

- Library interchange: CSL JSON identity, names, dates, optional metadata,
  portable research records, archive version, and existing collection bounds.
- Browser bootstrap and response contracts: the server-rendered workspace id,
  identity email, and explicit workspace/Library mode plus GitHub connection
  and synchronization payloads, LaTeX import previews, snapshot comparisons,
  created annotations, and share-link state.
- Project history responses: revision summaries, retained revision projections,
  and file/composed/binary comparison results.
- Review-model boundaries: candidate creation requests and persisted candidate
  snapshots share operation, stage, provenance, disposition, and result-envelope
  schemas while result-specific evidence rules remain explicit domain logic.
- GitHub user responses: external identity, installation/account, repository,
  and branch structures share bounded schemas while OAuth inputs, response-byte
  limits, pagination ceilings, token expiry projection, and stable integration
  errors remain explicit transport policy.
- GitHub App repository responses: repository identity, ref and commit SHAs,
  commit metadata, recursive tree entries, created Git objects, and blob
  envelopes use bounded schemas while subtree normalization, Markdown and byte
  limits, LFS detection, optimistic concurrency, and stable integration errors
  remain explicit orchestration policy. The adjacent Octokit-authenticated
  transport also validates installation-token and bounded provider-error
  envelopes while retaining explicit response-size and HTTP-status policy.
- GitHub synchronization status: one inferred browser-side schema replaces the
  parallel serialized-status interface, relationship membership check, and
  non-negative integer predicates while presentation remains explicit UI
  policy.
- GitHub command requests: bounded Import, Pull, and Publish schemas replace
  repeated record, operation-id, string, integer, choice, and optional-array
  predicates while authorization, preview freshness, complete conflict
  resolution, remote identity, and reconciliation remain explicit.
- Owner-library private-PDF mutations: highlight, imported-highlight envelope,
  note, drawing, point, style, position, and reading-state schemas replace
  parallel structural interfaces and predicates while imported-candidate
  semantics, authorization, and Durable Object domain bounds remain explicit.
- Owner-library metadata review: reviewed PDF fields, artifact ids,
  fingerprints, provider choices, selected fields, and single/batch envelopes
  use composable schemas while normalized-DOI, unique-provider, disjoint-field,
  stale-provider, and duplicate-record rules remain explicit.
- Workspace lifecycle commands: settings, duplicate-title, milestone, and
  revision-seed schemas replace parallel request interfaces, record checks, and
  scalar predicates while authorization, canonical title trimming, catalog
  fan-out, revision identity, and Durable Object mutations remain explicit.
- Review catalog commands: creation, settings, membership, optional publish-
  link, and project-link schemas replace repeated record and primitive checks
  while immutable-profile policy, email normalization, authorization, project
  access, and multi-catalog projection remain explicit.
- Review-study decisions: shared safe-revision, screening-stage, outcome, and
  nullable-criterion primitives compose screening, final-inclusion,
  adjudication, duplicate-resolution, quality-answer, extraction-value, and
  reassessment-completion schemas while concurrency, evidence parsing and
  authorization, actor identity, and Durable Object mutation remain explicit.
  Review JSON body reading enforces byte limits on the stream instead of
  trusting `Content-Length`.
- Edit-capability file mutations: one request schema replaces the record,
  content, length, numeric, and safe-integer checks while bounded body reading,
  bearer and same-origin authorization, revision conflicts, and mutation error
  mapping remain explicit.
- Offline workspace persistence: one inferred record schema replaces the
  parallel record interface and structural predicate while preserving the exact
  schema version, ArrayBuffer requirements, and 16 MiB Yjs-state bounds.
  Identity and workspace matching, snapshot validation, Yjs decoding and
  application, anchor reprojection, and corrupt-record eviction remain explicit
  persistence policy.

Schemas validate local structure only. Stateful invariants, authorization,
deduplication, provenance, canonicalization, and relationships between records
remain explicit domain functions. Existing validators are not migrated merely
for consistency; each later use must delete equivalent project-owned
infrastructure and retain focused boundary tests. Values generated and consumed
inside one typed process do not gain a schema or retain an unused structural
predicate without an actual unknown-data consumer.

For boundaries that still need only the common plain-record predicate, use the
dependency-free unknown-value guard. It owns the non-null, object, and non-array
semantics without requiring a Valibot schema or repeating a local helper.

## Consequences

**Positive:**

- Runtime structure and inferred payload types share one definition.
- Library interchange no longer relies on unchecked double casts.
- Nested array, union, optional-field, and numeric bounds are expressed
  compositionally.
- Browser response contracts no longer maintain parallel interfaces, nested
  predicates, and record helpers for the same payload shapes.
- Later trust-boundary migrations have an explicit adoption threshold.
- Handwritten boundaries share one plain-record semantic instead of carrying
  local copies.

**Negative:**

- Worker and browser bundles gain a pinned runtime dependency.
- Contributors must understand Valibot's distinction between objects, records,
  parsing, and type-guard validation.
- Custom error projection is still required where callers need stable
  domain-specific messages.

**Neutral:**

- Valibot does not become the domain model or an authorization framework.
- Canonical Library storage and interchange representations remain unchanged.

## Alternatives Considered

### Keep handwritten predicates

This avoids a dependency but retains duplicated static and runtime contracts,
local record helpers, and unsafe assertions at every migrated boundary.

### Adopt Zod

Zod provides a familiar schema API, but Valibot's modular functions are a
better fit for browser and Worker bundles and the repository's preference for
small, tree-shakeable dependencies.

### Generate validators from TypeScript

Generated validators preserve interfaces as the source but add a code-generation
step and lasting generated output. That conflicts with the repository's
lightweight toolchain unless a much larger validation surface justifies it.

### Convert all domain predicates

A wholesale migration would obscure business invariants, create a large
regression surface, and adopt the library where it does not demonstrably reduce
maintenance.
