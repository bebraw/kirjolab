# Feature: README Docs

## Blueprint

### Context

The template README is the first surface contributors see. It should identify the current starter app clearly near the top, explain how vendored ASDLC references relate to repo-specific docs, and point contributors at the current runtime and verification commands without carrying a screenshot that can drift from the application.

### Architecture

- **Primary document:** `README.md`
- **Current workflow summary:** runtime, verification, source layout, and documentation contract notes in `README.md`
- **Screenshot policy:** no committed application screenshot in the baseline
- **Non-goal:** no screenshot capture in the automated development loop, CI, or remote workflows

### Anti-Patterns

- Do not reintroduce a screenshot without a current asset and an explicit documentation decision.
- Do not point the README at a missing, stale, or placeholder screenshot path.
- Do not reintroduce screenshot scripts or automation as part of the routine development loop.
- Do not make readers infer the app shape from source files alone before they understand the runtime baseline.
- Do not imply that generated code becomes authoritative just because CI passes.
- Do not let the README drift away from the actual commands, ports, or source layout used by the current template.

## Contract

### Definition of Done

- [ ] The README identifies the starter as a Cloudflare Worker served with Wrangler near the top.
- [ ] The README explains how vendored ASDLC guidance relates to repo-specific architecture, spec, and ADR documents.
- [ ] The README reflects the current runtime and verification commands.
- [x] The README contains no stale application screenshot or screenshot reference.

### Regression Guardrails

- `README.md` must not reference a missing or stale application screenshot.
- `README.md` should let a new reader understand the current app and rendering model before they start exploring the source tree.
- `README.md` should describe the current documentation contract accurately, including that specs and ADRs remain authoritative over generated code.
- `README.md` should continue to describe the current starter source layout and verification flow accurately.
- `README.md` should describe the current runtime pin source accurately when the repo toolchain changes.
- `README.md` should describe the supported host platform baseline accurately when local development constraints change.
- `README.md` should point browser setup at the current pinned Playwright install script instead of an ad hoc command.
- A later screenshot addition must include a current asset and update this spec and the governing ADR in the same change.

### Verification

- **Repo check:** `git diff --check`
- **Baseline gate:** `npm run quality:gate` and `npm run ci:local`

### Scenarios

**Scenario: Reader opens the README**

- Given: the repo is viewed locally or on Git hosting
- When: the reader starts at the top of the document
- Then: they can tell quickly that the starter is a Cloudflare Worker served with Wrangler and centered on server-rendered HTML

**Scenario: Contributor follows the README**

- Given: the current template baseline
- When: the contributor reads the runtime, verification, and source layout sections
- Then: the commands, ports, and file locations match the current repo behavior

**Scenario: Contributor evaluates generated changes**

- Given: a contributor or agent proposes code generated with AI assistance
- When: they read the README documentation notes
- Then: they understand that specs and ADRs remain the durable source of truth and that CI passing does not replace those documents

**Scenario: Starter UI changes materially**

- Given: the rendered application changes materially
- When: the change is completed
- Then: the text documentation remains accurate without requiring a screenshot refresh
