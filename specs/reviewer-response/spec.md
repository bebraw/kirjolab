# Feature: Reviewer Response Matrix

## Blueprint

### Context

Publication review requires a deliberate response workflow distinct from
collaborator comments. Authors need to preserve each comment, track its status,
explain the response, and identify the manuscript change.

### Architecture

- `reviewer-response.md` is the canonical portable matrix.
- Each level-two `R…` item contains reviewer, status, manuscript links, comment,
  response, and change sections.
- Writing guide derives status cards and generates a clean Markdown response
  letter without changing the matrix.

### Anti-Patterns

- Do not merge external review items with range-anchored collaborator comments.
- Do not mark an item addressed because manuscript text changed.
- Do not overwrite the canonical matrix while generating a response letter.

## Contract

### Definition of Done

- [x] A researcher can create or open a portable response matrix.
- [x] The guide shows open, addressed, and declined items with manuscript-link counts.
- [x] The researcher can download a clean Markdown response letter.

### Regression Guardrails

- Unknown statuses degrade to open.
- Empty response fields remain visible in the generated letter.

### Scenarios

**Scenario: Author prepares a response letter**

- Given: a matrix containing reviewer comments and author responses
- When: the author exports the response letter
- Then: the download contains each item without internal status or link metadata
