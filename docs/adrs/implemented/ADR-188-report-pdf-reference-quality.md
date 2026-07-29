# ADR-188: Report PDF Reference Quality

**Status:** Implemented

**Date:** 2026-07-29

## Context

PDF reference extraction has unit and browser coverage, but individual examples
do not expose aggregate quality or make known misses easy to inspect. Production
uploads are owner-private and unsuitable as an implicit evaluation dataset.

## Decision

Maintain a small, versioned, synthetic page-text corpus in developer tooling.
`npm run diagnostics:pdf-references` runs the production deterministic parser
against that corpus and reports precision, recall, F1, and failure examples for
bibliography headings, parsed references, and in-text mentions. JSON output is
available for explicit trend capture, but the report remains advisory.

The corpus includes successful, negative, and known-hard examples. It contains
no uploaded PDF text and performs no network or model calls.

## Consequences

**Positive:**

- Parser changes have a repeatable quality baseline beyond pass/fail fixtures.
- Known misses stay visible and can become regression cases when fixed.
- Evaluation cannot leak owner-private document content.

**Negative:**

- Synthetic examples do not estimate performance over the full scholarly PDF
  distribution.
- Corpus labels require deliberate maintenance as extraction scope expands.

**Neutral:**

- The diagnostic does not block local CI or change runtime extraction behavior.

## Alternatives Considered

### Aggregate production uploads automatically

Rejected because private document text must not become a hidden evaluation
dataset and meaningful labels would still be absent.

### Report only unit-test pass counts

Rejected because pass counts do not reveal precision/recall trade-offs or
specific false positives and misses.
