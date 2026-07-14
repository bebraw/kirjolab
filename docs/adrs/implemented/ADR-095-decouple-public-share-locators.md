# ADR-095: Decouple Public Share Locators from Workspace IDs

**Status:** Implemented

**Date:** 2026-07-14

## Context

ADR-094 originally used the browser workspace id as the public read-only share
locator. That works for globally unique UUID projects, but the compatible
starter workspace uses the browser id `demo` in every owner's catalog. Hosted
storage keeps those projects isolated under owner-scoped Durable Object names,
so `/share/demo.{secret}` cannot identify one owner's target without identity.
Rejecting links only for the starter project exposes this internal routing
exception as arbitrary product behavior.

Moving a live document into another Durable Object would require copying
revision history, access state, and R2 objects despite no need to change its
authenticated browser identity. Putting an owner-derived storage key in the
public URL would instead expose stable pseudonymous account metadata.

## Decision

Decouple public share locators from browser workspace ids. Persist one random
UUID locator for each owner-scoped `demo` entry in its `WorkspaceCatalog`.
Continue using the existing globally unique workspace id as the locator for
ordinary projects so issued links remain compatible.

Store the locator's validated target `{ storageKey, workspaceId }` beside its
bearer token record in the locator-keyed `WorkspaceAccess` Durable Object. The
unauthenticated share route validates the token before returning or touching
the target mapping, then reads the mapped `DocumentRoom`. A missing mapping on
an already-issued ordinary-project link falls back to the legacy rule where
the locator is both storage key and workspace id.

Apply both schema additions through the existing append-only SQLite migration
ledgers. This is an application data migration on existing Durable Object
classes and does not add or rename a class, so it requires no Wrangler Durable
Object migration entry.

## Trigger

The read-only share flow must work consistently for the owner-scoped starter
project without moving document data or weakening tenant isolation.

## Consequences

**Positive:**

- Every owner project supports the same create, rotate, resolve, and revoke
  workflow.
- Public URLs reveal neither an owner-derived storage key nor a special demo
  identity.
- Existing ordinary-project share links continue to resolve.
- Manuscript history, collaboration state, and R2 objects remain in place.

**Negative:**

- Share resolution adds one small locator Durable Object lookup before reading
  the document room.
- Catalog and access objects each gain one migration and mapping table.

**Neutral:**

- Authenticated workspace URLs retain their existing stable identities.
- The bearer secret remains the authorization credential; knowing a locator is
  insufficient to read a project.

## Alternatives Considered

### Copy each starter document into a new UUID Durable Object

This would make its browser id globally routable, but safely copying all
history, access state, and binary objects is unnecessary for public sharing and
creates a larger failure surface.

### Put the owner-scoped storage key in the public URL

This avoids a mapping lookup but exposes a stable hash derived from account
identity and couples a public contract to internal sharding.

### Keep rejecting starter-project links

This preserves the original implementation but leaks an internal identity
exception into otherwise uniform project behavior.
