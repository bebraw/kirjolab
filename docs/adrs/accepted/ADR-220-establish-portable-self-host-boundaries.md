# ADR-220: Establish Portable Self-Host Boundaries

**Status:** Accepted

**Date:** 2026-08-04

## Context

Kirjolab's hosted deployment uses Cloudflare Workers, SQLite-backed Durable
Objects, R2, Queues, Browser Rendering, Workers AI, Cron Triggers, static
assets, and Cloudflare Access. That platform supplies useful production
semantics, but several of those capabilities are currently visible directly to
application code. A different host would therefore have to reproduce
Cloudflare APIs before it could reuse Kirjolab's domain behavior.

People evaluating Kirjolab also need a lower-friction path than creating a
Cloudflare account and provisioning hosted resources. Docker Compose can run
the existing Worker through the local workerd/Miniflare compatibility runtime,
but that runtime is a development simulator rather than a portable production
architecture. Treating its persisted state as Kirjolab's permanent storage
contract would replace one platform dependency with another implicit one.

The first portability slice needs to make architectural progress without
rewriting the ten existing Durable Object authorities, weakening their
serialization guarantees, or prematurely selecting a distributed database.

## Decision

Keep Cloudflare as the supported hosted adapter and introduce portable runtime
capabilities incrementally behind source-local, provider-neutral contracts.
Domain and capability services must depend on those contracts; Cloudflare and
self-host implementations may depend on their respective runtimes.

Make SQLite the first implemented portability boundary. Define a narrow
database contract for synchronous statements, typed queries, and atomic
transactions. Adapt Durable Object SQLite storage to that contract and provide
a Node.js `node:sqlite` implementation. Keep Durable Object RPC,
authorization, coordination, and multi-resource transactions in their existing
facades until a cohesive service is deliberately extracted.

Stop this native portability slice at the SQLite adapter. Portable blob
storage, background jobs, scheduling, generic identity, HTTP/WebSocket hosting,
and multi-replica coordination require later decisions and must not be hidden
inside the database contract.

Also provide an evaluation-only Docker Compose distribution that runs the
current Worker through the repository-pinned local workerd/Miniflare toolchain.
It must:

- start without a Cloudflare account or remote binding;
- publish only on host loopback and use the existing loopback-local identity;
- run exactly one application replica;
- persist local Durable Object and R2 simulation state in one named volume;
- omit Cloudflare-only artifact analysis bindings; and
- make its evaluation, single-user, and non-HA status explicit.

The compatibility distribution is not the future native self-host runtime and
its local runtime storage layout is not a Kirjolab interchange contract. Data
portability continues to require logical export/import work.

## Trigger

The user asked for a path away from mandatory Cloudflare hosting, approved
implementation through a SQLite adapter, and requested a Docker Compose build
that people can run themselves before multiplayer support exists.

## Consequences

**Positive:**

- Evaluators can run Kirjolab locally through one documented Compose command
  without provisioning Cloudflare resources.
- SQLite migrations and future persistence services gain a real contract with
  both Cloudflare and Node implementations.
- Hosted behavior remains on its current production-proven adapter while
  portability can advance capability by capability.
- The single-replica boundary preserves the current single-authority ordering
  model instead of implying unsupported distributed coordination.

**Negative:**

- The first Compose distribution still uses Cloudflare's open-source local
  runtime compatibility layer.
- Its persisted Miniflare state has no long-term compatibility promise and is
  unsuitable as a migration or backup format.
- Artifact analysis that depends on Browser Rendering, Queues, or Workers AI is
  unavailable in the evaluation profile.
- A complete native self-host runtime still needs storage, job, identity,
  scheduling, HTTP, and realtime adapters beyond SQLite.

**Neutral:**

- ADR-040 remains the hosted collaboration and R2 decision; this ADR adds an
  adapter direction without replacing its Cloudflare implementation.
- ADR-043 remains the hosted Cloudflare Access decision. The evaluation profile
  uses only its existing loopback-local alternative and cannot be exposed as a
  public service.
- ADR-090 remains the hosted PITR and R2-backup decision. The evaluation profile
  promises only persistence across ordinary container restarts.

## Alternatives Considered

### Treat Miniflare as the permanent self-host runtime

This maximizes immediate code reuse, but makes a development simulator and its
internal persistence layout part of the product contract. It is retained only
as a bounded evaluation bridge.

### Build a native Node runtime in one change

This would require simultaneous decisions for identity, blobs, jobs,
scheduling, HTTP, WebSockets, collaboration authority, and migration. The
result would be difficult to review and would risk changing hosted behavior.

### Move directly to PostgreSQL and S3

This could support a later multi-node deployment, but it would require adding
partition keys and distributed coordination semantics across the existing
authority-local SQLite design. No current self-host requirement justifies that
rewrite.
