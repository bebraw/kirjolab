# Feature: Portable Research Diary

## Blueprint

### Context

Research progress, discoveries, advisor questions, and the next action should
survive outside Kirjolab and remain available to collaborators.

### Architecture

- `research-diary.md` is an ordinary collaborative project file.
- The Writing guide creates the file from a bounded template or opens the
  existing file. It never creates a second diary.
- Diary summaries are derived from dated level-two headings and incomplete
  checklist items under Open questions and Next actions.

### Anti-Patterns

- Do not store the diary only in browser or service-private state.
- Do not infer progress from activity telemetry or model output.

## Contract

### Definition of Done

- [x] A researcher can create or open one portable diary from Writing guide.
- [x] The template prompts for progress, discoveries, questions, and next actions.
- [x] The guide summarizes entries and incomplete items without mutating them.

### Regression Guardrails

- The diary remains ordinary Markdown and uses the existing collaboration and history contracts.

### Scenarios

**Scenario: Researcher starts a diary**

- Given: a project without `research-diary.md`
- When: the researcher chooses Start diary
- Then: Kirjolab creates the portable template and opens it for editing
