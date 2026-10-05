# Feature: Open-Access PDF Acquisition

## Blueprint

### Context

DOI-backed references can point to openly available repository manuscripts,
but manually downloading and re-uploading each file interrupts citation-trail
research. Provider metadata is untrusted external input and successful access
does not itself grant sharing rights.

### Architecture

- A Library reference with a DOI and no attached PDF offers **Find PDF**. The
  workflow is explicit and never runs during citation expansion or reference
  import.
- Discovery runs on the authenticated owner API. It prefers OpenAlex when an
  API key is configured and otherwise may use Unpaywall with the configured
  scholarly contact email. Only a provider-declared open-access location with
  a direct PDF URL becomes a review candidate.
- The review shows provider, exact PDF location, provider landing page,
  observed license, and manuscript version. Missing license or version is
  stated rather than inferred.
- Discovery downloads no file. It returns a SHA-256 fingerprint over the
  normalized provider identity and location fields.
- Import accepts only the provider name and reviewed fingerprint. The server
  refetches that fixed provider record and rejects changed fingerprints; the
  browser cannot submit an arbitrary download URL.
- Every download target and redirect must use HTTPS, contain no credentials,
  and use a public-looking DNS hostname rather than an IP literal, localhost,
  or a local/internal suffix. Requests use manual redirect handling and no
  browser credentials, owner cookies, or publisher authentication.
- A response must be successful `application/pdf`, start with `%PDF-`, and fit
  within 25 MiB. Declared and streamed sizes are both bounded.
- Failed HTTP downloads identify the final host and HTTP status; a Cloudflare
  challenge response explicitly reports that the host requires browser
  verification. Connection failures identify the host without exposing raw
  network errors, URL query strings, or upstream response bodies. These upstream
  failures return HTTP 502 and store or attach no artifact.
- After an import failure, the dialog retains the reviewed provider evidence,
  PDF link, and landing-page link. It explains how to download through the
  researcher's browser and offers **Attach PDF** directly in the same dialog.
  The selected local file uploads through the shared bounded PDF ingestion path
  and attaches atomically to the reviewed reference without creating another
  Library draft. An OA metadata flag does not guarantee that a host allows
  anonymous server downloads.
- Manual attachments use `POST /api/library/references/{id}/pdfs`, scoped to
  the authenticated owner's live reference. They retain the existing 25 MiB
  upload limit, exact content-length validation, shared content fingerprinting,
  private rights, and all three PDF analysis jobs. Re-uploading identical bytes
  to that reference reuses the attachment; bytes belonging to another Library
  reference produce a conflict. Local uploads do not inherit the candidate's
  provider provenance or license.
- Attachment selection accepts one PDF, reports upload progress, and prevents
  overlapping imports or uploads. The dialog cannot close while a request is
  pending. Upload errors retain the review and attachment control, and the same
  file can be selected again. Successful attachment closes the dialog and
  refreshes the Library through the existing acquisition completion event.
- The R2 object's custom metadata retains provider, provider record identity,
  final URL, observed license, manuscript version, retrieval time, and SHA-256
  content fingerprint. The Library artifact uses that fingerprint for
  deduplication.
- The durable Library atomically attaches a new artifact to the selected live
  reference. A repeated fingerprint on that reference reuses the existing
  artifact; a fingerprint owned by another reference is a reviewable conflict.
- Imported files are owner-only and begin with sharing rights `unknown` even
  when a provider reports a license. Researchers must explicitly change rights
  before project sharing.
- Successful import queues both PDF highlight detection and PDF reference
  extraction through the existing artifact-analysis queue.
- Landing-page scraping, authenticated publisher sessions, institutional
  cookies, shadow libraries, Crossref TDM links, and paid OpenAlex cached files
  remain out of scope.

### Quality Guardrails

- Provider mapping and discovery fingerprinting have bounded integration
  tests.
- Download tests cover HTTPS enforcement, credentials, IP/local-host rejection,
  redirect revalidation, PDF media type/signature, and streamed size bounds.
- API tests prove metadata refetch, stale-fingerprint rejection, private R2
  storage, atomic attachment, provenance, and both analysis jobs.
- UI tests keep the provider review and explicit import as separate actions.
- Regression tests cover challenged and refused downloads, connection failures,
  no storage or analysis on download failure, and retained manual recovery links.
- Manual recovery tests cover attachment to the selected owner reference,
  missing-reference rejection, local file validation, duplicate-submit guards,
  retry after upload failure, and browser file selection without a duplicate draft.

## History

- 2026-07-30: Implemented ADR-195 with OpenAlex-first/Unpaywall fallback
  discovery, fingerprint-verified import, provenance-bearing private storage,
  and Library review controls.
- 2026-10-05: Diagnosed ACM's challenged download for DOI `10.1145/3604801`;
  report upstream host/status and browser-verification failures explicitly and
  retain the reviewed links for manual recovery.
- 2026-10-05: Added direct manual PDF attachment in the failed-download dialog,
  using shared upload ingestion and the existing atomic reference attachment.
