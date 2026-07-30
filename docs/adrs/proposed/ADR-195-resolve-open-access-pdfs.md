# ADR-195: Resolve Open-Access PDFs Explicitly

**Status:** Proposed

**Date:** 2026-07-30

## Context

Citation expansion can add bibliographic references to the private Library, but
obtaining each corresponding PDF remains a manual search-and-upload task. A DOI
can lead to an open repository copy, a publisher copy behind authentication, a
landing page, or no full text at all. A URL labeled as full text is not itself
permission to redistribute or even evidence that an anonymous request can read
it.

The existing PDF upload contract already bounds files at 25 MiB, stores them in
owner-private R2, requires explicit sharing rights, and queues server-side PDF
analysis. External acquisition should converge on that contract rather than
create a second artifact model.

[OpenAlex work records](https://developers.openalex.org/api-reference/works/get-a-single-work)
expose a best open-access location with PDF URL, license, and manuscript
version. [Unpaywall's DOI endpoint](https://unpaywall.org/api) provides an
independent OA location source and requires an identifying email. OpenAlex
states that cached PDFs retain their original copyright and that OpenAlex grants
no additional rights; its content API also charges per file. Crossref warns
that deposited full-text links may require a subscription, login, or a separate
text-mining license and do not guarantee access.

## Decision

Kirjolab will add a user-triggered **Find open PDF** workflow for DOI-backed
Library references in two separately reviewable phases.

The discovery phase will query fixed scholarly metadata providers on the
server. It will prefer OpenAlex's `best_oa_location` and may fall back to
Unpaywall when an identifying email is configured. It will return a bounded
preview containing provider, landing page, exact PDF location, license,
manuscript version, and a fingerprint. Discovery will not download or store a
file.

The import phase will accept only the provider and reviewed fingerprint, then
refetch the provider record and exact location. The browser will never submit
an arbitrary download URL. The server will:

- require HTTPS and reject credentials, IP literals, local names, and
  non-public redirect targets;
- revalidate every redirect and send no owner cookies, browser credentials, or
  publisher authentication;
- read at most 25 MiB plus one byte and require both a PDF response type and
  `%PDF-` file signature;
- retain final URL, provider record identity, observed license, manuscript
  version, retrieval time, and content fingerprint as artifact provenance;
- always store the imported artifact as owner-private initially; and
- register it through the existing atomic PDF draft path so highlight and
  reference analysis queue automatically.

Automatic import will be offered only when the provider marks the location open
access and supplies a direct PDF URL. An absent or unrecognized license will be
shown explicitly and will keep sharing rights unknown. Kirjolab will not scrape
landing pages, bypass authentication, use institutional cookies, import from
shadow libraries, or treat Crossref text-mining links as ordinary downloadable
PDFs.

OpenAlex's paid cached-content endpoint is deferred. It may later become an
explicit configured source, but only after cost controls and the same
license-review contract are implemented.

## Trigger

Reference extraction, bulk expansion acceptance, and the citation research
queue now make discovering many useful works inexpensive. Manual PDF retrieval
has become the next repeated step in that workflow.

## Consequences

**Positive:**

- A reviewed open repository copy can enter the Library without a manual
  download and re-upload round trip.
- Existing PDF storage, rights, analysis, deduplication, and reader behavior
  remain authoritative.
- Fingerprint verification prevents the browser from turning the feature into
  an arbitrary server-side fetch proxy.
- License and manuscript-version uncertainty stay visible instead of being
  inferred from successful download.

**Negative:**

- Arbitrary repository URLs and redirects add a security-sensitive egress
  surface that requires dedicated SSRF and response-bound tests.
- OA metadata can be stale, incomplete, or point to HTML despite claiming a PDF.
- Unpaywall requires configured contact information, and OpenAlex cached
  content can incur per-file cost.
- A private import does not grant permission to share the PDF with project
  collaborators.

**Neutral:**

- References without a DOI continue to use manual upload.
- Authenticated publisher access remains a browser/manual workflow.
- The first implementation may discover no safe candidate even when a human
  can locate a copy.

## Alternatives Considered

### Follow the DOI landing page and scrape links

Publisher pages vary, execute scripts, expose authentication flows, and can
present consent or anti-bot challenges. Supporting them would require a remote
browser and broaden both security and maintenance substantially.

### Download any Crossref `link` marked as PDF

Crossref documents these primarily for text and data mining and explicitly
notes that access and licensing can require publisher-specific credentials.
The metadata is useful as a later reviewed source, not a safe default import.

### Trust a PDF URL supplied by the browser

This would create an owner-authenticated arbitrary fetch endpoint and permit
internal-network probes, redirect abuse, and imports unrelated to the reviewed
reference.

### Import every PDF found during citation expansion

This would spend bandwidth and storage without researcher review, amplify
provider errors, and mix bibliographic discovery with a materially different
rights-bearing artifact mutation.

### Use only OpenAlex cached content

The fixed host reduces egress risk, but downloads are paid and OpenAlex grants
no additional rights to cached documents. It is a useful optional adapter, not
the default permission model.
