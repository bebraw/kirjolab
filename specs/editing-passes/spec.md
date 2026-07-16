# Feature: Purposeful Editing Passes

## Blueprint

### Context

Editing for structure, order, clarity, evidence, and length are different jobs.
A focused pass should reduce cognitive load and explain why each passage was surfaced.

### Architecture

- Five deterministic local analyzers return bounded advisory cues with source ranges.
- The Writing guide presents one selected pass at a time and navigates findings to source.
- Pass output is disposable and never changes canonical Markdown.

### Anti-Patterns

- Do not combine all findings into an undifferentiated quality score.
- Do not call evidence-language heuristics proof that a citation is required.
- Do not invoke a model or automatically apply an edit.

## Contract

### Definition of Done

- [x] Structure, Order, Clarity, Evidence, and Length are independently selectable.
- [x] Findings explain their bounded heuristic and focus exact source.
- [x] A clean pass reports that it has no cues.

### Regression Guardrails

- Passes remain deterministic and non-mutating.
- Evidence cues use review language rather than correctness claims.

### Scenarios

**Scenario: Researcher edits for evidence**

- Given: research-language prose without an inline citation
- When: Evidence is the selected pass
- Then: the guide asks the researcher to review its evidence basis without editing it
