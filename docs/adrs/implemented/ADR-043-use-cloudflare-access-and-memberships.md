# ADR-043: Use Cloudflare Access and Workspace Memberships

**Status:** Implemented

**Date:** 2026-07-10

## Context

Stable workspace URLs and collaborative WebSockets must not expose manuscripts,
PDFs, annotations, or model candidates to anyone who knows an id. Kirjolab
already runs on Cloudflare Workers, and adding an application-owned password or
OAuth credential store would create a second identity system before the hosted
product is otherwise mature.

Cloudflare Access blocks unauthenticated requests at the edge, but a Worker
origin can still be reached through configuration mistakes. Trusting an
identity header without validating its signature would permit spoofing.

## Decision

Use Cloudflare Access as the hosted identity provider and independently verify
the `Cf-Access-Jwt-Assertion` RS256 token inside the Worker. Verification must
check the signature against the team's rotating JWKS, issuer, application
audience, expiration, not-before time, subject, and email.

Derive catalog identities from a SHA-256 digest of normalized email and never
place the email itself in Durable Object names or R2 keys. Store owner and
member email roles in a SQLite-backed `WorkspaceAccess` Durable Object selected
by the workspace storage identity. Every workspace API route, including the
WebSocket upgrade and PDF stream, must resolve both catalog membership and the
access role before reaching document state.

Owners may invite a normalized email. Invitation adds the member role and the
workspace summary to that identity's catalog. Only owners may add members.

Keep an explicit `local` mode for loopback development. It accepts an optional
local-user header solely on loopback hosts and fails closed on deployed hosts.

## Trigger

The third roadmap slice makes multi-workspace collaboration safe to host and
adds explicit authorization for collaborators.

## Consequences

**Positive:**

- Kirjolab does not store passwords, OAuth secrets, or login sessions.
- A misrouted request still needs a valid application JWT at the Worker.
- HTTP, PDF, and WebSocket access share one membership check.
- Loopback development and multi-identity browser tests remain deterministic.

**Negative:**

- Hosted deployments depend on Cloudflare Access configuration and availability.
- Email-based catalog identity needs reconciliation if a person's email changes.
- Revoking a member and transferring ownership require later lifecycle actions.
- JWKS retrieval adds a network dependency on cache miss.

**Neutral:**

- The Access team domain and application audience are deployment configuration,
  not secrets, but must match the protected application.
- Public health and generated browser assets do not contain workspace data and
  remain unauthenticated.

## Alternatives Considered

### Trust Access identity headers without JWT validation

This is simpler but allows spoofing if the Worker is reachable outside the
intended Access route. Cloudflare explicitly recommends validating the token.

### Build password or magic-link authentication in Kirjolab

This offers vendor independence but adds credential, session, recovery, email,
and abuse-sensitive code unrelated to the scholarly workflow.

### Use one shared workspace secret

A bearer secret cannot express owner/member roles, individual revocation, or
identity-aware catalogs and is unsafe to distribute among collaborators.
