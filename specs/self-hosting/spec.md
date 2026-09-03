# Feature: Self-Hosted Evaluation

## Blueprint

### Context

Kirjolab's production deployment remains hosted on Cloudflare, but evaluation
must not require a Cloudflare account. The first self-hosted surface gives one
local researcher a persistent Docker Compose instance while establishing the
SQLite boundary needed by a later native runtime.

This feature is an evaluation profile, not a production or multiplayer
deployment. Its purpose is to make Kirjolab easy to try and to keep the next
portability work attached to explicit contracts.

### Architecture

- `docker compose up --build` starts one repository-pinned local Worker runtime
  and publishes Kirjolab only at `http://127.0.0.1:8787`.
- The image pins Node.js 24.20.0, installs from `package-lock.json`, builds the
  browser assets during image construction, and runs Wrangler directly as the
  non-root `node` user behind Compose's init process.
- The profile uses `AUTH_MODE=local`. It must remain loopback-only because the
  local identity and optional test identity header are not a public trust
  boundary.
- A named Docker volume owns the runtime's local Durable Object and R2 state.
  Ordinary stop/start and image recreation preserve that volume; deleting the
  volume explicitly resets the evaluation instance.
- The self-host Wrangler profile contains no remote bindings and does not
  require Cloudflare credentials. Cloudflare Browser Rendering, Workers AI,
  Queue-backed artifact analysis, hosted Cron, Access, PITR, and production
  backup guarantees are outside this profile.
- GitHub is disabled in the default Compose profile because its complete App,
  OAuth, and encryption configuration is absent. The server derives a typed
  `{ github: false }` deployment capability and projects only that boolean into
  HTML bootstrap data; no GitHub identifier, credential, or missing-field
  detail crosses that boundary.
- When GitHub is unavailable, its server-rendered and browser-owned controls are
  absent or inert, browser startup emits no GitHub requests, and direct GitHub
  API calls return an explicit `503`. Existing GitHub connection and project
  synchronization data remain untouched if an instance is restarted without
  the integration configured.
- The self-host profile tracks the hosted Durable Object binding and migration
  declarations through an automated tooling contract while omitting inherited
  cloud deployment configuration.
- The compatibility host remains workerd/Miniflare. Its files are runtime-local
  implementation details and are not a Kirjolab backup or interchange format.
- Provider-neutral SQLite contracts live outside Durable Object modules.
  Cloudflare Durable Object storage and Node `node:sqlite` are adapters to that
  contract. The contract owns statements, typed queries, and synchronous atomic
  transactions only.
- Portable SQLite values are `ArrayBuffer | string | number | null`. The Node
  adapter copies driver-owned binary views into exact `ArrayBuffer` values,
  enforces one-row cursor cardinality, supports binding-free multi-statement
  migration batches, and rejects nested or asynchronous transactions.
- Database paths, connection lifecycle, foreign-key policy, authority-to-file
  mapping, and per-authority request serialization remain composition-root
  responsibilities rather than database-contract behavior.
- Durable Object facades retain RPC, authorization, coordination, and
  multi-resource transaction ownership. Portable blobs, jobs, schedulers,
  identity, HTTP/WebSocket hosting, and multi-replica coordination require
  separate future boundaries.

### Anti-Patterns

- Do not expose the evaluation profile on `0.0.0.0`, a LAN address, or a public
  hostname while it uses local authentication.
- Do not describe Compose or its named volume as production-ready, highly
  available, multiplayer-supported, or a backup strategy.
- Do not connect the self-host profile to remote Cloudflare bindings.
- Do not pass host environment files, `.dev.vars`, credentials, or bind mounts
  into the evaluation service.
- Do not render an unavailable integration as actionable, use a browser request
  to discover deployment capability, or treat hidden UI as the API boundary.
- Do not delete retained integration state merely because optional deployment
  configuration is absent.
- Do not leak Cloudflare storage, namespace, or RPC types into the portable
  SQLite contract.
- Do not grow the SQLite adapter into a generic platform service locator.
- Do not copy Miniflare or Durable Object SQLite files as the future migration
  mechanism; use a versioned logical export/import contract.

## Contract

### Definition of Done

- [x] A clean checkout starts through `docker compose up --build` without local
      Node.js, npm, or Cloudflare credentials.
- [x] The published port is bound to host loopback and `GET /api/health`
      succeeds from the host.
- [x] The local instance can create and read ordinary Kirjolab workspace state.
- [x] Stopping and recreating the application container without deleting its
      named volume preserves that state.
- [x] The evaluation configuration has no remote bindings and cloud-only
      artifact analysis fails explicitly rather than silently using Cloudflare.
- [x] GitHub is unavailable by default: its UI emits no requests, direct API
      calls fail explicitly with `503`, and retained state is not deleted.
- [x] One provider-neutral SQLite migration suite passes against both a test
      adapter and Node `node:sqlite`.
- [x] Existing Cloudflare Worker and Durable Object tests remain green.
- [x] README and development documentation state the support boundary, startup,
      persistence, reset, upgrade, and troubleshooting commands.

### Regression Guardrails

- The hosted Wrangler configuration and production release path remain
  unchanged.
- Local authentication continues to reject non-loopback request hosts.
- The self-host Compose service remains one replica and binds only
  `127.0.0.1` on the host.
- Self-host startup must not require a Cloudflare account, token, or remote
  resource identifier.
- Optional-integration availability comes only from complete server
  configuration. The browser receives booleans, and a false capability cannot
  initiate background or user-triggered integration requests.
- A disabled integration's API remains independently unavailable and its
  retained connection, binding, synchronization, and project data remain
  unchanged.
- SQLite adapters must preserve append-only migration validation, atomic
  migration-plus-ledger writes, and rollback after a failed migration.
- Row-producing SQL cannot silently ignore a following statement, and bound
  multi-statement batches remain unsupported until both adapters define them.
- The Worker dependency graph must not import or evaluate the Node adapter.
- The provider-neutral SQLite module must not import `cloudflare:workers` or
  `node:sqlite`; those imports belong to adapter modules.

### Scenarios

**First start**

- Given Docker and Docker Compose are available
- When an evaluator runs `docker compose up --build`
- Then Kirjolab becomes healthy at `http://127.0.0.1:8787` without Cloudflare
  credentials

**Persistent restart**

- Given the evaluator has created local Kirjolab state
- When the Compose service is stopped and recreated without deleting volumes
- Then the same state remains available

**Explicit reset**

- Given the evaluator wants a fresh instance
- When they intentionally remove the documented named volume
- Then the next start creates empty local Durable Object and R2 state

**No accidental public auth boundary**

- Given the evaluation profile uses local authentication
- When Compose publishes the application port
- Then it binds only the host loopback interface

**GitHub disabled by default**

- Given the Compose profile has no complete GitHub App configuration
- When Kirjolab renders and starts its browser application
- Then GitHub controls are unavailable, no GitHub request is emitted, direct
  GitHub API calls return `503`, and any retained GitHub data is unchanged

**Failed SQLite migration**

- Given a migration changes data and then throws
- When either SQLite adapter runs that migration
- Then both the data change and migration-ledger entry are rolled back
