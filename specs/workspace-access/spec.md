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
- The authenticated shell exposes the current identity from a compact user icon
  labelled **Account**. Hosted Access identities receive a native link to the application-domain
  `/cdn-cgi/access/logout` endpoint, which ends the user's shared Cloudflare
  Access session. Local mode states that no login session exists and does not
  render a non-functional logout action.
- Read-only and editable external links use a compact file selector on phone
  viewports. Desktop keeps persistent file navigation, while the editable phone
  view avoids making a long project tree precede the active editor.
- `GET /api/workspaces/{id}/members` lists members for authorized users.
- `POST /api/workspaces/{id}/members` lets only the owner invite a valid email.
- `POST /api/workspaces/{id}/share-link` lets only the owner create or rotate
  one read-only bearer link; `DELETE` revokes it and `GET` returns the active
  link to the owner with `Cache-Control: no-store`.
- `POST /api/workspaces/{id}/edit-link` lets only the owner create or rotate
  one edit bearer link; `DELETE` revokes it and `GET` returns the active link
  to the owner with `Cache-Control: no-store`.
- Each project uses an opaque public share locator. Globally unique workspace
  ids remain their own locators for link compatibility, while owner-scoped
  starter projects receive a persisted random UUID mapped to their internal
  storage key. The mapping is returned only after bearer-token validation.
- A valid `/share/{workspace-id}.{secret}` request bypasses identity login only
  for a server-rendered live project viewer. Its navigator exposes the current
  rendered PDF output by default, composed Markdown, and individual authored
  project files. It includes no member identities, private research, project
  APIs, stored PDFs, other exports, history, comments, or collaboration channel.
- `GET /share/{workspace-id}.{secret}/document.pdf` revalidates the same bearer
  secret before reading the mapped document and renders the canonical bounded
  PDF on demand with inline, no-store, same-origin-only response headers.
- The public viewer keeps its same-origin frame CSP but omits cross-origin
  embedder isolation so browser-native PDF viewers can load the share-scoped
  document. Authenticated authoring pages remain cross-origin isolated.
- `GET /share/{workspace-id}.{secret}/socket` requires an exact same-origin
  WebSocket upgrade and revalidates the bearer secret before joining the mapped
  document room as a reader. Reader sockets receive revision/reset notices
  only, reject every inbound frame, and are excluded from writer presence.
- The small read-only share client reloads the selected server-rendered view
  after a short quiet period when a newer revision notice arrives. It does not
  load or reuse the authenticated authoring client.
- Share-link secrets contain 256 random bits. Their active plaintext value is
  persisted only so an authenticated owner can retrieve the same URL later;
  validation still uses the stored SHA-256 hash. Rotating a link invalidates
  its predecessor, and link/status responses use `Cache-Control: no-store` and
  `Referrer-Policy: no-referrer` where applicable.
- A valid `/edit/{locator}.{secret}` page exposes authored Markdown files and
  the canonical PDF only. Each file replacement revalidates the capability,
  requires an exact same-origin `Origin`, enforces the 2 MB content bound, and
  rejects a stale expected revision instead of overwriting concurrent work.
- `GET /edit/{locator}.{secret}/socket` revalidates the edit capability and
  exact same-origin `Origin` before joining writer presence. The socket receives
  and sends current-revision caret/selection controls but never receives Yjs
  state and closes if it sends a binary document update. Rotation or revocation
  immediately disconnects every socket using the prior edit capability.
- Authorized members may inspect project history and comparisons. Only the
  owner may name milestones, restore a retained state, or seed a new project
  from one.
- Project settings expose owner-only rename, archive/restore, current-revision
  duplication, and permanent deletion. Lifecycle changes are mirrored into
  every member catalog.
- Permanent deletion first unregisters shared-library dependencies and removes
  project-owned R2 objects and revokes both public capabilities, then erases
  document, access, and catalog state.
  It never deletes canonical private-library references.
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
  application and direct unprotected hostnames should be disabled. The
  `/share/*` and `/edit/*` paths need deliberate Access bypass policies so
  bearer-link holders can reach the Worker's independent token checks.

### Anti-Patterns

- Do not trust `Cf-Access-Authenticated-User-Email` or an unsigned caller header.
- Do not allow `AUTH_MODE=local` away from a loopback hostname.
- Do not expose workspace existence before catalog and role authorization.
- Do not pass Access tokens into browser JavaScript or logs.
- Do not create an application-owned logout endpoint, expose a hosted logout in
  local mode, or imply that Cloudflare Access logout is scoped only to Kirjolab.
- Do not use plaintext emails as Durable Object or R2 storage keys.
- Do not let members invite additional members in this slice.
- Do not return plaintext share-link secrets to members, unauthenticated status
  callers, cacheable responses, logs, or general workspace APIs.

## Contract

### Definition of Done

- [x] Local development works without external credentials only on loopback.
- [x] Hosted mode fails closed when Access configuration or JWT is missing.
- [x] Access JWT verification covers signature, issuer, audience, and time.
- [x] Workspace creation initializes an owner role.
- [x] Owners can invite a normalized collaborator email.
- [x] Owners can create, rotate, and revoke a read-only bearer link.
- [x] Owners can return to the Share control and copy the same active read-only
      or edit link without rotating it.
- [x] An edit-link holder can update authored Markdown without gaining member,
      private-research, administration, or general API access.
- [x] Edit-link and member editors exchange live caret and selection presence
      without exposing Yjs state or retaining access after link invalidation.
- [x] Owner-scoped starter projects can be shared without exposing an owner
      storage key or colliding with another owner's starter project.
- [x] A read-only link exposes only the current rendered PDF, composed Markdown,
      and individual authored project files through clear output/file navigation.
- [x] An open read-only view refreshes after live project edits without a manual
      reload or access to mutable collaboration state.
- [x] Owner and member records retain stable opaque person identities across
      Durable Object reconstruction.
- [x] Invited collaborators discover and open the shared workspace.
- [x] Owners can rename, archive, restore, duplicate, and permanently delete a
      non-demo project through explicit project settings.
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
- Only the owner may mutate project lifecycle; the demo project cannot be
  archived or permanently deleted.
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
- Read-only link lookup must validate a fixed-shape random secret against its
  stored hash before touching document state; invalid and revoked links return
  the same not-found response.
- Only an authenticated owner may retrieve an active read-only or edit URL.
  Status responses must be non-cacheable and must not expose a separate token
  field.
- Edit-link reads and writes must independently validate the current bearer
  token. Writes require an exact same-origin `Origin`, bounded content, and the
  current project revision.
- Permanent project deletion must revoke both locator-scoped capabilities before
  erasing the document room.
- Public share locators must not expose owner-derived storage keys, and target
  mappings must not be returned before bearer-token validation succeeds.
- Every shared PDF request must independently validate the current bearer token
  before reading document state or rendering output; rotation and revocation
  invalidate both the viewer and PDF URL.
- Shared WebSocket upgrades must independently validate the bearer token and
  exact same-origin `Origin` before touching document state. Reader sockets must
  receive only validated revision/reset control messages and close with a policy
  violation if they send text or binary data.
- Link rotation and revocation must actively disconnect established reader
  sockets so they cannot observe later project activity.
- Read-only link pages must not load the authenticated application client or
  expose a workspace API, writable collaboration channel, private research, or
  mutation control.

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

**Scenario: Reviewer follows a read-only link**

- Given: the owner has created a current read-only link
- When: a reviewer follows it without a Kirjolab identity
- Then: Kirjolab opens the current rendered PDF and lets the reviewer navigate
  to composed Markdown or individual project files with no editing,
  collaboration, general export, member, or private-research capability

**Scenario: Writer changes an open read-only project**

- Given: a reviewer has an open current read-only link
- When: a writer persists a newer project revision
- Then: the reviewer receives only its revision notice and the selected
  server-rendered output refreshes after the edit settles

**Scenario: Owner rotates or revokes a read-only link**

- Given: a read-only link has been shared
- When: the owner replaces or revokes it
- Then: the prior URL immediately returns the same not-found response as an
  unknown link

**Scenario: Owner returns to copy an active link**

- Given: the owner previously created a read-only or edit link
- When: they reopen the Share control later
- Then: Kirjolab returns the same active URL without rotating or revoking it

**Scenario: External writer follows an edit link**

- Given: the owner created a current edit link
- When: its holder saves an authored Markdown file at the current revision
- Then: Kirjolab updates the live project and rendered output without exposing
  project membership, administration, private research, or general APIs

**Scenario: External and member writers exchange caret presence**

- Given: a member and a valid edit-link holder have the same project revision
  open
- When: either writer moves their caret or selects authored Markdown
- Then: the other editor shows that ephemeral colored presence until the
  selection changes, its revision becomes stale, or the socket disconnects
