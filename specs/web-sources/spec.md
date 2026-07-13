# Feature: Versioned Web Sources

## Blueprint

### Context

A URL does not preserve the page a researcher inspected. Web pages redirect,
change, disappear, and may expose only a partial representation to a bounded
server-side fetch. Citations and later project milestones need the exact access
event and captured content that supported the paper at that time.

### Architecture

- A web source is one stable owner-library reference plus a normalized public
  HTTP(S) canonical URL. Re-access appends an immutable snapshot under that
  identity; it never overwrites an earlier access event.
- The stateless Worker retrieves a page with no caller credentials, validates
  every redirect, and buffers at most 2 MiB of raw response bytes. It extracts
  at most 1 MiB of inert UTF-8 readable text and writes both representations to
  owner-scoped R2 keys.
- The owner-keyed `ReferenceLibrary` Durable Object stores source identity,
  exact access timestamp, requested/final URLs, HTTP and retrieval metadata,
  content hash, extracted citation fields, object keys, completeness, and
  diagnostics. It retains at most 512 captures per source.
- Raw and readable object keys are private library material. Raw content is
  served only as `application/octet-stream` attachment; readable content is
  served only as `text/plain` attachment. Neither representation enters the
  application DOM as fetched markup.
- A project reference pins one exact web snapshot in its bibliographic
  snapshot. Ordinary library refresh cannot move that pin. Explicit repinning
  creates a project revision and changes the derived `urldate`.
- Snapshot comparison is a neutral plain-text line comparison. It reports
  additions and removals without assigning truth, correctness, or authority to
  either capture.

### Fetch and Security Boundary

- Capture accepts only public `http:` and `https:` URLs without embedded
  credentials. Loopback, local/private hostnames, private/reserved IP literals,
  and non-standard ports fail before the first subrequest.
- Redirect mode is manual. Every destination is normalized and revalidated;
  at most five redirects and 15 seconds are allowed. No cookies,
  authorization, or user-controlled headers are forwarded.
- Oversized responses retain only their bounded prefix and are marked
  incomplete. Unsupported media, non-success status, network failure, sparse
  readable extraction, and truncation remain explicit diagnostics.
- A failed, unsupported, or titleless retrieval still becomes a refinable
  snapshot. Its normalized final URL is the explicit placeholder title, and a
  diagnostic distinguishes that locator from extracted bibliographic metadata.
- A new web source has a provisional reference key. Recapture or later reviewed
  metadata may improve it while the source remains private-only; its first
  project link permanently finalizes it.

### API Contracts

- `POST /api/library/web-sources` accepts one bounded public URL. Bibliographic
  metadata is extracted when available and refined later on the Library record.
- `GET /api/library/references/{referenceId}/web-snapshots` lists that source's
  immutable capture metadata.
- `GET /api/library/web-snapshots/{snapshotId}` returns one owner-private
  metadata record. Its `/raw` and `/readable` routes return inert attachments.
- `GET /api/library/web-snapshots/{before}/compare/{after}` compares two
  captures only when they belong to the same stable source.
- `POST /api/workspaces/{id}/references/{referenceId}/web-snapshot` explicitly
  repins a project reference to a selected capture.
- `POST /api/workspaces/{id}/research-shares` accepts `web-snapshot` as an
  explicit private-research share. Authorized collaborators may fetch only an
  active share through its project content route.

### Bibliography and History

- A web-backed project link exports its canonical URL and the pinned access
  date as `urldate`. The exact timestamp and content hash remain in project
  provenance even when a style renders only the calendar date.
- Later captures update the private library's current metadata but do not move
  existing project pins. ADR-061 milestones retain the project pin already in
  that revision.
- ADR-062 archival export may include pinned content only for an authorized
  scope; ordinary source export includes locators and access provenance, not
  private captured bytes.

### Anti-Patterns

- Do not store only the latest access date or overwrite captured content.
- Do not follow redirects automatically or forward browser credentials.
- Do not render captured HTML, trust its scripts, or infer completeness from a
  successful HTTP status alone.
- Do not make citation creation implicitly share raw/readable content.
- Do not auto-update a project from one web snapshot to another.
- Do not turn source collection into a second metadata-editing surface.

### Validation

- Pure tests cover URL safety, metadata/readable extraction, HTML removal, and
  neutral text comparison.
- API tests cover URL-only intake, owner routing, private-destination rejection,
  refinable bounded failures, and non-cacheable responses.
- Real-`workerd` tests cover append-only capture rows, stable source identity,
  explicit web sharing, project pin preservation, repinning, migration, and
  derived access-date bibliography.

## Current Milestone

- Implemented: private URL capture, immutable bounded R2 representations,
  diagnostics, repeated versions, owner downloads, comparison, explicit share,
  project pin/repin, and access-date BibTeX derivation.
- Deferred to ADR-061/062: milestone browsing and authorized archival bundles
  containing pinned capture bytes.
