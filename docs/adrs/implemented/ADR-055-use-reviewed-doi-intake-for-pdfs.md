# ADR-055: Use Reviewed DOI Intake for PDFs

**Status:** Implemented

**Date:** 2026-07-11

## Context

Kirjolab can import a PDF, import BibTeX, project stable publications, and link
publications to local artifacts. Identifying an imported paper currently
requires those actions to be performed separately, even when the researcher
already knows the paper's DOI.

The shortcut must preserve three existing boundaries. Looking up metadata must
not mutate working memory. Crossref metadata must be reviewed before it becomes
canonical BibTeX. Adding a publication, associating a PDF, and citing the
publication remain distinct actions.

Citation keys add a concurrency concern: a key that was available while a
preview was shown may collide before acceptance. Crossref is also an external,
untrusted service whose response must not be stored or rendered without
mapping and bounds.

## Decision

Kirjolab will offer an **Identify paper** action from an unlinked PDF context.
The first slice accepts a DOI or DOI URL only. It resolves the DOI through
Crossref and returns a bounded, non-mutating preview with an editable,
collision-aware citation-key suggestion.

Accepting **Add to library & connect** will send the DOI, reviewed citation key,
and preview fingerprint to the Worker. The Worker will fetch and map Crossref
metadata again so a browser cannot relabel arbitrary metadata as
Crossref-derived. If the reviewed mapping's fingerprint has changed,
acceptance fails without mutation so the researcher can review the new
metadata. Otherwise, the document room performs one synchronous transaction
that:

- reuses an existing publication with the normalized DOI, when present
- otherwise minimally splices one canonical BibTeX entry into Yjs and projects
  it as a stable publication with Crossref provenance
- creates or reuses the explicit `PublicationPdfLink`
- persists the Yjs materialization, publication projection, and link together

An existing DOI-matched publication keeps its current canonical metadata and
citation key; intake only ensures the explicit artifact association. A new DOI
must use a citation key that remains available at acceptance time, otherwise
acceptance fails without mutation and the researcher can review another key.
Repeating an already completed DOI/PDF intake is an idempotent success.

Acceptance never mutates the PDF and never inserts a manuscript citation.
After success, the publication opens in research context; citation insertion
remains the separate existing action.

## Trigger

ADR-053 and ADR-054 expose unlinked PDFs honestly in research context. The next
vertical slice removes the manual BibTeX-import detour while retaining their
explicit mutation boundaries.

## Consequences

**Positive:**

- A known DOI turns an imported PDF into connected working memory through one
  reviewed action.
- Lookup cancellation and service failures leave all canonical state unchanged.
- DOI reuse and idempotent linking avoid duplicate publications and links.
- Refetch-on-accept preserves honest Crossref provenance without durable preview
  tokens or another table.

**Negative:**

- Acceptance normally performs a second Crossref request after preview.
- DOI-only intake does not help papers without a DOI.
- Citation-key conflicts can require another explicit review under concurrent
  bibliography edits.

**Neutral:**

- Existing BibTeX import and publication enrichment remain available.
- OCR, PDF metadata extraction, title search, Zotero sync, and model-assisted
  identification remain later operations.

## Alternatives Considered

### Trust preview metadata returned by the browser

This avoids a second request, but an authorized browser could alter the payload
while the resulting publication still claimed Crossref provenance. Refetching
keeps the trust boundary simple.

### Persist intake drafts server-side

A durable draft could bind preview and acceptance without refetching, but adds
a resource lifecycle and cleanup policy for a short, reversible interaction.

### Infer the paper from PDF contents or filenames

Inference would cover more files but introduces OCR, extraction, confidence,
and false-match handling before the explicit DOI path has proved the workflow.

### Add the publication and cite it in one action

This is faster in the happy path but conflates working-memory acquisition with
authored manuscript mutation and can insert a citation at an unsafe position.
