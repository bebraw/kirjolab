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

## History

- 2026-07-30: Implemented ADR-195 with OpenAlex-first/Unpaywall fallback
  discovery, fingerprint-verified import, provenance-bearing private storage,
  and Library review controls.
