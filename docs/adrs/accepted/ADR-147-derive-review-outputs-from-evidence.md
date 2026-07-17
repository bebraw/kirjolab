# ADR-147: Derive Review Outputs from Evidence

**Status:** Accepted

**Date:** 2026-07-17

## Context

Review-management tools commonly end by exporting a DOCX report or a flat data
file. Researchers then copy protocol text, flow counts, extraction tables,
charts, and findings into a separate manuscript. Those copies drift when the
review changes and lose the path from a reported result back to the search run,
screening decision, extracted value, and source passage that produced it.

Kirjolab already keeps Markdown canonical under ADR-035, connects evidence to
claims, preserves atomic project revisions under ADR-061, and derives
publication targets through one source-mapped intermediate under ADR-062. A
review study should extend those boundaries instead of introducing a second
report generator or making DOCX the durable handoff format.

Review analysis also has two different purposes. Process analysis explains how
the corpus was identified and selected. Evidence synthesis answers the research
questions. Counts by source and year are useful diagnostics, but they are not a
substitute for extraction-aware, quality-sensitive synthesis.

## Decision

Derive every review table, figure, reporting section, disclosure, and export
from one exact `ReviewStudy` revision and a versioned analysis or report
definition. Review output never recomputes search counts, inclusion state, or
extraction scope independently of that structured revision.

Review-derived artifacts join the existing project export intermediate. A
manuscript may reference a named artifact through bounded scientific-Markdown
syntax, while authored interpretation and prose remain canonical Markdown.
Preview and publication resolve the same artifact definition against the review
revision pinned by the project state. Later review activity does not silently
change a named milestone or previously materialized publication export.

Process-analysis artifacts may include:

- identification, deduplication, staged screening, appraisal, and inclusion
  counts;
- source yield, exclusion reasons, reviewer conflicts, agreement, update-search
  deltas, and missing-data diagnostics; and
- PRISMA flow data and diagrams, with incomplete periods and overlapping source
  occurrences represented honestly.

Evidence-synthesis artifacts may include:

- typed extraction matrices grouped by research question;
- study characteristics, cross-tabs, missingness, and appraisal dimensions;
- sensitivity views that apply an explicitly named quality or evidence filter;
- formal-versus-grey comparisons for MLRs; and
- evidence-linked qualitative codes, categories, themes, contradictions, and
  findings.

Each underlying extracted value, appraisal judgment, qualitative code, and
synthesis finding retains its source selectors and reviewer provenance. A chart
or table exposes the definition, filters, review revision, and contributing
records needed to inspect it. Model-proposed analysis, coding, or prose remains
a reviewable candidate under ADR-039 and never becomes a derived fact merely
because it was generated.

Kirjolab will export a review reproducibility package from the same pinned
boundary. Its versioned manifest may materialize:

- lossless structured review data as JSON;
- rectangular and long-form extraction data as CSV;
- included and excluded bibliographic records as CSL JSON or BibTeX;
- exact search histories, source queries, import provenance, screening logs,
  appraisal data, and analysis definitions;
- PRISMA counts plus diagrams in data and portable visual formats;
- protocol, methods, and model-assistance disclosures as Markdown; and
- schema, generator, review-revision, digest, and generation metadata.

CSV is an analysis interchange format, not the canonical review authority.
DOCX may be added as an optional publication target when a submission workflow
requires it, but it does not own protocol, extraction, analysis, or manuscript
state. Specialized statistical analysis, including meta-analysis, may consume
the reproducibility package and return reviewed artifacts; the initial native
scope prioritizes descriptive, qualitative, and mixed-evidence synthesis tied
to Kirjolab sources.

## Trigger

The Parsifal walkthrough showed useful protocol and conducting data ending in a
selectable DOCX report, with separate CSV-like extraction and basic charts.
Because Kirjolab already owns the manuscript, bibliography, evidence selectors,
project history, and export pipeline, copying those outputs through an office
document would discard its strongest architectural advantage.

## Consequences

**Positive:**

- Review changes, manuscript tables, flow diagrams, and exported data cannot
  drift through manual copying or independent calculations.
- Readers and collaborators can navigate reported findings back to exact
  extraction values and source passages.
- Process reporting and evidence synthesis remain distinct while sharing one
  reproducible revision boundary.
- CSV, JSON, bibliography, Markdown, and visual outputs support external tools
  without making any interchange format canonical.
- Model usage can be disclosed from retained execution and validation
  provenance rather than reconstructed at submission time.

**Negative:**

- The export intermediate must grow a versioned review-artifact vocabulary and
  preserve source mappings through tables, figures, and report sections.
- Repeatable extraction fields, qualitative coding, and analysis definitions
  require both lossless and rectangular export representations.
- Pinning review revisions in project history increases snapshot coordination
  and storage pressure.
- Direct integration makes incomplete or inconsistent review data visible to
  manuscript generation and therefore needs clear blocking diagnostics.

**Neutral:**

- Authored prose remains Markdown; derived evidence tables and figures do not
  become editable duplicate sources.
- External R, Python, spreadsheet, or specialist review tools remain valid
  consumers and producers at explicit import and export boundaries.
- Exact directive syntax, artifact schemas, diagram styling, and statistical
  capabilities belong in the review-studies and export feature specifications.

## Alternatives Considered

### Export a DOCX report for manual manuscript integration

This matches established review tools and is convenient for Word-centric
workflows, but it creates a mutable duplicate with no durable connection to the
review revision or source evidence. DOCX remains a possible final target, not
the integration architecture.

### Make CSV the canonical review dataset

CSV is portable for rectangular extraction data but cannot losslessly represent
protocol versions, repeated fields, source selectors, reviewer conflicts,
search occurrences, or analysis definitions.

### Copy generated tables and prose into Markdown

This produces immediately editable content but severs automatic provenance and
allows copied values to drift. Named derived artifacts keep calculations
reproducible while authors retain control of interpretation in ordinary prose.

### Add a separate analytics and report service

A separate service could offer richer charts quickly, but it would duplicate
authorization, revision selection, filters, export logic, and provenance. It
may later consume the same pinned package without becoming Kirjolab's review
authority.
