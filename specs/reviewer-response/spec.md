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
- A reused writing-workflow component adapts the portable Markdown into guide
  items and owns their count, empty state, action labels, response-letter
  derivation and browser download, and typed open, notice, and source-selection
  outcomes. The application coordinator retains file creation, toast policy,
  and source navigation.

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
- Response-letter export is enabled once the canonical matrix file exists; a
  transiently empty collaboration text during file hydration does not disable
  the control, and a deliberately empty matrix exports an empty letter.

### Scenarios

**Scenario: Author prepares a response letter**

- Given: a matrix containing reviewer comments and author responses
- When: the author exports the response letter
- Then: the download contains each item without internal status or link metadata
