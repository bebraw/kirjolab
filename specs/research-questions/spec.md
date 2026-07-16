# Feature: Research Question Ledger

## Blueprint

### Context

Research questions scope a study, shape its method, and should remain visibly
connected to the manuscript and evidence-backed claims through completion.

### Architecture

- `research-questions.md` is the canonical portable ledger.
- Each level-two `RQ…` heading contains one question and bounded Markdown fields
  for status, motivation, method, manuscript anchors, and claim IDs.
- The Writing guide derives question status and traceability counts and can
  navigate to the exact ledger entry.

### Anti-Patterns

- Do not infer or silently change research questions from manuscript prose.
- Do not treat a section label or claim ID as verified unless the user records it.
- Do not make the derived guide cards canonical state.

## Contract

### Definition of Done

- [x] A researcher can create or open the portable ledger.
- [x] The guide shows each question, status, section count, and claim count.
- [x] Selecting a question focuses its exact ledger entry.

### Regression Guardrails

- Unknown statuses degrade to `refining` rather than breaking the ledger.
- Missing optional fields remain valid and visible as zero coverage.

### Scenarios

**Scenario: Researcher checks question coverage**

- Given: questions linked to manuscript anchors and claims
- When: the researcher opens Writing guide
- Then: each explicit link contributes to the visible traceability summary
