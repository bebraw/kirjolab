# ADR-052: Test Durable Objects in the Workers Runtime

**Status:** Implemented

**Date:** 2026-07-11

## Context

Kirjolab's durable collaboration contracts now depend on behavior that a Node
test double cannot establish: per-object SQLite storage, synchronous
transactions, constructor-time schema migration, RPC serialization, and
recovery after a Durable Object instance is evicted. The document room also
needs tests that can seed an older persisted schema and inspect the resulting
migration ledger, anchor backfill, bibliography projection, and rollback state.

The existing Node Vitest suite is still the right fast environment for pure
domain code. Browser end-to-end tests exercise the complete application path,
but they are too indirect for creating precise historical SQLite states or
proving which writes survived a failed transaction. Treating either suite as a
substitute for the Workers runtime would leave the most important persistence
contracts dependent on mocks or black-box inference.

Cloudflare's supported Vitest integration runs test modules inside `workerd`,
provides isolated storage, exposes real Durable Object bindings, and permits
direct instance and SQLite inspection through `cloudflare:test`. Its current
release line requires Vitest 4.1 or newer; the repository already pins Vitest
4.1.8.

## Decision

Pin `@cloudflare/vitest-pool-workers` at version `0.18.4` and maintain a
dedicated Workers Vitest project and configuration beside the existing Node
Vitest configuration. `vitest.workers.config.mts` selects only
`src/**/*.workers.test.ts`, with its test types isolated in
`tsconfig.workers-test.json`, so `npm test`, coverage, mutation testing, and
affected-test discovery continue to use Node for pure domain and routing
behavior.

Run Workers tests in a real local `workerd` runtime with isolated storage for
each test. Address Durable Objects through configured bindings and use
`cloudflare:test` utilities such as `runInDurableObject()` to seed and inspect
their private SQLite state. Use explicit Durable Object eviction when a
contract depends on reconstructing in-memory state from persisted storage.

The Workers suite owns contracts whose correctness depends on the platform:

- application migration ordering, ledger history validation, idempotence, and
  rollback after a failing migration
- upgrades from representative historical document-room schemas and data states
- atomic document, Yjs, anchor, bibliography-projection, and publication writes
- reconstruction after Durable Object eviction without loss of persisted state
- RPC and Durable Object storage behavior that cannot be represented truthfully
  by the Node storage substitute

The Node suite remains authoritative for pure parsing, projection, validation,
text-splice, selector, and migration-definition logic that does not require a
Workers binding or SQLite transaction. A Node test may provide fast local
feedback for shared logic, but it does not replace the corresponding Workers
test when the contract includes persistence, transaction, migration, RPC, or
eviction semantics.

Make the dedicated Workers test command mandatory in the baseline quality gate
and local Agent CI workflow. Non-documentation changes are not ready until both
`npm run quality:gate` and `npm run ci:local` execute it successfully; running
the Workers project directly remains a targeted iteration tool, not an
alternative readiness path.

## Trigger

ADR-051 introduced versioned, transactional SQLite migrations and atomic
bibliography reconciliation. A strict review found that the existing Node
storage substitute could exercise call shape but could not prove actual
`transactionSync`, migration rollback, persisted upgrade, or eviction behavior.

## Consequences

**Positive:**

- Migration and transaction tests execute against the same SQLite-backed
  Durable Object APIs used by production Workers.
- Tests can construct historical object state, invoke the public RPC boundary,
  inspect exact persisted rows, and verify recovery after eviction.
- Per-test storage isolation prevents schema and object state from leaking
  between cases.
- Pure domain tests keep their fast Node coverage and mutation workflow.
- The readiness gates cannot silently omit platform-specific persistence
  verification.

**Negative:**

- Local and CI verification now start an additional `workerd` test project and
  take longer than Node-only tests.
- The repository carries a Cloudflare-specific testing dependency and separate
  configuration that must stay compatible with Vitest, Wrangler, and the
  deployment configuration.
- Direct storage inspection intentionally couples migration tests to private
  schema details; those assertions must change when an explicit new migration
  changes the schema.

**Neutral:**

- Browser end-to-end tests continue to own user-visible and multi-surface
  workflows; the Workers suite is a focused persistence integration layer.
- Worker tests use local isolated storage and do not contact or mutate deployed
  Cloudflare resources.
- Pinning `0.18.4` makes upgrades deliberate rather than automatic.

## Alternatives Considered

### Keep Only Node Unit Tests

Node tests are faster and easy to instrument, but the storage substitute cannot
establish actual SQLite transaction rollback, Durable Object construction,
RPC serialization, or eviction recovery.

### Rely Only on Browser End-to-End Tests

Browser tests prove valuable complete workflows, but seeding historical private
schemas and inspecting migration ledgers through the public UI would be brittle
and would still infer atomicity indirectly.

### Run Every Vitest Test Inside Workers

This would reduce the number of configurations, but it would make pure domain
coverage and mutation tests slower and unnecessarily couple portable logic to a
platform runtime.

### Spawn Wrangler Manually from Node Tests

A separately managed process can test HTTP behavior, but it adds lifecycle and
port coordination while providing a weaker path to isolated private Durable
Object storage than the supported Vitest integration.

### Combine Node and Workers Tests in One Undifferentiated Project

A single test glob obscures which environment owns each contract and makes it
easy for a persistence regression to pass under a Node substitute. Separate
projects keep the runtime boundary reviewable and independently runnable.
