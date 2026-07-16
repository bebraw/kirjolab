# ADR-140: Derive Phrasing Guidance from Licensed Papers

**Status:** Accepted

**Date:** 2026-07-16

## Context

Kirjolab should help researchers express common scholarly moves such as
qualifying a claim, contrasting findings, introducing evidence, and stating a
limitation. A fixed phrasebank would make those moves accessible to writers and
to weaker local models.

[The University of Manchester Academic Phrasebank][phrasebank] demonstrates the
value of curating recurrent language from academic papers, but it identifies
the Phrasebank as University intellectual property and does not publish a
licence that permits redistribution in software. Individual conventional
phrases may be too short or commonplace to carry copyright independently, but
copying the curated selection, categories, or a substantial part of the
collection would create avoidable copyright and database-right risk.
Attribution alone would not supply the missing permission.

Scientific publishers and repositories also expose papers under explicit open
licences. [PLOS permits its article corpus][plos-tdm] to be mined, reused, and
shared, and the [PubMed Central Open Access Subset][pmc-oa] exposes
machine-readable licence metadata and designated bulk-retrieval services.
These sources allow Kirjolab to derive its own resource without depending on
Manchester's collection.

Kirjolab already treats model writing as typed contextual operations. Model
output is bounded, shown for review, and applied only through an explicit,
revision-validated action. Phrasing assistance should preserve that boundary
rather than becoming a direct insertion tool or a generic chat surface.

## Decision

Build phrasing assistance from two complementary inputs:

1. Independently derive a small, versioned inventory of conventional academic
   patterns from papers whose machine-readable licences permit the intended
   mining, adaptation, and redistribution. The initial source allowlist is CC0
   and CC BY material retrieved through publishers' or repositories'
   designated bulk interfaces. Unknown, custom, non-commercial,
   no-derivatives, and share-alike licences are excluded until their obligations
   are deliberately evaluated.
2. Use the local model to adapt a rhetorical purpose and any applicable vetted
   patterns to the researcher's selected passage. Return several contextual
   alternatives through a typed writing-assistant operation; never mutate the
   manuscript without the existing candidate review and stale-revision checks.

The corpus process must establish independent provenance:

- Do not ingest Academic Phrasebank pages, downloads, categories, or examples
  into extraction, prompts, fixtures, evaluations, or generated assets.
- Retain source identity, article licence, retrieval route, and extraction
  version in an auditable provenance and attribution record.
- Prefer short patterns that recur across independent authors, publications,
  and venues. Reject quotations, titles, named concepts, distinctive language,
  and fragments dependent on source-specific content.
- Replace content-bearing positions with typed slots where that produces a
  genuinely reusable pattern, and organize accepted patterns under an
  independently authored rhetorical taxonomy.
- Treat automated frequency as evidence of conventionality, not as automatic
  approval. A reviewed generation step owns the distributable inventory.
- Re-run licence, provenance, recurrence, and source-similarity checks whenever
  the inventory is regenerated.

CC BY sources remain attributable even when many articles contribute to one
derived inventory. Kirjolab will ship the required licence notices and a
machine-readable source ledger rather than presenting the inventory as
unencumbered project-authored text. CC0-only builds may omit attribution only
where the applicable source terms permit it.

The model operation may work from the rhetorical purpose alone when no vetted
pattern applies. It must not search, scrape, retrieve, or reconstruct Academic
Phrasebank content at runtime. Kirjolab may link to the official site as an
external educational resource without implying affiliation or permission to
redistribute it.

## Trigger

Evaluation of Academic Phrasebank exposed a useful product capability but no
redistribution licence. The observation that its examples were originally
identified in academic papers made an independently sourced, licence-filtered
corpus a credible alternative to either copying the resource or relying
entirely on unconstrained model generation.

## Consequences

**Positive:**

- Kirjolab gains auditable phrasing guidance without depending on permission to
  redistribute Academic Phrasebank.
- Corpus evidence gives small local models reliable scholarly patterns while
  contextual generation avoids rigid sentence-starter insertion.
- The allowlist and provenance ledger make corpus updates reviewable and
  removable by source or licence.
- Suggestions retain the existing human-review, provenance, and concurrency
  boundaries for model-authored manuscript changes.

**Negative:**

- Corpus acquisition, licence filtering, attribution, linguistic review, and
  regeneration checks create an ongoing maintenance obligation.
- An initial PLOS or biomedical open-access corpus may bias the inventory toward
  scientific and health-research conventions.
- Recurrence and short length reduce copyright risk but do not create a legal
  safe harbour; ambiguous patterns or licences still require exclusion or
  rights review.
- Local models may ignore a supplied pattern or produce overly generic prose,
  so output quality remains model-dependent.

**Neutral:**

- The generated inventory is a separately provenance-tracked content artifact,
  not source code covered only by Kirjolab's software licence.
- Detailed extraction thresholds, artifact shape, attribution presentation,
  and operation controls belong in the phrasing-helper feature specification.

## Alternatives Considered

### Reproduce Academic Phrasebank with attribution

The site encourages writers to use suitable phrases in their manuscripts, but
that is not a licence to redistribute the curated resource in an application.
This option remains available only if the University of Manchester grants
written permission covering Kirjolab's intended use.

### Use only unconstrained local-model generation

This avoids a maintained corpus and remains the fallback when no pattern
applies. It was not selected alone because weaker local models benefit from
compact, reviewed guidance and can otherwise produce inconsistent or
needlessly ornate academic prose.

### Mine each researcher's imported papers at runtime

Project-local mining could provide discipline-specific language without a
shared inventory. It makes reuse rights depend on each user's source material,
complicates reproducibility, and risks presenting source-specific expression.
It may be added later as an explicit user-directed analysis feature, but it is
not the provenance basis for Kirjolab's distributed guidance.

### Adopt another public online phrasebank

Public access does not imply permission to copy, adapt, or redistribute. A
third-party phrasebank is eligible only when its owner publishes compatible
licence terms or grants Kirjolab a suitable written licence; it does not replace
the source-level provenance rules in this decision.

[phrasebank]: https://www.phrasebank.manchester.ac.uk/
[plos-tdm]: https://plos.org/text-and-data-mining/
[pmc-oa]: https://pmc.ncbi.nlm.nih.gov/tools/openftlist/
