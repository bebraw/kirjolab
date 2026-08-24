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
- Corpus responses expose stable artifact and reference ids, safe display
  metadata, immutable fingerprints, rights, timestamps, representation links,
  and extraction state. They never expose an owner key, R2 object key, Durable
  Object locator, Queue payload, or credential.
- Kirjolab retains manuscript, collaboration, project, citation-alias, claim,
  review, and UI workflow ownership. Its existing `/api/library` routes remain
  compatible during the migration.
- The HTTP API is versioned under `/v1`. MCP is mounted at `/mcp` and projects
  the same application contracts.
- Both transports resolve the authenticated identity before selecting the
  owner-scoped Library authority. Hosted requests use Cloudflare Access; local
  requests remain restricted to loopback hosts.
- Browser mutations require either the service origin or an exact origin from
  `CORPUS_ALLOWED_ORIGINS`. An MCP request without `Origin` is treated as a
  non-browser client only after authentication; any present origin must pass
  the same validation.
- Original PDF bytes are available only through the protected HTTP
  representation route. The route preserves ETag, conditional, `HEAD`, and
  single-range behavior and uses a private non-cacheable response policy.
- MCP never embeds original binary bytes. It can return a protected HTTP link
  to the original representation.
- Extraction kinds are the existing independent `pdf-text`, `pdf-highlights`,
  and `pdf-references` jobs. Requests are idempotent unless an explicit retry is
  made after failure.
- Starting extraction returns a fingerprint-qualified asynchronous job. Ready
  extracted data is bounded by the existing validated result contracts.
- The initial semantic reading surface exposes individual PDF text pages, not
  an unbounded whole-document concatenation.

### HTTP Contract

- `GET /v1/artifacts` lists the authenticated owner's safe PDF artifact
  summaries with a maximum of 100 results and an optional opaque `after`
  artifact id.
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

## Acceptance Scenarios

### Safe artifact discovery

Given an authenticated owner with private PDFs, when HTTP or MCP lists or reads
an artifact, then the response includes safe artifact metadata and contains no
storage or owner locator.

### Protected byte streaming

Given an artifact owned by the authenticated owner, when its original
representation is requested with a valid byte range, then the exact bytes and
range metadata are returned. Another owner's artifact is not discoverable.

### Asynchronous extraction

Given an existing PDF, when a client starts `pdf-text` extraction, then the
existing versioned job is queued once and a fingerprint-qualified status is
returned without waiting for processing.

### Bounded semantic reading

Given ready PDF text, when an agent reads one page, then it receives only that
validated page, source, page counts, and fingerprint. Original PDF bytes and
unrequested pages are absent.

### Origin enforcement

Given an authenticated browser request from an unconfigured origin, when it
mutates HTTP state or calls MCP, then the service rejects it before performing
work. An authenticated non-browser MCP client without `Origin` remains usable.

### Compatibility migration

Given an existing Kirjolab client, when the corpus service is deployed, then
the current Library routes and underlying records continue to behave without a
copy or dual write.

## Quality Guardrails

- Pure service tests cover safe projection, owner lookup, pagination,
  extraction lifecycle, missing artifacts, and page bounds.
- HTTP tests cover methods, status codes, no-store policies, range delegation,
  and origin rejection.
- MCP tests exercise protocol initialization and every exposed tool through the
  stateless handler.
- Configuration validation proves the corpus Worker binds to the existing
  Reference Library namespace rather than creating a second namespace.

## Current Milestone

- Accepted: independently deployable corpus boundary, versioned HTTP contract,
  and stateless MCP projection over the existing storage and extraction
  authorities.
- Deferred: source intake, web-document representations, semantic search,
  reusable annotations, delegated OAuth, physical namespace ownership transfer,
  and retirement of Kirjolab's compatibility routes.
