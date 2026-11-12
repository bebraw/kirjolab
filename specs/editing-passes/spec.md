# Feature: Purposeful Editing Passes

## Blueprint

### Context

Editing for structure, order, clarity, evidence, and length are different jobs.
A focused pass should reduce cognitive load and explain why each passage was surfaced.

### Architecture

- Five deterministic local analyzers return bounded advisory cues with source ranges.
- Outline & hints in right Context presents one selected pass at a time and
  navigates findings through exact file-qualified source ranges. Its default
  view shows at most three cues for the current passage or section; explicit
  whole-document review shows at most twenty. The total matching count remains
  visible. See [manuscript map](../manuscript-map/spec.md).
- Pass output is disposable and never changes canonical Markdown.
- Optional AI paragraph interpretation is a separate, visibly attributed guide
  result. It does not replace these deterministic pass analyzers or determine
  their findings.

### Anti-Patterns

- Do not combine all findings into an undifferentiated quality score.
- Do not call evidence-language heuristics proof that a citation is required.
- Do not invoke a model or automatically apply an edit.

## Contract

### Definition of Done

- [x] Structure, Order, Clarity, Evidence, and Length are independently selectable.
- [x] Findings explain their bounded heuristic and focus exact source.
- [x] A clean pass reports that it has no cues.
- [x] The current-passage view shows a bounded selection of relevant cues while
      whole-document review remains available explicitly.

### Regression Guardrails

- Passes remain deterministic and non-mutating.
- Evidence cues use review language rather than correctness claims.
- Moving the caret changes cue scope without invoking a model or moving source
  selection; a model outage cannot hide local pass results.

### Scenarios

**Scenario: Researcher edits for evidence**

- Given: research-language prose without an inline citation
- When: Evidence is the selected pass
- Then: the guide asks the researcher to review its evidence basis without editing it
