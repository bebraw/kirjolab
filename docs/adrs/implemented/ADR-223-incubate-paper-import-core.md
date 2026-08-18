# ADR-223: Incubate a Reviewed Paper-Import Core

**Status:** Implemented

**Date:** 2026-08-17

## Context

Kirjolab's bounded LaTeX importer already performs archive validation,
conservative conversion, and reviewed project creation. Slideotter is a named
prospective consumer of the same import mechanics, but it needs a paper model
and exact source provenance rather than Kirjolab project seeds, publication
profiles, browser state, or cloud persistence.

The existing confirmation digest covers only ZIP bytes. It does not identify
the selected root, bibliography, converter behavior, schema, or extracted-file
manifest, so a confirmation can submit a different interpretation of the same
archive than the researcher reviewed. Converter diagnostics also calculate
some offsets after slicing and rewriting source, which makes those offsets
unsafe for downstream citation and figure review.

ADR-186 requires a maintained independent consumer and explicit release
ownership before package publication. Slideotter establishes a concrete reuse
case, but not yet a maintained adapter or release boundary.

## Decision

Incubate a versioned, source-local paper-import core under
`src/lib/paper-import/`. The core exposes product-neutral LaTeX conversion and
bounded PDF page-text contracts. Kirjolab adapters remain responsible for
`ProjectTemplateSeed`, publication profiles, UI, authorization, Durable
Objects, R2, queues, OCR, and browser lifecycle.

Every retained source range is defined against the original decoded archive
file in UTF-16 code units. A consumer must be able to recover the reported
source with `originalText.slice(start, end)`. When conversion cannot reconstruct
an original range safely, it omits the range instead of returning an offset
into transformed text.

LaTeX previews expose two SHA-256 identities: the original archive identity and
the exact reviewed-preview identity. The preview digest canonically covers the
identity schema, archive hash, effective root and bibliography, converter
version, conversion options, and a deterministic extracted-file manifest. The
Worker repeats inspection and conversion and compares both identities before
any project, catalog, access, document-room, or asset write.

The PDF seam accepts bytes through an injected PDF.js document adapter and
returns bounded, page-oriented native text with stable diagnostics and a
content hash. URL loading, canvases, OCR, browser automation, persistence, and
cloud jobs remain outside the core. Hard byte, page, and returned-text ceilings
limit the neutral result; the consumer-owned adapter still provides parser
isolation plus execution-time and memory controls for untrusted PDFs.

Archive inspection and neutral conversion also enforce non-loosenable retained-
record ceilings. Consumer-supplied limits may tighten those bounds, and invalid
limit values or exhausted record budgets fail through stable typed codes before
unbounded inventories are retained. Fixed archive-path, image-resolution,
table, TikZ, rendered-output, and derived-folder work ceilings additionally
bound malformed-input scans, candidate probing, and conversion amplification.

Keep a versioned, deterministic conformance corpus beside the core so another
consumer can exercise archive, conversion, provenance, and PDF-text behavior
without importing Kirjolab application authorities. Do not create a workspace
package or publish a registry artifact until ADR-186's remaining gates are met
by a real Slideotter adapter.

## Trigger

Slideotter's reviewed LaTeX-plus-PDF presentation workflow supplied the first
concrete external-adopter requirements and exposed the archive-only preview
identity and transformed-offset integrity gaps.

## Consequences

**Positive:**

- Kirjolab and a future Slideotter adapter can share one bounded conversion and
  provenance contract.
- Confirmation is bound to exactly what was reviewed rather than merely to the
  uploaded container bytes.
- Figure, diagnostic, and semantic source references can be verified directly
  against original decoded files.
- PDF text extraction can run locally without Kirjolab's OCR or cloud pipeline.

**Negative:**

- The source-local API and corpus add versioned contracts that must evolve
  deliberately even before package publication.
- Exact provenance requires extra hashing and original-source bookkeeping on
  each preview and confirmation.
- Product adapters must explicitly map neutral results into their own project
  or presentation models.

**Neutral:**

- The production bounded converter retained by ADR-184 remains authoritative;
  this decision separates its contract and adapters rather than replacing its
  parser.
- LaTeX remains inert and one-way, and PDF remains a complementary rendered
  representation rather than a second semantic authority.

## Alternatives Considered

### Publish an npm package immediately

Rejected because a prospective adopter does not yet satisfy ADR-186's
maintained-consumer, ownership, compatibility, tarball, and release-provenance
requirements. A source-local boundary proves the contract first.

### Let Slideotter copy Kirjolab's importer

Rejected because duplicated trust-boundary code would diverge on archive
limits, diagnostics, provenance, and preview identity.

### Include OCR and cloud persistence in the shared core

Rejected because they are product and deployment policy. Native byte-oriented
text extraction is the smallest useful PDF boundary for local consumers.
