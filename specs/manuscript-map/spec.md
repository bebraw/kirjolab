# Feature: Manuscript Map

## Blueprint

### Context

Researchers need a compact view of a manuscript's structure before they polish
individual sentences. The map makes hierarchy, section balance, citations, and
review cues visible without claiming to judge scientific validity.

### Architecture

- The domain analyzer derives a map from composed Markdown and retains exact source ranges.
- The Writing guide rail navigates each item back to authored source.
- Maps and cues are disposable browser state and never enter collaboration history.
- Summary metrics use one consistent value-over-label hierarchy so words,
  sections, and citations remain aligned at constrained rail widths.

### Anti-Patterns

- Do not treat a heuristic cue as an error or automatically rewrite prose.
- Do not analyze fenced examples, front matter, or inert comment blocks as prose.
- Do not require a model or network service to build the map.

## Contract

### Definition of Done

- [x] The guide shows heading hierarchy, section word counts, and citation counts.
- [x] It identifies heading jumps, placeholders, and single-sentence paragraphs.
- [x] Every visible item can focus its exact current source range.
- [x] Summary metrics keep equal typography and alignment without incidental
      label wrapping.

### Regression Guardrails

- Analysis remains deterministic, local, and non-mutating.
- Review cues use advisory language.

### Scenarios

**Scenario: Researcher inspects manuscript structure**

- Given: a composed manuscript with headings and prose
- When: the researcher opens Writing guide
- Then: the outline and bounded review cues reflect the current Markdown
