# ADR-146: Coordinate Project Review Studies

**Status:** Implemented

**Date:** 2026-07-17

## Context

Kirjolab already connects research questions, stable library sources, PDFs,
annotations, claims, project history, collaboration, and portable manuscripts.
A systematic or multivocal literature review adds a protocol-driven process
across those resources: query design, source-specific searches, imports,
deduplication, staged screening, quality appraisal, data extraction, synthesis,
and reporting.

These records cannot live only in Markdown. A review may contain thousands of
search-result occurrences, independent reviewer decisions, conflicts, typed
extraction values, and amendments whose earlier state must remain auditable.
They also cannot belong to the owner-private reference library. Reviewers need
shared study state, while ADR-059 deliberately prevents project membership
from granting access to private library material.

[PRISMA 2020][prisma] and its [PRISMA-S search extension][prisma-s] primarily
guide review reporting rather than defining one universal review method.
Software-engineering SLRs and MLRs share a broad lifecycle, but
[MLR guidance][mlr-guidance] requires different source, search, appraisal, and
synthesis rules. The architecture therefore needs a stable common model without
treating PICOC, PRISMA, or one discipline's checklist as universal.

## Decision

Introduce a stable, project-associated `ReviewStudy` authority for
collaborative review state. It has its own versioned structured data and
monotonic review revision; it is not an owner-library projection, a hidden
project, or a collection of generated Markdown files.

A review study uses a method profile over one shared lifecycle:

1. Planning records objectives, stable research questions, an optional question
   framework such as PICOC, concept groups and terms, eligibility criteria,
   appraisal instruments, extraction schemas, and defined search sources.
2. Query calibration retains a structured logical strategy, known-relevant
   validation records, versioned revisions, and reviewable source-specific
   renderings or overrides.
3. Conducting records immutable search runs and import batches, reconciles
   occurrences into deduplicated review records, and retains staged screening,
   adjudication, appraisal, and extraction activity.
4. Synthesis records versioned analysis definitions and evidence-linked
   findings organized around the research questions.

The protocol may be iterated during calibration and then explicitly frozen.
Later changes are amendments with authorship, time, and rationale. An amendment
never rewrites the protocol, query, criteria, schema, or decisions used by an
earlier search or review event. The feature specification will define which
amendments require affected records to be reassessed.

Search provenance distinguishes three identities:

- an imported occurrence belongs to one exact source, query, search run, and
  import batch;
- a review record is the deduplicated scholarly work or grey-literature item
  screened by the team; and
- an owner-library source is an optional reusable private record connected only
  through an explicit action.

Deduplication may associate several occurrences with one review record but
never deletes occurrence provenance or changes per-source identification
counts. Imported files retain their format, digest, parse diagnostics, reported
result count, and normalized records. DOI and provider identifiers may establish
strong candidates; metadata similarity remains a reviewed suggestion.

Screening decisions are append-only, stage-qualified judgments by identified
reviewers. Title-and-abstract screening, full-text screening, conflict
resolution, and final inclusion remain distinct. Criteria have stable ids,
defined applicability, and protocol versions. Quality appraisal and data
extraction reuse typed field infrastructure but remain semantically separate
from eligibility and bibliographic metadata.

Appraisal judgments and extracted values may link to exact PDF or captured-web
selectors. Models may propose duplicate matches, screening decisions,
appraisals, extracted values, codes, or synthesis candidates only through
ADR-039's provenance-aware review boundary. Human decisions remain authoritative,
and any registered automation or stopping rule must be explicit and reportable.

SLR and MLR profiles configure the common model rather than fork it. An MLR
profile adds grey-literature source classes, search and stopping rules,
credibility instruments, and formal-versus-grey synthesis dimensions. Other
question frameworks and appraisal instruments may be added as versioned profile
data without changing review identity.

Review access follows project membership, but it does not grant private-library
or artifact access. Bibliographic snapshots and explicitly rights-checked
research shares use the existing project boundaries. Each logical project
revision records or pins the exact review revision needed to reproduce its
review-derived manuscript state.

## Trigger

A walkthrough of an existing Parsifal SLR showed that its planning, conducting,
and reporting lifecycle is useful, while its flat forms leave query calibration,
source translation, criterion semantics, evidence linking, analysis, and
manuscript handoff disconnected. Kirjolab now has enough reference, evidence,
history, collaboration, and model-review infrastructure to connect that
lifecycle without making the private library or manuscript carry unsuitable
state.

## Consequences

**Positive:**

- Review protocols, searches, decisions, and evidence become auditable
  first-class resources instead of prose and spreadsheet conventions.
- Imported-source counts survive deduplication and can support reproducible
  PRISMA and PRISMA-S reporting.
- Stable research questions connect planning, extraction, synthesis, claims,
  and manuscript coverage.
- One core supports both SLRs and MLRs while allowing method-specific rules.
- Existing local-model assistance can accelerate review work without silently
  replacing scientific judgment.

**Negative:**

- A separate collaborative authority adds schema migrations, access checks,
  history coordination, quotas, and potentially large project datasets.
- Protocol amendments and schema evolution require explicit impact analysis
  and reassessment behavior.
- Source-specific query translation cannot be perfect and needs maintained
  adapters, visible limitations, and manual overrides.
- Independent review, blinding, conflict resolution, and evidence-linked
  extraction materially broaden the collaboration surface.

**Neutral:**

- Proprietary database searches may continue to run outside Kirjolab; exact
  queries and imported result files still form a complete search-run record.
- Detailed workflow states, bounds, interchange formats, and UI behavior belong
  in a future review-studies feature specification.
- A literature-review manuscript template remains useful but is not a
  substitute for a `ReviewStudy`.

## Alternatives Considered

### Extend the literature-review project template

Markdown can describe a protocol but cannot safely coordinate thousands of
occurrences, independent decisions, typed extractions, or immutable search
runs. A template remains a manuscript starting point, not the review authority.

### Store review state in the owner-private library

This would reuse stable source identities but make one owner's private working
memory authoritative for a collaborative study. It would also make project
membership and library access difficult to separate under ADR-059.

### Build a standalone screening application

A separate application could optimize screening throughput, but it would
recreate the handoff from review records to PDFs, claims, references, and the
manuscript. Kirjolab's advantage is preserving that traceable path in one
scholarly workspace.

### Require one fixed PRISMA and PICOC workflow

This would simplify the first data model but confuse reporting guidance with a
universal methodology and fit MLRs or non-intervention questions poorly.
Versioned method profiles retain a coherent core without imposing one framework.

[mlr-guidance]: https://oulurepo.oulu.fi/handle/10024/27678
[prisma]: https://www.prisma-statement.org/prisma-2020
[prisma-s]: https://www.prisma-statement.org/prisma-search
