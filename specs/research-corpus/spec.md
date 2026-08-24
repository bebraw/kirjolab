# Feature: Research Corpus Service

## Blueprint

### Context

Research sources and their extracted representations should be reusable across
Kirjolab, future writing frontends, and authenticated agent clients. A source's
identity, original bytes, provenance, rights, and extraction state must not be
recreated by each consumer.

### Architecture

- Research Corpus is an independently deployable Worker entry point with a
  protocol-neutral application service beneath its transports.
- The first increment uses the existing owner-scoped Reference Library Durable
  Object, R2 bucket, and artifact-analysis Queue. Those adapters remain the
  only storage and job authorities during migration.
- Corpus catalog adapters use bounded page and single-record Durable Object
  RPCs. Catalog pages use a field-bounded display DTO and a 16 MiB serialized
  payload budget in addition to the 100-item limit. Pagination and artifact
  lookup execute beside owner-scoped SQLite; a complete private Library
  snapshot never crosses the service binding.
- Corpus responses expose stable artifact and reference ids, safe display
  metadata, immutable fingerprints, rights, timestamps, representation links,
  and extraction state. They never expose an owner key, R2 object key, Durable
  Object locator, Queue payload, or credential.
- Authority page and item results are runtime-validated down to each bounded
  artifact entry, reference relationship, and aggregate serialized size.
  Public source provenance and extraction status are rebuilt through explicit
  field allowlists so later internal fields cannot become API fields by
  structural assignment or object spread.
- Kirjolab retains manuscript, collaboration, project, citation-alias, claim,
  review, and UI workflow ownership. Its existing `/api/library` routes remain
  compatible during the migration.
- The HTTP API is versioned under `/v1`. MCP is mounted at `/mcp` and projects
  the same application contracts.
- Both transports resolve the authenticated identity before selecting the
  owner-scoped Library authority. Hosted requests use Cloudflare Access; local
  requests remain restricted to loopback hosts.
- Private hosted MCP clients authenticate through Access Managed OAuth. Access
  performs the authorization-code flow and supplies the same user assertion to
  the Worker, which requires a verified email and non-empty subject before
  deriving owner scope. Service tokens are unsupported because no service
  identity-to-owner mapping is defined.
- Browser mutations require either the service origin or an exact origin from
  `CORPUS_ALLOWED_ORIGINS`. An MCP request without `Origin` is treated as a
  non-browser client only after authentication; any present origin must pass
  the same validation.
- Responses to validated browser origins retain CORS credentials and origin
  headers even when an unexpected failure is reduced to the generic Worker 500
  response.
- Access bypasses `OPTIONS` requests to the Worker so it can validate the route
  and exact origin and answer preflight without selecting owner state. Every
  non-preflight request remains Access-authenticated. Conditional and range
  request headers are allowed, and protected representation metadata is
  explicitly exposed to configured browser origins.
- Original PDF bytes are available only through the protected HTTP
  representation route. The route preserves ETag, conditional, `HEAD`, and
  single-range behavior and uses a private non-cacheable response policy.
- New PDFs enter through a bounded raw-body HTTP upload. The service requires
  `application/pdf`, an exact positive `Content-Length` no greater than 25 MB,
  and accepts a sanitized `X-File-Name`. Kirjolab's compatibility upload calls
  the same R2, draft-creation, and extraction-queue operation.
- MCP never embeds original binary bytes. It can return a protected HTTP link
  to the original representation.
- Extraction kinds are the existing independent `pdf-text`, `pdf-highlights`,
  and `pdf-references` jobs. The owner-scoped storage authority atomically
  reserves Queue publication and a durable outbox row so concurrent ordinary
  requests publish one job generation. An immediate Queue-send failure leaves
  the generation queued for alarm recovery. Upgrade reconciliation adds any
  queued generation created before the outbox existed to that recovery path
  exactly once. An explicit retry after analysis failure creates a new
  generation.
- Cross-script RPC evolution is additive across the provider-first deployment:
  the primary Worker exposes a new method before corpus calls it, and keeps the
  previous method and response shape valid while deployed versions may overlap.
- Starting extraction returns a fingerprint-qualified asynchronous job. Ready
  extracted data is bounded by the existing validated result contracts.
- Failed extraction status exposes a stable public failure message; persisted
  infrastructure exceptions remain private operational detail.
- The initial semantic reading surface exposes individual PDF text pages, not
  an unbounded whole-document concatenation.

### HTTP Contract

- `GET /v1/artifacts` lists the authenticated owner's safe PDF artifact
  summaries with a maximum of 100 results and an optional opaque `after`
  artifact id.
- `POST /v1/artifacts` accepts one raw PDF body and returns the created safe
  artifact document with `201`, or the existing fingerprint-matched draft with
  `200`.
- `GET /v1/artifacts/{artifactId}` returns one safe artifact summary.
- `GET|HEAD /v1/artifacts/{artifactId}/representations/original` streams the
  exact protected PDF representation.
- `GET /v1/artifacts/{artifactId}/extractions/{kind}` returns the current job or
  `404` when it has never been requested.
- `POST /v1/artifacts/{artifactId}/extractions/{kind}` queues or returns the
  current job and responds with `202` while work is incomplete.
- `GET /v1/artifacts/{artifactId}/extractions/pdf-text/pages/{page}` returns one
  ready extracted page and its artifact fingerprint. It returns `409` while
  extraction is incomplete and `404` for an absent page or job.

### MCP Contract

- `list_corpus_artifacts` returns the same bounded safe summaries as HTTP.
- `get_corpus_artifact` returns one safe summary and its protected original
  representation URL.
- `get_extraction_status` returns one current extraction job.
- `start_extraction` explicitly requests one supported extraction kind and
  returns its asynchronous job.
- `read_pdf_text_page` returns one ready page with source and artifact
  fingerprint; it never concatenates the document.
- Tool names and input schemas are stable compatibility surfaces. MCP content
  mirrors the structured result and remains JSON-serializable.
- Expected resource and tool failures use stable owner-safe messages.
- Malformed MCP resource-template variables return protocol `InvalidParams`
  with a stable validation message and do not invoke the application service.
  Unexpected failures are logged server-side and reduced to generic MCP error
  messages before crossing either callback boundary.

## Acceptance Scenarios

### Safe artifact discovery

Given an authenticated owner with private PDFs, when HTTP or MCP lists or reads
an artifact, then the response includes safe artifact metadata and contains no
storage or owner locator.

### Protected byte streaming

Given an artifact owned by the authenticated owner, when its original
representation is requested with a valid byte range, then the exact bytes and
range metadata are returned. Another owner's artifact is not discoverable.

### Shared PDF intake

Given an authenticated client with a PDF no larger than 25 MB, when it posts
the exact-length body to `/v1/artifacts`, then the service stores one
owner-scoped object, creates or reuses one draft, queues the three independent
extractions, and returns no storage locator. Kirjolab's compatibility upload
uses that same operation rather than a second write implementation.

### Asynchronous extraction

Given an existing PDF, when a client starts `pdf-text` extraction, then the
existing versioned job is queued once and a fingerprint-qualified status is
returned without waiting for processing.

Given concurrent clients starting the same extraction generation, exactly one
authority response grants Queue publication and every caller observes the same
persisted request identity.

Given the requesting Worker stops after the authority commits a queued
generation but before Queue acceptance is confirmed, the owner Durable Object
alarm publishes the persisted outbox job without requiring another request.
After a Queue failure it keeps the outbox row and schedules another alarm; after
confirmed acceptance it removes only the matching fingerprint and request.

Given an owner has a queued extraction persisted by the pre-outbox workflow,
when the Reference Library first applies the reconciliation migration, then it
creates one matching owner-scoped outbox job and arms the Durable Object alarm
without requiring another extraction request.

Given the primary Worker has been upgraded while the prior corpus Worker is
still serving traffic, its legacy catalog-page and queue-state RPC calls retain
their original response shapes. After corpus is upgraded, it calls the new
bounded catalog and publication-reservation RPC names.

### Bounded semantic reading

Given ready PDF text, when an agent reads one page, then it receives only that
validated page, source, page counts, and fingerprint. Original PDF bytes and
unrequested pages are absent.

Given an MCP text-page resource URI, its `{page}` variable contains only ASCII
decimal digits and resolves to an integer from 1 through 200. Signed, exponent,
hexadecimal, fractional, and otherwise non-decimal spellings fail with MCP
InvalidParams without invoking the corpus application service.

### Origin enforcement

Given an authenticated browser request from an unconfigured origin, when it
mutates HTTP state or calls MCP, then the service rejects it before performing
work. Given an unauthenticated preflight from a configured origin, the Worker
answers it without selecting owner state; an unconfigured origin is rejected.
An authenticated non-browser MCP client without `Origin` remains usable.

### Private MCP authentication

Given a compatible MCP client and a user allowed by the corpus Access policy,
when the client connects to `/mcp`, then Access Managed OAuth opens the user
login flow and the Worker derives the same email-scoped owner as a browser
session. An Access service identity without a user email is rejected rather
than selecting or inventing owner state.

### Compatibility migration

Given an existing Kirjolab client, when the corpus service is deployed, then
the current Library routes and underlying records continue to behave without a
copy or dual write.

## Quality Guardrails

- Pure service tests cover safe projection, owner lookup, PDF intake,
  pagination, extraction lifecycle, explicit projection allowlists, missing
  artifacts, and page bounds.
- HTTP tests cover methods, status codes, no-store policies, range delegation,
  bounded PDF upload, preflight authentication bypass, conditional and range
  headers, exposed representation metadata, and origin rejection.
- MCP tests exercise protocol initialization and every exposed tool through the
  stateless handler, including strict decimal resource-page variables and
  sanitized resource and tool failures.
- Configuration validation proves the corpus Worker binds to the existing
  Reference Library namespace rather than creating a second namespace and
  rejects a corpus hostname that would replace either the canonical primary
  application hostname or an allowed frontend origin, including terminal-dot
  spellings of the same DNS name.
- A corpus-specific generated binding artifact is checked by the fast quality
  gate and again before either dry-run-only or uploading production deploys.
  The Worker composition and its R2 and Queue adapter ports derive their types
  from that artifact, while the external Durable Object RPC surface is narrowed
  explicitly because Wrangler cannot generate another Worker's class methods.
- Workers-runtime intake tests use Cloudflare's real `FixedLengthStream` and
  prove an exact declared PDF length reaches storage and Library draft creation,
  while rejecting shorter or longer bodies before creating Library state.
- Authentication tests require the Access assertion's user email and subject;
  production operations verify Managed OAuth with a real compatible client.
- Workers-runtime tests prove individual lookup and cursor pagination execute
  through the bounded Reference Library RPC contract, including valid
  multibyte records that cross the aggregate byte budget and continue without
  loss or duplication.
- Workers-runtime tests reconstruct a pre-outbox queued generation and prove
  the append-only upgrade migration restores its owner-qualified publication
  row and alarm.

## Current Milestone

- Implemented: independently deployable corpus boundary, shared PDF intake,
  versioned HTTP contract, and stateless MCP projection over the existing
  storage and extraction authorities.
- Deferred: web-document intake and representations, semantic search,
  reusable annotations, delegated OAuth, physical namespace ownership transfer,
  and retirement of Kirjolab's compatibility routes.
