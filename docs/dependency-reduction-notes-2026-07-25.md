# Dependency Reduction Notes

**Date:** 2026-07-25

## Purpose

Kirjolab has grown beyond 100,000 lines across source, tests, and tooling. The
goal of dependency adoption is not to minimize the repository mechanically. It
is to retire project-owned implementations of commodity infrastructure while
keeping product rules, security bounds, and durable authorities explicit.

The current codebase is large but not broadly unhealthy. The local Fallow
diagnostics report an 81/B health score, average cyclomatic complexity of 3,
5% duplication, and one dominant churn hotspot: `src/client/app.ts`.

## Evidence

- Runtime validation is distributed across 203 `is…`, `parse…`, `validate…`,
  and `assert…` functions. Forty-three files define their own `isRecord`
  helper.
- `src/client/app.ts` is 12,495 lines and combines a large typed element
  registry with event binding, rendering, and feature orchestration.
- `src/integrations/github-app.ts` and
  `src/integrations/github-user.ts` contain about 860 lines of handwritten
  GitHub authentication and REST protocol code.
- `src/domain/bibliography.ts` implements a deliberately bounded 240-line
  BibTeX parser and serializer.
- `src/client/offline-workspace.ts` contains about 70 lines of direct IndexedDB
  promise and transaction plumbing.

## Recommended Sequence

### 1. Pilot schema validation at one trust boundary

Adopt Valibot for a coherent family of external or persisted payloads. A schema
should become the single runtime contract and infer its TypeScript output type
where doing so removes a duplicated interface or type guard.

The pilot must:

- preserve all existing bounds and accepted payloads;
- remain local to one contract family;
- keep cross-record and stateful business invariants in domain functions;
- avoid converting internal predicates merely for consistency; and
- demonstrate a net reduction in maintained validation code.

The library-interchange boundary is the preferred pilot because its CSL JSON
and portable research payloads are explicit, versioned, and already covered by
focused tests and a living spec.

### 2. Pilot decomposed Octokit packages

Replace only commodity GitHub protocol work: App authentication, installation
tokens, authenticated request construction, and standard request errors. Keep
Kirjolab's repository selection, path normalization, content limits, response
normalization, concurrency checks, and safe public error mapping.

Prefer decomposed Octokit packages over the all-in-one SDK. Preserve injected
`fetch` support so tests and Workers runtime behavior remain deterministic.

### 3. Pilot one Lit component

Extract one bounded, low-coupling browser surface from `WorkspaceApp` into a
Lit custom element. The component should own its local template, element
references, reactive presentation state, and DOM events while emitting typed
intent events to the existing application coordinator.

The pilot must not:

- turn Lit into a global application store;
- move Yjs, XState actors, network authority, or persisted domain state into
  the component;
- require client-side ownership of the whole server-rendered shell; or
- introduce a second visual language.

The GitHub connection/import presentation is the preferred pilot because it
has bounded state, explicit user intents, and existing contract tests.

## Deferred Options

- Adopt Citation.js only when broader BibTeX, BibLaTeX, RIS, or CSL
  interoperability becomes a product requirement. The current bounded parser
  is smaller than the adaptation layer would likely be today.
- Adopt `idb` when a second browser database store or schema migration appears.
  The current saving is too small to justify a dependency by itself.
- Do not adopt a Worker router solely to reduce conditional route matching.
  Most API volume is authorization and product workflow logic.
- Keep explicit LaTeX ZIP envelope validation. It enforces Kirjolab-specific
  security and resource bounds beyond decompression.

## Evaluation Gates

Each pilot receives its own commit and must pass targeted tests, affected
guardrails, and the full native local CI gate before the sequence is considered
ready. Record lasting constraints in an ADR and update the affected feature spec
in the same commit as the implementation.

Continue to the next pilot only when the preceding change preserves behavior
and leaves a narrower project-owned maintenance surface. A pilot that adds
abstraction without deleting equivalent infrastructure should be reverted or
kept out of the production path.

## Pilot Outcome Clarification

The Lit pilot's first component adds more source lines than it removes because
it establishes the reactive boundary and preserves server-rendered fallback
markup. It is accepted on the basis of reduced long-term coordination
complexity: `WorkspaceApp` now addresses one typed GitHub connection surface
instead of its internal status and action elements. This is a deliberate
exception to the immediate line-reduction gate, not permission to wrap static
markup. Later components must retire meaningful element-registry, imperative
rendering, or event-wiring complexity.

### Browser response schemas: accepted

The second Valibot boundary consolidates GitHub, LaTeX import, snapshot
comparison, annotation, and share-link response validators in
`src/client/app-contracts.ts`. Existing malformed-field tests pass unchanged,
and the module is 96 lines smaller after removing nested handwritten predicates
and parallel structural return types.

### GitHub sync menu component: accepted

The second Lit boundary moves synchronization labels, repository detail,
relationship tone, action availability, and four local intent bindings behind
one typed component. `WorkspaceApp` drops eight internal element references and
25 lines while retaining refresh timing, requests, previews, and settings
authority. Existing Pull and Push browser workflows pass unchanged.

### Project history response schemas: accepted

The third Valibot boundary replaces independent summary, retained-content, and
comparison predicates with composable schemas. It removes 27 lines while
making shared revision/count constraints and composed word-delta arithmetic
explicit; the existing malformed-field matrix passes unchanged.

### Shared bounded GitHub response reader: accepted

GitHub App and user clients now share incremental response-size enforcement and
JSON parsing while retaining distinct byte ceilings and public error types.
This removes duplicate stream plumbing without adopting Octokit's unbounded
OAuth request path.

### GitHub import picker component: accepted

The third Lit boundary moves local import fields, option rendering, readiness,
preview/status DOM, and Cancel/Confirm intents behind one component.
`WorkspaceApp` drops ten internal element references, its repository-option
cache, and about 100 lines of imperative picker and preview coordination.
Connection, repository discovery, preview requests, and project creation remain
with the application coordinator.

### Shared scholarly response reader: accepted

Crossref, DataCite, OpenAlex, and Semantic Scholar now use the same stateless,
request-local bounded stream and JSON reader. Provider-specific 1 MB ceilings,
errors, structural checks, and metadata mappings remain local. The change
removes 123 duplicated lines while adding 52 shared and adapter lines, for a net
reduction of 71 source lines without adding a dependency.

### Project starting-point component: accepted

The fourth Lit boundary moves template and existing-project grouping,
selection, preview rendering, and local project-preview state out of
`WorkspaceApp`. The coordinator drops three internal element references and
247 source lines while retaining fetches, deferred deletion, and project
creation. The component adds 321 focused source lines, so total executable
source grows by 81 lines while the primary churn hotspot becomes narrower.
Reusing the existing Lit dependency adds no production packages; the minified
browser application changes by +1,307 B raw and +339 B gzip from the recorded
baseline.

### Shared local-model response reader: accepted

The OpenAI-compatible browser adapter now uses the same request-local bounded
JSON reader as GitHub and scholarly integrations. Its 256 KiB ceiling, fatal
UTF-8 decoding, and distinct empty and malformed response errors remain
explicit. The refactor removes the fifth streamed JSON implementation and five
net source lines; the generalized decoder option changes the minified browser
application by +358 B raw and +127 B gzip.

### GitHub sync review component: accepted

The fifth Lit boundary moves Pull and Publish diff rendering, conflict choices,
commit-message input, progress, readiness, and seven local control references
out of `WorkspaceApp`. The coordinator retains preview identities, requests,
project refresh, mutations, and disconnect confirmation. `WorkspaceApp` drops
147 net lines while the focused component adds 364 lines; total executable
source grows by 222 lines while the main churn hotspot loses another complete
presentation workflow. Reusing Lit adds no production packages; the minified
browser application changes by +3,722 B raw and +499 B gzip.

### Review-model schemas: accepted

The fourth Valibot boundary consolidates candidate creation requests with the
persisted candidate snapshot envelope. Operation, stage, provenance,
disposition, and result-envelope structure now have one schema-backed runtime
definition; extraction compatibility and evidence invariants remain explicit
domain functions. The pilot removes 30 net executable source lines without a
new package or a new validation concept.

### GitHub App responsibility split: accepted

The App integration now isolates credential normalization, Octokit signing,
installation-token exchange, bounded HTTP, and provider-error projection from
repository tree and commit orchestration. The public client contract and all
request-scoped Worker behavior stay unchanged. The split grows executable
source by 31 lines, but reduces the former 446-line mixed-responsibility module
to a 344-line repository client and a 133-line transport with one directional
dependency.

### Reproducible dependency-cost diagnostic: accepted

`npm run diagnostics:dependencies` now reproduces the package and complete
browser-artifact measurements used by these pilots. It reads the lockfile and
existing build outputs, reports Markdown or JSON, uses deterministic level-9
gzip, writes no state, and adds no package. Esbuild package attribution remains
an explicit deeper measurement rather than pretending gzip savings can be
assigned reliably per dependency.

### Shared assistant revision acceptance: accepted

The post-pilot duplicate audit found three copies of the same XState transition,
candidate persistence, success, failure, and availability-refresh sequence for
idea, phrasing, and clarity choices. One private workflow now owns that
sequence while each operation supplies its instruction and messages. Together
with two unused type exports exposed by the same audit, the cleanup removes 38
net executable source lines without changing behavior or adding a concept.

### Shared horizontal resizer lifecycle: accepted

The clean audit's largest remaining clone was the pointer capture, drag,
cancel, release, and PDF-resize lifecycle duplicated by the source rail and
authoring/context divider. One private binder now owns that browser lifecycle;
each resizer retains its distinct geometry, keyboard behavior, persistence, and
ARIA updates. The change removes 12 net executable lines.

### Shared source-completion option shell: accepted

Include-path and citation suggestions now share their button identity, option
role, code/metadata structure, pointer focus retention, and hover selection
behavior. Their content, optional Library action, and synchronous or async
acceptance remain supplied by each completion family. This removes the
remaining 10-line completion clone and five net executable lines.

## Final Re-audit and Stopping Point

The clean post-sequence audit reports 13,987 production LOC, zero dead files,
zero dead exports, 2.6 average cyclomatic complexity, and 88.2 maintainability.
Five clone groups remain, each only 6–9 lines:

- two review-request envelopes whose distinct domain errors and fields outweigh
  a shared parser;
- one record predicate shared only by the separated GitHub transport and
  repository layers;
- three small browser presentation fragments whose extraction would add as
  much parameter and helper surface as it removes.

Fallow also reports public Lit component methods and the installation transport
entrypoint as unused because their callers cross custom-element and class-module
boundaries. They are exercised by the browser and GitHub integration suites and
must not be deleted.

This is the current stopping point for opportunistic reduction. Resume when a
new dependency can retire a coherent responsibility, another trust-boundary
family produces a clear net schema reduction, or a repeated workflow grows
beyond these small local fragments.

## Dependency Cost Baseline

Measured from commit `74dc3b1` after `npm run ci:local` rebuilt the browser
artifacts:

| Measure                                 | Baseline       |
| --------------------------------------- | -------------- |
| Direct production dependencies          | 18             |
| Unique production package/version nodes | 150            |
| Browser application                     | 652,499 B raw  |
| Browser application                     | 184,812 B gzip |
| Lazy Markdown runtime                   | 204,779 B raw  |
| Lazy Markdown runtime                   | 62,504 B gzip  |
| Lazy PDF.js runtime                     | 481,994 B raw  |
| Lazy PDF.js runtime                     | 146,696 B gzip |
| Styles                                  | 134,696 B raw  |
| Styles                                  | 23,422 B gzip  |

Esbuild metadata attributes these minified bytes in the relevant output:

| Dependency          | Production closure | Browser application | Worker analysis |
| ------------------- | -----------------: | ------------------: | --------------: |
| Lit                 |                  6 |            14,783 B |               — |
| Valibot             |                  3 |             7,055 B |        10,017 B |
| `@octokit/auth-app` |                 16 |                   — |        30,266 B |

Production closure is the number of unique package/version nodes reachable
from that direct dependency in `npm ls --omit=dev --all --json`. Output
attribution is the sum of esbuild `bytesInOutput` for the dependency family.
The Worker number comes from a transient minified analysis bundle with
Cloudflare and build-only Node imports externalized; it is useful for comparing
dependencies, not as a deployed Worker-size claim. Gzip is reported only for
complete outputs because compression savings cannot be assigned reliably to
one dependency.

### Admission rule for later pilots

A new dependency should be accepted only when it retires a coherent
project-owned maintenance responsibility and records all of the following:

- direct and transitive production-package cost;
- minified bytes attributed in each affected browser or Worker output;
- source code, tests, and concepts removed or made local;
- the product-specific bounds and authorities that remain; and
- targeted tests plus the full native CI result.

Prefer an existing dependency or a source-local helper when it produces the
same reduction. Keep large optional browser capabilities behind the existing
lazy runtime boundaries. Do not treat fewer source lines alone as success when
the dependency adds a broader API, state owner, or upgrade surface.

## Continued Lit Extraction: Workspace Sharing

The authenticated workspace sharing dialog is a successful follow-on Lit
boundary. `WorkspaceApp` now addresses one `WorkspaceSharingPanel` instead of
fifteen member, invitation, and share-link elements. The component owns local
rendering, invitation input, clipboard interaction, and typed intent events;
the coordinator continues to own every fetch, response validation,
authorization outcome, and toast policy.

This checkpoint reduces `src/client/app.ts` from 11,914 to 11,833 lines
(-81). The focused component adds 242 lines, including the light-DOM template
and server-fallback-compatible event contract. The trade remains intentional:
the primary coordinator shrinks, access authority stays explicit, and later
changes to the sharing surface have one browser presentation owner.

Targeted affected guardrails, the read-only and edit-link browser workflows,
and the collaborator invitation workflow pass. Full native CI passes all 1,197
unit/coverage tests, 120 Workers-runtime tests, and 73 browser tests. The
rebuilt browser application is 658,628 B raw and 185,728 B gzip, an increase of
2,247 B raw and 607 B gzip from the preceding checkpoint; direct and unique
production package counts remain unchanged.

## Continued Lit Extraction: Workspace Catalog

The Projects browser is another successful bounded Lit extraction.
`WorkspaceApp` now addresses one `WorkspaceCatalogPanel` instead of its close
control, filter input, and result container. The component owns query state,
filtered rows, empty states, project metadata labels, and focus reset; the
coordinator still fetches and validates the catalog, updates the compact
workspace switcher, and retains navigation authority.

This checkpoint reduces `src/client/app.ts` from 11,833 to 11,800 lines (-33).
The focused component adds 116 lines. Its pure filter and metadata contracts
have unit coverage, and the existing isolated-workspace browser workflow covers
filtering, current-project labelling, empty results, and closing the dialog.
Full native CI passes all 1,200 unit/coverage tests, 120 Workers-runtime tests,
and 73 browser tests. The rebuilt browser application is 660,167 B raw and
185,944 B gzip, an increase of 1,539 B raw and 216 B gzip from the sharing
checkpoint; dependency counts remain unchanged.

## Continued Lit Extraction: Project History

Revision history is the largest successful extraction in this continuation.
`WorkspaceApp` now addresses one `ProjectHistoryPanel` instead of six timeline,
comparison, and inspector elements. The component owns local selection,
timeline cards, milestone labels, busy and error presentation, read-only
revision inspection, diff presentation, and typed operation intents. The
coordinator retains its XState workflow, request generations, validation,
confirmation prompts, fetches, mutations, reloads, and navigation.

This checkpoint reduces `src/client/app.ts` from 11,800 to 11,703 lines (-97).
The focused component adds 263 lines and reaches 90% statement coverage through
timeline, inspector, comparison, selection, and intent tests. The existing
browser workflow passes across inspect, compare, milestone, restore, and branch
operations. Full native CI passes all 1,202 unit/coverage tests, 120
Workers-runtime tests, and 73 browser tests. The rebuilt browser application is
663,150 B raw and 187,028 B gzip, an increase of 2,983 B raw and 1,084 B gzip
from the catalog checkpoint; dependency counts remain unchanged.

## Continued Lit Extraction: Writing Workflow Outlines

Research questions and reviewer responses now reuse one bounded
`WritingWorkflowPanel` rather than maintaining parallel imperative list
renderers. Two instances own Markdown-to-item presentation adaptation, counts,
empty states, action labels, download readiness, and typed open, download, and
source-selection intents. `WorkspaceApp` retains workflow-file creation,
response-letter export, and source navigation.

This checkpoint reduces `src/client/app.ts` from 11,703 to 11,665 lines (-38)
and replaces five internal element references with two component references.
The shared component adds 194 lines and reaches 92.5% statement coverage across
both workflow kinds, missing and empty states, populated lists, and every
intent. A focused browser workflow passes through creation and rendering of
both portable ledgers. Full native CI passes all 1,205 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests. The rebuilt browser application is
664,646 B raw and 187,552 B gzip, an increase of 1,496 B raw and 524 B gzip
from the history checkpoint; dependency counts remain unchanged.

## Continued Lit Extraction: Assistant Results

The Writing assistant's transient outputs now share one bounded
`AssistantResultPanel` instead of six imperative renderers and their local
button bindings. The component owns validated-table previews, the focused
clarity answer, idea and rewrite choices, reference-discovery cards, typed
intent construction, and local reference-save progress. `WorkspaceApp` keeps
the captured manuscript context, XState workflow, model requests, stale-target
checks, candidate persistence, canonical Markdown edits, and Library imports.

This checkpoint reduces `src/client/app.ts` from 11,665 to 11,559 lines (-106).
The focused component adds 305 lines and avoids direct DOM writes inside Lit's
light-DOM render root. Focused component and server-shell tests pass, as do the
affected unit tests and typecheck. The same simplification pass removed a
redundant reviewer-response export condition: canonical matrix-file existence
now defines readiness without racing transient parser output during
collaboration hydration. The component reaches 93.5% statement coverage and
the global suite remains above its threshold at 90.03%.

Full native CI passes all 1,209 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests, including the complete clarity, ideation, phrasing,
table, and reference-discovery workflow. The rebuilt browser application is
668,018 B raw and 188,591 B gzip, an increase of 3,372 B raw and 1,039 B gzip
from the writing-workflow checkpoint. Direct and unique production package
counts remain unchanged.

## Continued Lit Extraction: Project Map

The Project Map now has one bounded `ProjectMapPanel` instead of imperative
node, lane, connector, resize, focus, and hover management in `WorkspaceApp`.
The component owns its light-DOM projection, measured SVG geometry, responsive
relayout, transient emphasis, and typed resource-selection intent. The
coordinator continues to derive the canonical graph and own navigation.

This checkpoint reduces `src/client/app.ts` from 11,559 to 11,356 lines (-203)
and removes three internal element references plus two coordinator fields. The
233-line component keeps connector geometry in the existing pure layout module;
that module and the component reach 100% and 94.2% statement coverage,
respectively. The focused evidence-to-prose browser workflow verifies contained,
non-overlapping cards and connector alignment at desktop and compact widths.

Full native CI passes all 1,216 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 668,968 B raw and
189,050 B gzip, an increase of 950 B raw and 459 B gzip from the assistant
results checkpoint. Direct and unique production package counts remain
unchanged at 18 and 150.
