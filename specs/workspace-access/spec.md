# Feature: Workspace Authentication and Authorization

## Blueprint

### Context

Hosted collaboration must identify each researcher and prevent unauthorized
workspace discovery, API reads, mutations, PDF access, and WebSocket joins.
Owners need a minimal way to grant access to a known collaborator.

### Architecture

- `src/security/auth.ts` supports `local` and `access` authentication modes.
- Access mode validates `Cf-Access-Jwt-Assertion` against the configured team
  JWKS, issuer, audience, time claims, subject, and email.
- Signing keys are cached through the Workers Cache API for one hour.
- Local mode succeeds only for `localhost`, `127.0.0.1`, or `::1`; the optional
  `x-kirjolab-local-user` header enables loopback multi-identity testing.
- `WorkspaceAccess` stores one owner and zero or more members in SQLite. Every
  member receives an opaque stable person id; normalized email remains a unique
  mutable access attribute rather than the hypermedia identity.
- Workspace catalog, access, document-room, and R2 lookups use opaque or hashed
  storage identities rather than plaintext hosted email values.
- `GET /api/session` exposes only the current email and authentication mode.
- `GET /api/workspaces/{id}/members` lists members for authorized users.
- `POST /api/workspaces/{id}/members` lets only the owner invite a valid email.
- Authorized members may inspect project history and comparisons. Only the
  owner may name milestones, restore a retained state, or seed a new project
  from one.
- An exact same-origin `Origin` is required for browser mutations and
  WebSocket upgrades, including authenticated `GET` upgrade requests.
- The document channel accepts bounded binary Yjs updates and one exact,
  versioned selection message from clients. The room replaces its identity with
  the server-assigned socket identity, validates the current file revision and
  range, and never persists it. Other client-authored text/control messages and
  malformed updates close only the offending connection.

### Deployment Configuration

- `AUTH_MODE=access`
- `ACCESS_TEAM_DOMAIN=https://<team>.cloudflareaccess.com`
- `ACCESS_AUD=<application audience tag>`
- The application hostname must be protected by a Cloudflare Access self-hosted
  application and direct unprotected hostnames should be disabled.

### Anti-Patterns

- Do not trust `Cf-Access-Authenticated-User-Email` or an unsigned caller header.
- Do not allow `AUTH_MODE=local` away from a loopback hostname.
- Do not expose workspace existence before catalog and role authorization.
- Do not pass Access tokens into browser JavaScript or logs.
- Do not use plaintext emails as Durable Object or R2 storage keys.
- Do not let members invite additional members in this slice.

## Contract

### Definition of Done

- [x] Local development works without external credentials only on loopback.
- [x] Hosted mode fails closed when Access configuration or JWT is missing.
- [x] Access JWT verification covers signature, issuer, audience, and time.
- [x] Workspace creation initializes an owner role.
- [x] Owners can invite a normalized collaborator email.
- [x] Owner and member records retain stable opaque person identities across
      Durable Object reconstruction.
- [x] Invited collaborators discover and open the shared workspace.
- [x] Uninvited identities cannot discover or read the workspace.
- [x] PDF routes and WebSocket upgrades pass through the same authorization.
- [x] Cross-origin browser mutations are rejected.
- [x] Missing and cross-origin WebSocket origins are rejected before document
      coordination state is reached.
- [x] Client control messages and malformed Yjs updates cannot be rebroadcast
      or persisted; validated selection metadata cannot claim identity or enter
      durable state.

### Regression Guardrails

- Access mode must never accept a token based on decoded claims alone.
- JWT algorithm must remain RS256 and the `kid` must match a fetched RSA key.
- Local mode must reject non-loopback hostnames.
- Membership must be checked before resolving document or R2 state.
- Only the owner role may add a member.
- Hypermedia representations must address people by stored person id rather
  than email.
- Only the owner role may mutate project history or create a revision seed;
  history reads retain normal workspace membership authorization.
- Browser WebSocket upgrades must carry an `Origin` exactly matching the
  request URL origin.
- Document rooms must close only the client that sends unsupported text,
  oversized metadata/update, or malformed Yjs state. Stale valid selection
  metadata must be ignored rather than persisted or rebroadcast.
- Identity tokens and signing material must never be persisted in application
  storage or returned by `/api/session`.

### Scenarios

**Scenario: Hosted researcher authenticates**

- Given: Cloudflare Access injects a valid application assertion
- When: the request reaches Kirjolab
- Then: the Worker verifies its signature and claims and derives the current
  opaque catalog identity

**Scenario: Owner invites a collaborator**

- Given: the current identity owns a workspace
- When: they invite a valid collaborator email
- Then: Kirjolab records a member role and adds the workspace to the
  collaborator's catalog

**Scenario: Uninvited identity follows a workspace URL**

- Given: the identity has no catalog entry or member role
- When: it requests the workspace API
- Then: Kirjolab returns no workspace representation and touches no document or
  PDF state
