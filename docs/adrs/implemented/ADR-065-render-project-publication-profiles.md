# ADR-065: Render Project Publication Profiles

**Status:** Implemented

**Date:** 2026-07-12

## Context

Canonical Markdown and shared bibliographic records must remain portable, but
papers still need project-specific citation conventions. Hard-coding one
author-date form in preview and another bibliography style in LaTeX makes the
same revision render inconsistently. Making rendered citation strings canonical
would instead couple authored content to a journal or publisher.

## Decision

Store a versioned publication profile with each project. The first profile
contract selects one bounded citation style (`apa`, `chicago-author-date`, or
`ieee`) and locale (`en-US`, `en-GB`, or `fi-FI`). Markdown citation directives,
project aliases, and shared reference records remain unchanged.

Preview and every export consume the same project profile. LaTeX materialization
selects a compatible pinned bibliography style and citation command. Export
manifests record the exact profile so rendered artifacts remain explainable.

Publication profiles participate in project revisions, milestones, restore,
duplication, and archival source bundles. Only the project owner may change the
profile through Project Settings.

The initial formatter is deliberately a small, deterministic supported-profile
layer. It must not claim arbitrary CSL compatibility. CSL style ingestion can
be added later as a validated interoperability adapter without changing
canonical Markdown or reference storage.

## Consequences

**Positive:**

- Preview and export share one explicit citation decision.
- Switching publication targets does not rewrite prose or references.
- Historical and duplicated projects retain their rendering profile.
- A bounded style vocabulary keeps output deterministic and testable.

**Negative:**

- The first style set does not cover every journal-specific CSL rule.
- Locale is recorded before all locale-sensitive punctuation and labels are
  implemented.
- LaTeX output depends on the supported bibliography styles available to the
  pinned toolchain.

## Alternatives Considered

### Store rendered citations in Markdown

This makes journal changes destructive and breaks the canonical semantic
directive contract.

### Make CSL JSON or rendered bibliography canonical

Both duplicate the shared reference model and weaken BibTeX/Markdown
portability.

### Accept arbitrary style programs immediately

This introduces an unbounded executable or XML processing boundary before the
project has a safe style-validation and asset lifecycle contract.
