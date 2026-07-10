# ADR-044: Model Publications Separately from BibTeX

**Status:** Implemented

**Date:** 2026-07-10

## Context

Kirjolab needs a reference-library surface that can link publications to PDFs,
annotations, and manuscripts. BibTeX citation keys are author-controlled aliases:
they can change, collide across imports, and do not exist for every scholarly
resource. At the same time, replacing BibTeX with a private database would break
the portable-source boundary.

Metadata services can improve incomplete records, but automatic enrichment would
make import non-deterministic and could silently replace intentional metadata.

## Decision

Keep BibTeX as the canonical authored bibliography and materialize each imported
entry as a publication resource with an internal UUID. Merge imports
case-insensitively by citation key, normalize DOI values as external identifiers,
and preserve the stable UUID when a citation key or DOI identifies an existing
resource.

Store publication projections in the document room's SQLite database. Treat the
projection as workspace-scoped supporting state that can link to other resources;
it does not replace the exportable `.bib` artifact.

Offer Crossref DOI enrichment only as an explicit user action. The Worker calls
Crossref's singleton-work endpoint, records `crossref` as the metadata source,
and materializes accepted metadata back into canonical BibTeX. Configure an
optional contact email for Crossref's polite pool; no API secret is required.

## Trigger

The fourth roadmap slice turns the bibliography editor into the beginning of a
durable scholarly reference library.

## Consequences

**Positive:**

- Publications can gain stable links independent of citation-key changes.
- Markdown and BibTeX remain readable and exportable outside Kirjolab.
- Imports are deterministic and offline-capable.
- Enriched records expose their source and require a deliberate action.

**Negative:**

- Canonical BibTeX and the publication projection must remain synchronized.
- The initial parser supports common BibTeX values, not macros or expression
  concatenation.
- Crossref coverage and metadata quality vary by DOI and publication type.

**Neutral:**

- DOI is an external identifier, not Kirjolab's primary key.
- Zotero and CSL JSON interoperability remain future import adapters.

## Alternatives Considered

### Use citation keys as publication identities

This removes a table field but makes identity mutable, import-scoped, and prone
to collision.

### Make CSL JSON the canonical bibliography

CSL JSON is useful interchange data, but changing the authored artifact now
would invalidate the established Markdown-and-BibTeX portability contract.

### Enrich every import automatically

This appears convenient but adds network failure to import and silently changes
authored metadata without a review boundary.

### Integrate Zotero first

Zotero interoperability is valuable, but its API and account model are not
needed to establish stable publications, DOI lookup, and portable bibliography
semantics.
