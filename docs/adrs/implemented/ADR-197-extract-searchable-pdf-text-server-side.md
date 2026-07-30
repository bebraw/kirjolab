# ADR-197: Extract Searchable PDF Text Server-Side

**Status:** Implemented

**Date:** 2026-07-30

## Context

Native PDF text is sufficient for most born-digital papers, but scanned pages
have no usable text layer. Client-only search therefore cannot find their
content, and each analysis capability would otherwise need its own OCR path.
The existing artifact-analysis queue already owns fingerprint-qualified,
retriable PDF processing in a managed browser.

## Decision

Add `pdf-text` as a third artifact-analysis kind. The managed browser extracts
bounded native text page by page and rasterizes only pages with no meaningful
text layer. The queue consumer sends those bounded page images through the
Workers AI Markdown Conversion binding with plain-text output, then persists a
normalized page-text result tagged as `native` or `ocr`.

At most 200 pages are represented and at most 40 pages are sent for OCR in one
analysis. Results remain fingerprint-qualified and private to the owning
Reference Library. PDF search uses the server artifact when the client detects
that the document has no native searchable text.

## Consequences

- Search and later reference/highlight analysis can consume one normalized
  page-text contract.
- Ordinary digital PDFs avoid OCR inference.
- Scanned-PDF search depends on the Workers AI binding and is asynchronous.
- The bounded page and OCR limits make partial results explicit through the
  `truncated` field.

## Alternatives considered

### Run OCR in every client

Rejected because it increases download size, drains tablet resources, and
duplicates work for every browser.

### Add an external OCR HTTP service

Rejected because the Cloudflare binding avoids another secret and network
boundary while fitting the existing queued processing model.
