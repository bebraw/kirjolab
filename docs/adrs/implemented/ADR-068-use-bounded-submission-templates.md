# ADR-068: Use Bounded Submission Templates

**Status:** Implemented

**Date:** 2026-07-12

## Context

Publication formatting includes more than citations. Drafts, preprints,
anonymous review copies, and compact journal layouts need coordinated margins,
spacing, columns, title-page behavior, anonymity, and paper size. Exposing each
low-level value independently invites invalid combinations, while arbitrary
uploaded templates create a code and file-processing boundary.

## Decision

Extend the versioned project publication profile with one bounded submission
template and paper size. The supported templates are Standard article,
Preprint, Anonymous review, and Journal two-column. Each resolves to a pinned
set of margins, line spacing, column count, title-page behavior, and anonymity.

Both LaTeX and direct PDF materialization consume the resolved template. The
exact template id and paper size remain in export manifests through the project
publication profile. Template changes participate in ordinary project history,
milestones, restore, and duplication.

Do not execute uploaded TeX, scripts, or remote assets. Journal-specific custom
templates remain a future validated asset contract rather than an escape hatch
in project settings.

## Consequences

**Positive:**

- Common submission layouts are one coherent, reviewable choice.
- Preview-independent exports remain deterministic and reproducible.
- Anonymous review behavior is explicit rather than a collection of toggles.
- Direct PDF and LaTeX share page geometry and spacing intent.

**Negative:**

- Four presets cannot represent every publisher's exact house style.
- Preset changes require code and tests until a safe template package format
  exists.
- The lightweight direct PDF renderer does not yet reproduce complex TeX
  typography or true multi-column flow.

## Alternatives Considered

### Expose every layout value

This enables contradictory settings and makes reproducibility harder to audit.

### Accept arbitrary LaTeX templates

Untrusted TeX and asset paths require sandboxing, dependency, and lifecycle
decisions beyond this slice.

### Keep one article template

This leaves anonymous review and realistic publication preparation outside the
otherwise unified export workflow.
