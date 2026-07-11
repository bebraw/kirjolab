# ADR-060: Capture Versioned Web Sources

**Status:** Proposed

**Date:** 2026-07-11

## Context

Scholarly work cites web pages as well as conventional publications. A URL alone
does not preserve what the researcher saw: pages change, disappear, redirect,
or render different content over time. Citation styles also commonly require an
access date, but one mutable `accessed` value cannot explain which version
supported a particular project revision.

The shared library in ADR-058 needs a source model that can preserve web
evidence without treating each fetch as a new unrelated reference. Project
milestones also need to reproduce the version used at the time of writing.

## Decision

Web sources will be first-class shared-library resources with stable internal
identity, canonical URL, title, responsible author or organization when
available, publication or update date when available, and an exact access
timestamp.

Capturing or citing a web source will create an immutable, timestamped content
snapshot. Kirjolab will retain the bounded fetched representation and an
extracted readable representation when available, together with retrieval
metadata and diagnostics when a complete capture is impossible.

Re-accessing a source creates another snapshot under the same source identity
rather than overwriting earlier content or access provenance. Projects and
milestones pin the exact snapshot used by citations and evidence links. The
library will support comparison between snapshots without treating change as
proof that either version is incorrect.

Snapshots remain private library material under ADR-059 unless explicitly
shared. Bibliographic exports include the access metadata required by the
selected citation style; archival project bundles include pinned content only
when authorization and export scope permit it.

## Trigger

The UI review expanded reference intake to web sources and required citations
to track when changing online material was accessed.

## Consequences

**Positive:**

- Researchers can inspect the evidence that was actually available when a web
  citation was created.
- Later page changes do not invalidate reproducible project milestones.
- Multiple captures support transparent change comparison and access-date
  citation rules.

**Negative:**

- Snapshot storage can grow quickly and needs strict fetch, size, media, and
  retention bounds.
- Dynamic, authenticated, paywalled, or script-dependent pages may be incomplete
  or impossible to preserve faithfully.
- Stored web content introduces copyright, privacy, malware, and sanitization
  obligations beyond storing URLs.

**Neutral:**

- A snapshot records what Kirjolab retrieved, not a claim that the content was
  authoritative or complete.
- External archive links may complement but do not replace private captured
  evidence.

## Alternatives Considered

### Store only the URL and latest access date

This is lightweight but cannot reproduce changing content or explain evidence
used by an older milestone.

### Overwrite the stored page on every access

This saves space but destroys historical provenance and makes prior citations
silently point to new content.

### Depend entirely on an external web archive

External archives are useful but have uneven coverage, their own availability
and access policies, and may not contain the version the researcher used.

### Save screenshots only

Screenshots preserve appearance but lose searchable text, links, accessibility
structure, and reliable comparison.
