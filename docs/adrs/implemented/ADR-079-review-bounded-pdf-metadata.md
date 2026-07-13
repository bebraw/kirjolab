# ADR-079: Review Bounded PDF Metadata Before Enrichment

**Status:** Implemented

**Date:** 2026-07-13

## Context

Direct PDF upload now creates a visible library draft immediately, but its only
initial metadata is a title derived from the filename. Researchers must retype
metadata even when the PDF embeds a title, author, creation year, or DOI in its
document information or opening pages.

PDF metadata is inconsistent and untrusted. Embedded fields may describe a
scanner, preprint tool, or downloaded filename rather than the publication, and
text extraction can find unrelated DOI values in references. Automatic
acceptance would improve the happy path by weakening the library's explicit
field-provenance and review boundaries.

Kirjolab already ships PDF.js in the browser for selectable evidence reading.
Adding a second parser in the Worker would increase bundle and runtime cost,
while sending every private PDF to a third party would violate the owner-private
library boundary.

## Decision

Kirjolab will extract PDF metadata on demand in the authorized browser with the
existing PDF.js dependency. Extraction reads the document-information fields
and text from at most the first three pages, with explicit text and candidate
bounds. It may suggest title, authors, year, and DOI, but suggestions remain
ephemeral and never mutate the library automatically.

The Library card will expose an inline **Review PDF metadata** action for linked
artifacts. It will show current and suggested values, allow each field to be
selected independently, and apply only the selected values. The owner-private
API verifies that the artifact belongs to the target reference before applying
the bounded partial update. Accepted fields receive `pdf-metadata` provenance;
untouched fields retain both their value and provenance.

The immutable author-facing reference key and PDF bytes do not change when
metadata improves. A detected DOI may feed a separate reviewed Crossref step,
but provider lookup and acceptance remain distinct from local PDF extraction.

## Consequences

**Positive:**

- Common PDF metadata can be reviewed without retyping it.
- Private artifacts stay inside the existing authorized browser and library routes.
- Per-field acceptance preserves provenance for values the researcher declines or leaves unchanged.
- The implementation reuses PDF.js and adds no dependency or Worker parser.

**Negative:**

- Extraction depends on the browser and must download the private PDF again when requested later.
- Image-only scans and PDFs with poor text encodings may yield no suggestions.
- A DOI found near the beginning of a paper can still be the wrong DOI, so researcher review remains necessary.

**Neutral:**

- OCR, title-search providers, and automatic Crossref enrichment remain separate reviewable operations.
- Existing manual metadata editing and filename-derived drafts remain valid.

## Alternatives Considered

### Parse every PDF in the Worker during upload

This could persist suggestions immediately, but adds parsing cost to the intake
critical path and requires another PDF runtime despite PDF.js already existing
in the browser.

### Accept embedded metadata automatically

This removes the review step but silently promotes unreliable publisher and
tool metadata into canonical bibliographic fields.

### Send PDFs to an external metadata service

External services may improve identification, especially for scans, but would
transmit private research material and require a separate consent, provider,
and retention contract.
