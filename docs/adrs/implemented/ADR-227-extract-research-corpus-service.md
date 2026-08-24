# ADR-227: Extract a Research Corpus Service

**Status:** Implemented

**Date:** 2026-08-24

## Context

Kirjolab currently owns source metadata, private PDF bytes, web captures,
extraction jobs, and extracted results alongside manuscripts, collaboration,
reviews, and writing UI. Most of that research material is useful outside one
writing frontend. Keeping it behind Kirjolab-specific routes would make every
new client reproduce intake and extraction behavior or couple itself to the
current application shell.

The stored material is already split across an owner-scoped Reference Library
Durable Object, R2, and artifact-analysis queues. Moving those authorities in
one change would risk namespace discontinuity, duplicate objects, or two
writers. The service boundary therefore needs to become real before physical
storage ownership moves.

## Decision

Introduce Research Corpus as an independently deployable application service
and the canonical client-facing boundary for reusable research data. It owns
the contracts for:

- stable source and artifact identity;
- original artifact representations;
- metadata, rights, fingerprints, and provenance;
- asynchronous extraction requests and lifecycle; and
- bounded, immutable extraction results.

Kirjolab continues to own manuscripts, Yjs collaboration, project membership,
project-local citation aliases and links, claims, review workflows, and their
UI state. Project features may refer to corpus identities but must not make a
project document the authority for corpus data.

Use provider-neutral application contracts beneath every transport. Keep
object keys, Durable Object stubs, Queue messages, R2 handles, and other
Cloudflare capabilities inside adapters.

Adopt an incremental migration with one authoritative write path per behavior.
The first deployed service reads and mutates the existing owner-scoped
Reference Library Durable Object and R2 objects and submits the existing
versioned analysis jobs. The Durable Object remains the transactional storage
authority and Kirjolab's current `/api/library` routes remain a compatibility
surface. New clients use the corpus API. Later changes may transfer physical
storage ownership only through an explicit migration ADR with rollback and
reconciliation rules. Dual writes are prohibited.

For PDF intake, both HTTP surfaces call one shared operation that streams the
owner-scoped R2 object, creates or reuses the Durable Object draft, removes a
redundant or failed upload, and submits the three independent extraction jobs.
The standalone service therefore supports new frontend writes without adding a
second storage implementation.

## Trigger

The user wants PDFs, documents, and their extraction lifecycle reusable by
Kirjolab and future frontends instead of embedded in one product surface.

## Consequences

**Positive:**

- Several frontends can share one intake, identity, rights, and extraction
  authority.
- Transport and deployment concerns no longer define the domain contract.
- The first increment can be deployed without copying or rewriting private
  data.
- Existing Kirjolab clients keep working while consumers migrate deliberately.

**Negative:**

- The transition temporarily has two HTTP surfaces over the same underlying
  authority.
- Physical storage still depends on Kirjolab's current Durable Object namespace
  until a later migration is justified.
- Compatibility behavior must be tested until every old client is migrated.

**Neutral:**

- ADR-178's fingerprint-qualified Queue lifecycle remains the extraction
  authority for the first service increment.
- ADR-220's provider-neutral capability direction remains in force; this ADR
  introduces a service boundary without pretending the existing storage is
  provider-independent.

## Alternatives Considered

### Keep extraction as Kirjolab-internal routes

This minimizes immediate work but makes future clients depend on a writing
application's API and ownership model.

### Move all state into a new service namespace immediately

This creates a cleaner physical diagram at the cost of a high-risk private-data
migration and a likely dual-write interval. The migration is deferred until the
new boundary has real consumers and reconciliation requirements.

### Let each frontend extract its own data

This avoids a service but duplicates expensive processing, fragments
provenance, and allows results for the same immutable artifact to diverge.
