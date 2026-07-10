# Feature: README Docs

## Blueprint

### Context

The template README is the first surface contributors see. It should identify the current starter app clearly near the top, explain how vendored ASDLC references relate to repo-specific docs, point contributors at the current runtime and verification commands, and keep screenshot refresh manual.

### Architecture

- **Primary document:** `README.md`
- **Committed screenshot asset:** `docs/screenshots/home.png`
- **Current workflow summary:** runtime, verification, source layout, and documentation contract notes in `README.md`
- **Screenshot refresh path:** manual developer update
- **Update model:** manual refresh when the starter UI changes materially
- **Non-goal:** no screenshot capture in the automated development loop, CI, or remote workflows

### Anti-Patterns

- Do not reintroduce remote screenshot automation just to keep the README image current.
- Do not reintroduce local screenshot scripts as part of the routine development loop.
- Do not point the README at a missing or stale placeholder screenshot path.
- Do not let the committed screenshot drift far from the current starter UI.
- Do not make readers infer the app shape from source files alone before they understand the runtime baseline.
- Do not imply that generated code becomes authoritative just because CI passes.
- Do not let the README drift away from the actual commands, ports, or source layout used by the current template.

## Contract

### Definition of Done

- [ ] The README includes a working application screenshot reference.
- [ ] The README identifies the starter as a Cloudflare Worker served with Wrangler near the top.
- [ ] The README explains how vendored ASDLC guidance relates to repo-specific architecture, spec, and ADR documents.
- [ ] The README reflects the current runtime and verification commands.
- [ ] The screenshot asset is committed in the repo.

### Regression Guardrails

- `README.md` must reference a committed screenshot file that exists in the repo.
- `README.md` should let a new reader understand the current app and rendering model before they start exploring the source tree.
- `README.md` should describe the current documentation contract accurately, including that specs and ADRs remain authoritative over generated code.
- `README.md` should continue to describe the current starter source layout and verification flow accurately.
- `README.md` should describe the current runtime pin source accurately when the repo toolchain changes.
- `README.md` should describe the supported host platform baseline accurately when local development constraints change.
- `README.md` should point browser setup at the current pinned Playwright install script instead of an ad hoc command.
- The screenshot should continue to represent the current starter app surface closely enough to be useful.
- Screenshot support must remain manual unless a later ADR changes that rule.

### Verification

- **Screenshot refresh:** manual developer update when the starter UI changes materially
- **Manual check:** verify the README image renders from `docs/screenshots/home.png`
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

- Given: the rendered application changes enough that the current screenshot is misleading
- When: the change is completed
- Then: the developer refreshes the committed README screenshot manually
