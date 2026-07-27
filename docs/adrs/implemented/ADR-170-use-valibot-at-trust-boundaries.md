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
- Browser response contracts: GitHub connection and synchronization payloads,
  LaTeX import previews, snapshot comparisons, created annotations, and share
  link state.
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

Schemas validate local structure only. Stateful invariants, authorization,
deduplication, provenance, canonicalization, and relationships between records
remain explicit domain functions. Existing validators are not migrated merely
for consistency; each later use must delete equivalent project-owned
infrastructure and retain focused boundary tests.

## Consequences

**Positive:**

- Runtime structure and inferred payload types share one definition.
- Library interchange no longer relies on unchecked double casts.
- Nested array, union, optional-field, and numeric bounds are expressed
  compositionally.
- Browser response contracts no longer maintain parallel interfaces, nested
  predicates, and record helpers for the same payload shapes.
- Later trust-boundary migrations have an explicit adoption threshold.

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
