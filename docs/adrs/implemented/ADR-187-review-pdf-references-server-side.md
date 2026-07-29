# ADR-187: Review PDF References Server-Side

**Status:** Implemented

**Date:** 2026-07-29

## Context

Background PDF analysis already preserves bounded bibliography candidates, and
the owner Library already models source-to-source citations as provenance-bearing
assertions. Rendering parsed entries alone does not let a researcher turn them
into reusable references or remember that an unusable entry was dismissed.

Candidate metadata displayed in the browser cannot be authoritative. It may be
modified, may belong to an earlier PDF fingerprint, or may suggest the wrong
existing source. A rejected import also does not mean that the PDF explicitly
claims it does not cite a work.

## Decision

Keep PDF-reference review inside the owner-scoped `ReferenceLibrary` Durable
Object. The browser submits the artifact fingerprint, persisted candidate ID,
decision, and optionally an existing reference UUID. The Durable Object reloads
the ready analysis, verifies the current artifact fingerprint and candidate,
and performs each decision in one SQLite transaction.

Only normalized exact DOI identity is reused automatically. A unique normalized
title, year, and first-author match may be shown as a suggestion, but requires
an explicit existing-reference choice. Otherwise acceptance creates a reference
whose populated fields carry `pdf-reference` provenance, then records an
`extracted`, `source-extraction`, `pdf-artifact` citation assertion from the
PDF's linked reference. Rejections are stored in a dedicated review table and
create no citation assertion.

The review is qualified by the analysis fingerprint. Reanalysis may preserve
historical rows, but stale dispositions do not project onto new analysis output.

## Trigger

Parsed references became visible in the PDF inspector, making the missing path
from source bibliography to the existing citation network apparent.

## Consequences

**Positive:**

- Client-modified or stale extraction data cannot become canonical metadata.
- Reference creation and citation provenance cannot partially diverge.
- Exact DOI reuse avoids duplicates without presenting similarity as identity.
- Rejections remain review history without corrupting scholarly evidence.

**Negative:**

- The owner Library gains another persisted review table and atomic workflow.
- Bibliographic matches without DOI still need researcher judgment.
- Reanalysis requires review against the new fingerprint even when text appears
  unchanged.

**Neutral:**

- Citation-network storage and projection remain unchanged; accepted entries use
  the existing assertion model.
- No external dependency or graph database is introduced.

## Alternatives Considered

### Trust candidate metadata posted by the browser

Rejected because stale or modified fields could create canonical references
without correspondence to the preserved analysis result.

### Automatically merge normalized title matches

Rejected because title, author, and year similarity can suggest identity but
cannot safely establish it.

### Record rejection as a negative citation assertion

Rejected because declining an extracted candidate is an import-review decision,
not evidence that the source explicitly does not cite the work.
