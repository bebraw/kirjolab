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

## Continued Lit Extraction: Candidate Review

Grounded revision and claim-draft review now use one bounded
`CandidateReviewPanel` instead of thirteen candidate-specific element
references and separate imperative copy, status, evidence, and action
renderers. The component owns before/after and provenance presentation,
decision readiness and progress, local scroll state, and typed apply, reject,
and evidence-navigation intents. `WorkspaceApp` retains applicability checks,
XState transitions, canonical mutations, failure policy, and source navigation.

This checkpoint reduces `src/client/app.ts` from 11,356 to 11,235 lines (-121).
The 214-line component reaches 93.47% statement coverage and 95.23% line
coverage across revision, claim-draft, terminal, stale, busy, failure, scroll,
and intent states. Focused browser workflows pass for stale rejection, exact
revision application, claim creation, and evidence navigation.

Full native CI passes all 1,220 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 671,878 B raw and
189,811 B gzip, an increase of 2,910 B raw and 761 B gzip from the project-map
checkpoint. Direct and unique production package counts remain unchanged at 18
and 150.

## Continued Lit Extraction: Publication Context

Publication inspection now uses one bounded `PublicationContextPanel` instead
of eight metadata, paper-list, citation, scroll, and project-PDF linking element
references. The component owns scholarly metadata, linked-paper variants,
available project-PDF options, citation readiness, local scroll state, and
typed citation, paper, link, and unlink intents. `WorkspaceApp` retains
manuscript insertion, PDF navigation, authorization-sensitive API mutations,
and workspace refreshes.

This checkpoint reduces `src/client/app.ts` from 11,235 to 11,149 lines (-86).
The 208-line component reaches 93.18% statement coverage and 94.73% line
coverage across empty and populated metadata, project, private-library and
shared-reference papers, citation readiness, linking, unlinking, opening, and
scroll state. Focused browser workflows pass through citation insertion,
project-PDF linking, opening and disconnecting, and DOI intake.

Full native CI passes all 1,225 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 674,062 B raw and
190,183 B gzip, an increase of 2,184 B raw and 372 B gzip from the candidate
review checkpoint. Direct and unique production package counts remain unchanged
at 18 and 150.

## Continued Lit Extraction: Knowledge Search

Project-map search now uses one bounded `KnowledgeSearchPanel` instead of three
form, input, and results element references plus imperative result-card
rendering. The component owns trimmed query capture and empty, populated,
hidden, and error presentation while emitting typed search and
resource-selection intents. `WorkspaceApp` retains the authorized fetch,
response validation, overview visibility, and resource navigation.

This checkpoint reduces `src/client/app.ts` from 11,149 to 11,123 lines (-26).
The 114-line component reaches 90% statement coverage and 93.1% line coverage.
The focused evidence-to-prose browser workflow passes search results, resource
selection, and clearing back to the map overview.

Full native CI passes all 1,227 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 675,522 B raw and
190,633 B gzip, an increase of 1,460 B raw and 450 B gzip from the publication
context checkpoint. Direct and unique production package counts remain
unchanged at 18 and 150.

## Continued Lit Extraction: Claim List

The Claims collection now uses one bounded `ClaimListPanel` instead of five
imperative claim, grounding, evidence-link, passage-link, and action render
helpers. The component owns empty and populated claim presentation, grounding
checkbox state, evidence and manuscript link presentation, and typed claim,
selection, and navigation intents. `WorkspaceApp` retains selection authority,
dialogs, mutations, confirmations, refreshes, and source navigation.

This checkpoint reduces `src/client/app.ts` from 11,123 to 11,033 lines (-90).
The component adds 181 lines and reaches 93.47% statement coverage and 94.11%
line coverage. Four small shared evidence and anchor presentation functions
moved from the coordinator into a 20-line tested module instead of being
duplicated by the component. Focused browser workflows pass claim creation,
atomic replacement, evidence selection, passage linking, candidate grounding,
and deletion.

Full native CI passes all 1,231 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 678,143 B raw and
191,345 B gzip, an increase of 2,621 B raw and 712 B gzip from the knowledge
search checkpoint. Direct and unique production package counts remain unchanged
at 18 and 150.

## Continued Lit Extraction: Manuscript Comments

The manuscript comment collection now uses one bounded
`ManuscriptCommentList` instead of imperative empty-state, comment-card,
anchor-status, and action rendering. The component owns comment presentation
and emits typed open, re-anchor, and resolve intents. `WorkspaceApp` retains
comment creation, selected-passage authority, API mutations, refreshes, toast
policy, and source navigation.

This checkpoint reduces `src/client/app.ts` from 11,033 to 11,009 lines (-24).
The component adds 110 lines and reaches 87.5% statement coverage and 89.47%
line coverage across empty and populated lists, current and stale anchors, and
all three action intents. The focused collaboration browser workflow passes
comment creation, stale-anchor presentation, re-anchoring, opening, and
resolution.

Full native CI passes all 1,233 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 680,010 B raw and
191,601 B gzip, an increase of 1,867 B raw and 256 B gzip from the claim-list
checkpoint. Direct and unique production package counts remain unchanged at 18
and 150.

## Continued Lit Extraction: Project Publications

The project References collection now uses one bounded `PublicationListPanel`
instead of imperative empty-state, reference-card, metadata-label, and action
rendering. The component owns publication presentation and emits typed open,
Library-management, and metadata-enrichment intents. `WorkspaceApp` retains
context navigation, authorized Library and enrichment operations, refreshes,
and count presentation.

This checkpoint reduces `src/client/app.ts` from 11,009 to 10,984 lines (-25).
The component adds 127 lines and reaches 89.28% statement coverage and 90.9%
line coverage across empty, enrichable, DOI-free, and project-linked reference
states plus all three action intents. Focused browser workflows pass
publication opening, Library management, project-PDF context, and DOI
enrichment.

Full native CI passes all 1,235 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 682,060 B raw and
191,844 B gzip, an increase of 2,050 B raw and 243 B gzip from the
manuscript-comments checkpoint. Direct and unique production package counts
remain unchanged at 18 and 150.

## Continued Lit Extraction: Candidate Queue

The Writing assistant candidate queue now uses one bounded `CandidateListPanel`
instead of imperative empty-state, revision-card, claim-draft, and review-action
rendering. The component owns candidate summary presentation and emits one
typed review-opening intent. `WorkspaceApp` retains generation, canonical
candidate state, context navigation, applicability checks, and decisions.

This checkpoint reduces `src/client/app.ts` from 10,984 to 10,967 lines (-17).
The component adds 78 lines and reaches 85.71% statement coverage and 89.47%
line coverage across empty, revision, and claim-draft states plus known and
unknown selections. Focused browser workflows pass candidate rendering,
opening, stale review, evidence navigation, and evidence-backed application.

Full native CI passes all 1,237 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 682,884 B raw and
192,016 B gzip, an increase of 824 B raw and 172 B gzip from the
project-publications checkpoint. Direct and unique production package counts
remain unchanged at 18 and 150.

## Continued Lit Extraction: Context Tab Overview

The context overflow menu now uses one bounded `ContextTabOverview` instead of
three element references plus imperative visibility, count, row, and close
rendering. The component owns overflow presentation and emits typed activate
and close intents. `WorkspaceApp` retains tab-title resolution, routing,
canonical context state, focus restoration, and transitions.

This checkpoint reduces `src/client/app.ts` from 10,967 to 10,921 lines (-46).
The component adds 116 lines and reaches 86.95% statement coverage and 90.47%
line coverage across hidden, populated, standalone-Library, permanent-tab,
resource-tab, known-action, and rejected-action states. The focused research
context browser workflow passes overflow visibility, activation, closing, and
focus restoration.

Full native CI passes all 1,239 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 683,986 B raw and
192,336 B gzip, an increase of 1,102 B raw and 320 B gzip from the
candidate-queue checkpoint. Direct and unique production package counts remain
unchanged at 18 and 150.

## Continued Lit Extraction: Context Resource Tabs

The dynamic context resource-tab strip now uses one bounded
`ContextResourceTabs` instead of an imperative tab and close-button renderer.
The component owns resource-tab markup, active-state presentation, panel
associations, the shared tab-id contract, and typed activate and close intents.
`WorkspaceApp` retains title resolution, keyboard focus, routing, canonical
context state, panel labelling, and transitions.

This checkpoint reduces `src/client/app.ts` from 10,921 to 10,898 lines (-23).
The component adds 116 lines and reaches 86.95% statement coverage and 90.47%
line coverage across empty, publication, candidate, PDF, active, inactive,
known-action, and rejected-action states. The focused research-context browser
workflow passes tab rendering, activation, closing, keyboard focus, and panel
labelling.

Moving the final browser-side icon use out of `WorkspaceApp` also lets the
browser bundle drop the otherwise unused shared icon-rendering module. The
full native CI passes all 1,241 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 682,761 B raw and
191,653 B gzip, a decrease of 1,225 B raw and 683 B gzip from the
context-tab-overview checkpoint. Direct and unique production package counts
remain unchanged at 18 and 150.

## Continued Lit Extraction: Project Evidence

Project PDFs and annotations now use one bounded `ProjectEvidencePanel` instead
of five element references plus imperative PDF cards, annotation cards,
grouping, counts, visibility, passage links, and stroke controls. The component
owns presentation and local expanded state while emitting typed navigation,
grounding, and mutation intents. `WorkspaceApp` retains API mutations,
confirmations, editor selection, grounding authority, PDF navigation,
refreshes, and toast policy.

This checkpoint reduces `src/client/app.ts` from 10,898 to 10,681 lines (-217).
The component adds 359 lines and reaches 96.22% statement coverage and 96.15%
line coverage across empty, assigned, unassigned, linked, selected, expanded,
PDF, annotation, passage, and fragment-control states. Focused browser
workflows pass PDF opening and removal guards, highlight creation, extension,
editing, geometry adjustment, erasing, deletion, grounding selection,
passage-link presentation, and evidence-backed model navigation.

Full native CI passes all 1,244 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 686,789 B raw and
192,209 B gzip, an increase of 4,028 B raw and 556 B gzip from the
context-resource-tabs checkpoint. Direct and unique production package counts
remain unchanged at 18 and 150.

## Continued Lit Extraction: Project Tree

The Files rail now uses one bounded `ProjectTreePanel` instead of three element
references plus imperative filtering, sorting, folder, file, image, and action
menu rendering. The component owns local filter state, sorted hierarchy
presentation, active and entry labels, keyboard quick-open, and typed file,
folder, and image intents. `WorkspaceApp` retains file and folder mutations,
editor rebinding, include insertion, image operations, API access, and toast
policy.

This checkpoint reduces `src/client/app.ts` from 10,681 to 10,549 lines (-132).
The component adds 229 lines and reaches 89.33% statement coverage and 90%
line coverage across empty, sorted, nested, active, entry, filtered,
quick-open, known-action, and rejected-action states. Focused browser workflows
pass the primary file tree, image upload and insertion, transcluded-file
creation, folder rename, deferred deletion, and undo paths.

Full native CI passes all 1,247 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 688,715 B raw and
192,714 B gzip, an increase of 1,926 B raw and 505 B gzip from the project
evidence checkpoint. Direct and unique production package counts remain
unchanged at 18 and 150.

## Continued Lit Extraction: Manuscript Map

The Writing guide's manuscript map now uses one bounded `ManuscriptMapPanel`
instead of seven element references plus imperative metric, heading-outline,
structural-cue, editing-pass, and editing-cue rendering. The component owns
derived presentation and local editing-purpose state while emitting typed
source-range selection intents. `WorkspaceApp` retains composed-source
derivation and file-qualified editor focus.

This checkpoint reduces `src/client/app.ts` from 10,549 to 10,468 lines (-81).
The component adds 157 lines and reaches 89.65% statement coverage and 92.3%
line coverage across empty and populated maps, all editing purposes, valid
selection, and rejected-range states. A focused browser workflow passes
summary, outline, editing-purpose changes, source-range selection, and editor
focus.

Full native CI passes all 1,249 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 690,331 B raw and
193,100 B gzip, an increase of 1,616 B raw and 386 B gzip from the project-tree
checkpoint. Direct and unique production package counts remain unchanged at 18
and 150.

## Continued Lit Extraction: Library Discovery Results

Manual Library discovery now uses one bounded `LibraryDiscoveryResults`
component instead of imperative provider, metadata, verification-link, and
save-button card rendering. The component owns result presentation and local
save progress while emitting a typed save intent. `WorkspaceApp` retains
provider requests, response validation, CSL import, Library refreshes, and
status policy.

This checkpoint reduces `src/client/app.ts` from 10,468 to 10,439 lines (-29).
The component adds 105 lines and reaches 91.66% statement coverage and 93.1%
line coverage across empty, provider-combined, saving, saved, retry, known
selection, and rejected-selection states. A focused browser workflow passes
federated result presentation, verification, saving, and saved-state feedback
through the manual Library surface.

Full native CI passes all 1,251 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 691,354 B raw and
193,265 B gzip, an increase of 1,023 B raw and 165 B gzip from the
manuscript-map checkpoint. Direct and unique production package counts remain
unchanged at 18 and 150.

## Continued Lit Extraction: Citation Network

The citation network now uses one bounded `CitationNetworkPanel` instead of two
element references plus imperative SVG graph, source-card, edge, assertion,
provenance, review, expansion, candidate, and save-progress rendering. The
component owns derived presentation and local candidate progress while
emitting typed expansion, review, and candidate-save intents. `WorkspaceApp`
retains network requests, prompts, mutations, response validation, refreshes,
and toast policy.

This checkpoint reduces `src/client/app.ts` from 10,439 to 10,207 lines (-232).
The component adds 315 lines and reaches 94.52% statement coverage and 96.82%
line coverage across loading, empty, filtered, connected, truncated, reviewed,
expanded, saturated, saving, known-intent, and rejected-intent states. The
focused browser workflow passes assertion recording, graph and accessible-list
rendering, project filtering, review, expansion, candidate verification,
saving, and provenance feedback.

Full native CI passes all 1,253 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 693,504 B raw and
193,712 B gzip, an increase of 2,150 B raw and 447 B gzip from the Library
discovery checkpoint. Direct and unique production package counts remain
unchanged at 18 and 150.

## Continued Lit Extraction: Preview Presentation

Preview file-mode status, validation summary, unavailable state, and diagnostic
cards now use bounded `PreviewContextStatus` and `PreviewDiagnosticsPanel`
components instead of three element references and imperative composition and
Markdown diagnostic rendering. The diagnostic component owns source-map
resolution and emits typed file-qualified range intents. `WorkspaceApp`
retains Markdown loading and rendering, composition, file selection, and editor
focus.

This checkpoint reduces `src/client/app.ts` from 10,207 to 10,173 lines (-34).
The two components add 154 lines, while a shared five-line source-map helper
replaces the coordinator-local implementation. They reach 81.08% statement
coverage and 84.37% line coverage across default and updated status,
unavailable, project, mapped-renderer, fallback-renderer, selectable, and
rejected-selection states. Focused browser workflows pass composed and isolated
file status, renderer diagnostics, composition diagnostics, source navigation,
and unavailable recovery behavior.

Full native CI passes all 1,256 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 694,763 B raw and
194,053 B gzip, an increase of 1,259 B raw and 341 B gzip from the citation
network checkpoint. Direct and unique production package counts remain
unchanged at 18 and 150.

## Continued Lit Extraction: Publication Intake

Inline DOI intake now uses one bounded `PublicationIntakePanel` instead of
eleven element references plus imperative form, metadata-review,
linked-reference, visibility, busy, status, and focus updates. The component
owns local DOI and citation-key values and emits typed preview, accept, cancel,
and reference-opening intents. `WorkspaceApp` retains the XState workflow,
validated API requests, acceptance mutation, resource refresh, navigation, and
toast policy.

This checkpoint reduces `src/client/app.ts` from 10,173 to 10,129 lines (-44).
The component adds 208 lines. The focused browser workflow passes DOI lookup,
reviewed metadata, cancellation, repeated lookup, acceptance, linked-reference
presentation, and stable publication navigation. The full native CI gate passes
1,258 unit/coverage tests, 120 Worker integration tests, and 74 browser tests.
The component records 82.92% statement and 87.87% line coverage; the browser
workflow additionally exercises its focus handoffs.

The browser application artifact grows from 694,763 B raw / 194,053 B gzip to
698,319 B raw / 194,629 B gzip (+3,556 B raw / +576 B gzip). Direct and unique
production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: LaTeX Import

The LaTeX archive workflow now uses a bounded `LatexImportPanel` instead of ten
element references, two coordinator fields, and imperative root-option,
converted-file, diagnostic, visibility, readiness, busy, status, and local
input updates. The component owns the reviewed preview identity and emits typed
preview, confirmation, and cancel intents. `WorkspaceApp` retains validated
preview and project-creation requests plus successful navigation.

This checkpoint reduces `src/client/app.ts` from 10,129 to 10,000 lines (-129).
The component adds 293 lines. Component tests cover initial, ambiguous-root,
converted, blocking-diagnostic, failure, preview, confirmation, cancellation,
root-change invalidation, and oversized-archive states. The component records
82.1% statement and 85.88% line coverage.

Full native CI passes all 1,261 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 698,319 B raw
/ 194,629 B gzip to 701,258 B raw / 194,976 B gzip (+2,939 B raw / +347 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Export Statistics

The export dialog's publication statistics now use a bounded
`ExportStatisticsPanel` instead of coordinator-owned total, explanatory,
group, row, and empty-state DOM assembly. `WorkspaceApp` retains composition
and the canonical `PublicationWordStatistics` projection; the component owns
only its read-only presentation.

This checkpoint reduces `src/client/app.ts` from 10,000 to 9,952 lines (-48).
The component adds 81 lines. Component tests cover loading, populated, and
empty-group states. The focused browser export workflow passes live totals and
the existing export-dialog handoff. The component records 83.33% statement and
87.5% line coverage.

Full native CI passes all 1,262 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 701,258 B raw
/ 194,976 B gzip to 701,516 B raw / 195,023 B gzip (+258 B raw / +47 B gzip).
Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Knowledge Connections

The authoring Map's accessible connection list now uses a bounded
`KnowledgeConnectionsPanel` instead of two element references and imperative
edge-card, relationship-label, resource-link, count, and empty-state rendering.
The component emits typed resource-selection intents. `WorkspaceApp` retains
knowledge-graph derivation and all cross-resource navigation policy.

This checkpoint reduces `src/client/app.ts` from 9,952 to 9,918 lines (-34).
The component adds 88 lines. Component tests cover empty, linked, labelled,
unresolved-edge, valid-selection, and rejected-selection states. The focused
browser workflow passes annotation, claim, candidate, and typed-connection
presentation. The component records 86.95% statement and 90% line coverage.

Full native CI passes all 1,264 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 701,516 B raw
/ 195,023 B gzip to 702,559 B raw / 195,079 B gzip (+1,043 B raw / +56 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Assistant Task Setup

Writing-assistant task setup now uses a bounded `AssistantTaskPanel` instead of
eighteen element references and imperative operation, target-scope, rhetorical
purpose, claim-relation, structured-table, instruction-default, copy,
visibility, target-preview, and readiness updates. The component owns local
task values and emits typed operation, target, input, and generation intents.
`WorkspaceApp` retains editor-target resolution, evidence selection, model
requests, XState workflow state, result handling, and status policy.

This checkpoint reduces `src/client/app.ts` from 9,918 to 9,834 lines (-84).
The component adds 263 lines. Component tests cover every operation-specific
presentation, local values, readiness, typed changes, and generation gating.
The focused browser workflow passes revision, clarity drill, ideation,
rhetorical phrasing, structured table, reference discovery, target scope, and
generation behavior. The component records 94.33% statement and 96.07% line
coverage.

Full native CI passes all 1,266 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 702,559 B raw
/ 195,079 B gzip to 706,518 B raw / 196,007 B gzip (+3,959 B raw / +928 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: PDF Highlight Import

Private PDF highlight detection and review now use a bounded
`PdfHighlightImportPanel` instead of five element references, imperative
candidate-card rendering, DOM-based selection and note collection, and scan
and import busy updates. The component owns local review values and emits typed
detect, import, and cancel intents. `WorkspaceApp` retains PDF inspection,
duplicate filtering, active-artifact identity, mutation, refresh, and toast
policy.

This checkpoint reduces `src/client/app.ts` from 9,834 to 9,764 lines (-70).
The component adds 209 lines. Component tests cover default, scanning, empty,
mixed native and flattened, truncated, error, importing, completion, selection,
note editing, and typed action states. The focused browser workflow passes
flattened-highlight detection, note review, atomic import, refresh, and the
surrounding private-annotation workflow. The component records 93.1% statement
and 95.91% line coverage.

Full native CI passes all 1,268 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 706,518 B raw
/ 196,007 B gzip to 708,543 B raw / 196,840 B gzip (+2,025 B raw / +833 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Project File Dialog

File and folder creation and rename setup now use a bounded
`ProjectFileDialog` instead of seven element references and imperative title,
help, path, placeholder, action-label, focus, and cancellation handling. The
component emits a typed, trimmed save intent. `WorkspaceApp` retains resource
availability, remembered include-caret capture, API mutation, selection,
refresh, and toast policy.

This checkpoint reduces `src/client/app.ts` from 9,764 to 9,721 lines (-43).
The component adds 141 lines. Component tests cover all five operation modes,
file and folder classification, light-DOM ownership, and trimmed typed save
intents. The focused browser workflow passes file and folder creation, rename,
transclusion insertion, selection, and Preview refresh behavior. The component
records 78% statement and 80% line coverage.

Full native CI passes all 1,272 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 708,543 B raw
/ 196,840 B gzip to 709,962 B raw / 197,216 B gzip (+1,419 B raw / +376 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Project Template Save Dialog

Personal-template promotion now uses a bounded `ProjectTemplateSaveDialog`
instead of seven element references and imperative replacement-option, name,
description, status, focus, and cancellation handling. The component owns local
form values and emits typed create or replacement save intents. `WorkspaceApp`
retains catalog refresh, hidden-template policy, seed capture, API mutation, and
toast policy.

This checkpoint reduces `src/client/app.ts` from 9,721 to 9,688 lines (-33).
The component adds 183 lines. Component tests cover loading, ready, error,
create, replacement, input, modal reuse, focus, cancellation, and typed save
states. The focused browser workflow passes built-in selection, personal
template promotion, project creation, and saved-template reuse. The component
records 89.09% statement and 91.3% line coverage.

Full native CI passes all 1,276 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 709,962 B raw
/ 197,216 B gzip to 712,675 B raw / 197,718 B gzip (+2,713 B raw / +502 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Library Discovery Search

Scholarly discovery setup now uses a bounded `LibraryDiscoverySearch` instead
of six element references and imperative form-value, submit-state, progress,
count, empty, and error handling. The component owns query collection and emits
a typed `ReferenceDiscoveryQuery`. `WorkspaceApp` retains provider requests,
response validation, result presentation, import mutation, and Library refresh
policy.

This checkpoint reduces `src/client/app.ts` from 9,688 to 9,665 lines (-23).
The component adds 129 lines. Component tests cover initial, searching,
singular, plural, empty, error, typed-query, and duplicate-submit states. The
focused browser workflow passes provider search, result verification, save
mutation, and saved-state presentation. The component records 85.29% statement
and 86.66% line coverage.

Full native CI passes all 1,280 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 712,675 B raw
/ 197,718 B gzip to 714,699 B raw / 198,282 B gzip (+2,024 B raw / +564 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Workspace Settings

Project settings now use a bounded `WorkspaceSettingsPanel` instead of fifteen
element references and imperative entry-file option, publication-profile,
archive-label, template-visibility, modal, and nested GitHub-review
coordination. The component emits typed save, template, duplicate, archive, and
delete intents. `WorkspaceApp` retains authorization, persistence, navigation,
GitHub requests, destructive confirmation, catalog refresh, and toast policy.

This checkpoint reduces `src/client/app.ts` from 9,665 to 9,635 lines (-30).
The component adds 283 lines. Component tests cover active, archived, demo-safe,
save, template, duplicate, archive, delete, modal reuse, GitHub event
forwarding, value collection, and missing-control states. Focused browser
workflows pass modal lifecycle, entry-file changes, GitHub initialization, and
personal-template promotion. The component records 83.67% statement and 83.33%
line coverage.

Full native CI passes all 1,284 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 714,699 B raw
/ 198,282 B gzip to 721,355 B raw / 199,494 B gzip (+6,656 B raw / +1,212 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Reference Library Filters

Reference Library filtering now uses a bounded
`ReferenceLibraryFilterPanel` instead of eight element references, seven
control listeners, coordinator-local value validation, dynamic type-option
rendering, and result-count updates. The component owns query and facet state,
validated defaults, reset behavior, and a typed change event. `WorkspaceApp`
retains canonical filtering, linked-reference projection, result-card
rendering, and reference navigation.

This checkpoint reduces `src/client/app.ts` from 9,635 to 9,567 lines (-68).
The component adds 202 lines. Component tests cover dynamic types, counts,
ordinary and query-preserving resets, all seven filter values, typed change
events, and invalid-value fallbacks. Focused browser workflows pass interactive
tag, linkage, and query filtering; exact-PDF duplicate reveal; and legacy
BibTeX Library search. The component records 91.89% statement and 94.28% line
coverage.

Full native CI passes all 1,286 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 721,355 B raw
/ 199,494 B gzip to 724,344 B raw / 200,038 B gzip (+2,989 B raw / +544 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Model Provider Settings

Local-model preferences now use a bounded `ModelProviderSettings` component
instead of six element references, duplicate preference listeners and status
synchronization, coordinator-local stored-value validation, and imperative
model-option rendering. The component owns connection, endpoint, model, and
reasoning values, discovery progress, and typed change and discovery intents.
`WorkspaceApp` retains browser-local persistence, provider discovery, request
construction, generation workflows, and assistant status policy.

This checkpoint reduces `src/client/app.ts` from 9,567 to 9,485 lines (-82).
The component adds 218 lines. Component tests cover saved values, dynamic and
deduplicated model choices, connection defaults, endpoint and reasoning
changes, status-bearing change events, discovery intent, busy state, and
light-DOM ownership. Focused browser workflows pass companion selection and
persistence, live model discovery and selection, and evidence-grounded
generation with the established `none` reasoning default. The component
records 85.48% statement and 89.28% line coverage.

Full native CI passes all 1,288 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 724,344 B raw
/ 200,038 B gzip to 727,427 B raw / 200,522 B gzip (+3,083 B raw / +484 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Claim Dialog

Claim creation and editing now use a bounded `ClaimDialog` instead of eight
element references, one coordinator field, imperative evidence-option
rendering, DOM-based selection collection, and modal configuration. The
component owns proposition and note values, evidence relation and annotation
selection, modal lifecycle, and a typed save intent. `WorkspaceApp` retains
evidence prerequisites, API mutation, refreshes, and toast policy.

This checkpoint reduces `src/client/app.ts` from 9,485 to 9,435 lines (-50).
The component adds 196 lines. Component tests cover create and edit
presentation, annotation comment and quote fallbacks, proposition and note
changes, relation validation, evidence selection and removal, light-DOM
ownership, and typed create-save intent. The focused browser workflow passes
claim creation, editing, evidence replacement, model grounding, and reviewed
prose generation. The component records 79.16% statement and 79.54% line
coverage.

Full native CI passes all 1,290 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 727,427 B raw
/ 200,522 B gzip to 730,164 B raw / 200,927 B gzip (+2,737 B raw / +405 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Library PDF Upload Status

PDF batch presentation now uses a bounded `LibraryPdfUploadStatus` instead of
imperative progress, outcome-row, error, duplicate-action, and retry rendering.
The component owns queue progress, per-file state, duplicate reveal actions,
retry availability, busy and error presentation, and typed retry and reveal
intents. `WorkspaceApp` retains file and drop input, queue execution, upload
transport, failed-file ownership, Library refreshes, and toast policy.

This checkpoint reduces `src/client/app.ts` from 9,435 to 9,387 lines (-48).
The component adds 122 lines. Component tests cover initial, queued, uploading,
added, duplicate, failed, retry, busy, error, and typed reveal states. Focused
browser workflows pass bounded partial-success intake, failed-file retry,
exact-PDF duplicate reconciliation, archived-source restoration, and Library
focus. The component records 91.48% statement and 92.1% line coverage.

Full native CI passes all 1,292 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 730,164 B raw
/ 200,927 B gzip to 731,333 B raw / 201,164 B gzip (+1,169 B raw / +237 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Web Source Panels

Website intake and readable-text snapshot comparison now use bounded
`WebSourceCapture` and `WebSnapshotComparisonPanel` components instead of three
element references, coordinator-owned submit and reset state, and imperative
comparison heading and diff-hunk rendering. The components own the local URL
value, typed capture intent, reset behavior, and comparison presentation.
`WorkspaceApp` retains capture and comparison requests, Valibot response
validation, Library refreshes, and toast policy.

This checkpoint reduces `src/client/app.ts` from 9,387 to 9,367 lines (-20).
The components add 129 lines. Component tests cover light-DOM ownership, empty,
identical, changed, and truncated comparison presentation, URL changes, typed
capture intent, and reset behavior. The full browser shell suite remains green.
The components record 96.42% statement and 100% line coverage.

Full native CI passes all 1,295 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 731,333 B raw
/ 201,164 B gzip to 732,833 B raw / 201,394 B gzip (+1,500 B raw / +230 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Project Annotation Form

Project-PDF annotation editing now uses a bounded `ProjectAnnotationForm`
instead of eight element references, imperative PDF-option and captured-field
updates, coordinator-owned selection status rendering, and submitter
detection. The component owns visible-PDF choices, captured page and quotation
context, optional note input, status copy, and typed save and link intents.
`WorkspaceApp` retains highlight geometry and persistence, annotation identity,
manuscript selection and linking, refreshes, and toast policy.

This checkpoint reduces `src/client/app.ts` from 9,367 to 9,336 lines (-31).
The component adds 193 lines. Component tests cover empty and populated PDF
choices, current-PDF selection and fallback, captured and saved annotation
values, local field changes, status presentation, and typed save and link
intents. Focused browser workflows pass automatic highlight save, extension,
undo, erasure, deletion, and evidence movement into reviewed model prose. The
component records 100% statement and line coverage.

Full native CI passes all 1,298 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 732,833 B raw
/ 201,394 B gzip to 735,432 B raw / 201,905 B gzip (+2,599 B raw / +511 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Consolidation: Manuscript Comments

The existing `ManuscriptCommentList` now owns the selected-passage comment
composer as well as comment history. This removes three composer element
references, coordinator-owned submit binding, body collection, reset, and saved
status updates without introducing another custom element. The panel owns body
and status state plus typed create, open, re-anchor, and resolve intents.
`WorkspaceApp` retains manuscript selection and revision checks, mutations,
refreshes, navigation, and toast policy.

This checkpoint reduces `src/client/app.ts` from 9,336 to 9,335 lines (-1) and
adds 39 lines to the existing component. Component tests now cover comment body
capture, typed creation, saved reset and status alongside empty, open, stale,
resolved, navigation, re-anchor, and resolve states. The focused two-writer
browser workflow passes comment creation, re-anchoring, navigation, and
resolution. The consolidated panel records 90.62% statement and 92.59% line
coverage.

Full native CI passes all 1,299 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 735,432 B raw
/ 201,905 B gzip to 736,299 B raw / 202,063 B gzip (+867 B raw / +158 B gzip).
Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Consolidation: Citation Assertions

The existing `CitationNetworkPanel` now owns manual assertion intake alongside
the citation graph and review workflow. This removes four assertion-form element
references, coordinator-owned submit binding, imperative source-option
rendering, value collection, and polarity normalization without introducing
another custom element. The panel owns reference choices and a typed manual
record intent. `WorkspaceApp` retains validation, provenance-bearing mutation,
network requests and refreshes, prompts, and toast policy.

This checkpoint reduces `src/client/app.ts` from 9,335 to 9,311 lines (-24) and
adds 77 lines to the existing component. Component tests now cover reference
replacement and selection fallback, source and polarity changes, and the typed
manual assertion alongside loading, network, review, expansion, and candidate
states. The focused browser workflow passes manual assertion recording and
review in the accessible shared network. The consolidated panel records 95.69%
statement and 97.43% line coverage.

Full native CI passes all 1,300 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 736,299 B raw
/ 202,063 B gzip to 737,836 B raw / 202,326 B gzip (+1,537 B raw / +263 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Consolidation: New Project Composer

The existing `ProjectStartingPointBrowser` now owns the complete new-project
form: title, starting-point choices and preview, loading and error status,
creation readiness, and cancel and import actions. This removes seven element
references and their coordinator-owned form and button bindings. The component
emits typed create, cancel, GitHub import, LaTeX import, project-preview, and
template-delete intents. `WorkspaceApp` retains dialog focus management,
template and project requests, deletion, project and import workflows,
navigation, and toast policy.

This checkpoint reduces `src/client/app.ts` from 9,311 to 9,290 lines (-21) and
adds 89 lines to the existing component. Component tests cover empty, template,
and project choices, title and creation intents, cancel and import actions,
loading and error presentation, template deletion, and project-source
acceptance and rejection. The focused browser workflow passes built-in,
promoted personal, and existing-project starting points together with dialog
focus and import behavior. The consolidated component records 81.73% statement
and 83.65% line coverage.

Full native CI passes all 1,303 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 737,836 B raw
/ 202,326 B gzip to 739,424 B raw / 202,590 B gzip (+1,588 B raw / +264 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Library PDF Annotation Forms

A bounded `LibraryPdfAnnotationForms` now owns private-highlight, page-note, and
selected-markup composer values and visibility. This replaces seventeen raw
element references, three submit bindings, cancel and markup-action bindings,
imperative form visibility, and DOM-based value collection with one typed action
stream. `WorkspaceApp` retains the PDF annotation state machine, captured
selection and drawing geometry, active resource identity, mutations, refreshes,
inspector policy, and toasts.

This checkpoint reduces `src/client/app.ts` from 9,290 to 9,235 lines (-55).
The component adds 295 lines. Component tests cover light-DOM ownership,
highlight, note, and markup visibility, current field values, typed save and
drawing-style intents, and every cancellation and selected-markup action.
Focused browser workflows pass standalone private-PDF annotation and export,
linked-PDF sharing, highlight extension and note editing, selected markup, and
drawing-style updates. The component records 82.6% statement and 85.93% line
coverage.

Full native CI passes all 1,306 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 739,424 B raw
/ 202,590 B gzip to 742,734 B raw / 203,460 B gzip (+3,310 B raw / +870 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Consolidation: GitHub Import Submission

The existing `GitHubImportPanel` now owns its form boundary and preview
submission in addition to picker values, readiness, preview status, and cancel
and confirmation actions. This removes the last coordinator-owned
`HTMLFormElement`, its submit binding, and event cancellation in favor of a
typed preview intent. Connection, installation, repository, branch, preview,
and project-creation requests remain in `WorkspaceApp`.

This checkpoint reduces `src/client/app.ts` from 9,235 to 9,233 lines (-2) and
adds 15 lines to the existing component. New component tests cover light-DOM
form ownership, connected and disconnected picker lifecycles, selected account,
repository, and branch projection, preview and creation states, long preview
rendering, and typed preview, cancel, and confirmation intents. The focused
GitHub connection-gating and import workflow passes. The component records
81.73% statement and 87.61% line coverage, up from no direct unit coverage.

Full native CI passes all 1,309 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact changes from 742,734 B
raw / 203,460 B gzip to 742,994 B raw / 203,420 B gzip (+260 B raw / -40 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Library PDF Annotation Toolbar

A bounded `LibraryPdfAnnotationToolbar` now owns active-tool presentation,
drawing color and width, undo and export availability, annotation count, and
inspector-expanded state. This replaces twelve raw element references, tool,
input, undo, export, and inspector bindings, and imperative toolbar updates with
one typed action stream. `WorkspaceApp` retains PDF gestures, the annotation
state machine, drawing persistence, annotated export, inspector policy, and
toasts.

This checkpoint reduces `src/client/app.ts` from 9,233 to 9,202 lines (-31).
The component adds 192 lines. Component tests cover light-DOM ownership, drawing
style updates, empty and populated availability, inspector and active-tool
state, all four tool intents, undo, export, and inspector actions. Focused
browser workflows pass standalone and linked private-PDF annotation, tool
switching, drawing, undo, highlight editing, inspector focus, and annotated
export. The component records 75.67% statement and 80% line coverage.

Full native CI passes all 1,312 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 742,994 B raw
/ 203,420 B gzip to 749,873 B raw / 205,513 B gzip (+6,879 B raw / +2,093 B
gzip). This includes Lit's static icon-rendering directive and the toolbar
template. Direct and unique production package counts remain unchanged at 18
and 150.

## Continued Lit Extraction: Unidentified PDF Queue

A bounded `UnidentifiedPdfList` now owns the compatibility queue for PDF
artifacts that are not yet linked to a reference. This replaces two raw element
references, imperative section, count, empty-state, card, and reference-option
rendering, and per-card event binding with one typed identification intent.
`WorkspaceApp` retains identification mutations, library refreshes, and toasts.

This checkpoint reduces `src/client/app.ts` from 9,202 to 9,181 lines (-21).
The component adds 117 lines. Component tests cover empty and populated
projection, selected-reference identification, and stale-selection pruning.
The focused linked-reference PDF browser workflow passes. The component records
82.75% statement and 84% line coverage.

Full native CI passes all 1,315 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 749,873 B raw
/ 205,513 B gzip to 751,362 B raw / 205,781 B gzip (+1,489 B raw / +268 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Library Reference Summaries

A bounded `LibraryReferenceSummary` now owns each reference result's title,
compact metadata, PDF action, and project-link presentation. This replaces two
imperative render helpers and their per-card PDF, link, and unlink handlers with
one delegated typed action stream. `WorkspaceApp` retains result-card assembly,
PDF presentation, project-link mutations, metadata editing and refinement,
Library refreshes, and toasts.

This checkpoint reduces `src/client/app.ts` from 9,181 to 9,146 lines (-35).
The component adds 126 lines. Component tests cover light-DOM ownership,
standalone, provisional, PDF, unlinked-workspace, and linked-workspace
projection, plus all three typed action variants. Focused browser workflows
pass linked-reference PDF sharing and provider metadata refinement. The
component records 72.72% statement and 75% line coverage.

Full native CI passes all 1,317 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 751,362 B raw
/ 205,781 B gzip to 752,814 B raw / 205,980 B gzip (+1,452 B raw / +199 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Library Reference Personal Fields

A bounded `LibraryReferencePersonalFields` now owns tags, collections,
archive-state presentation, reading state, and private-note composition. This
replaces six imperative form and select helpers, per-card handlers, and
coordinator DOM value collection with one delegated typed action stream.
`WorkspaceApp` retains persistence, archive confirmation, Library refreshes,
and toasts.

This checkpoint reduces `src/client/app.ts` from 9,146 to 9,067 lines (-79).
The component adds 232 lines. Component tests cover empty and populated
light-DOM state, organization input ownership, and all five action variants.
The focused linked-reference browser workflow passes tags, filtering, private
notes, project sharing, and accessible field contracts. The component records
68.18% statement and 69.76% line coverage.

Full native CI passes all 1,319 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 752,814 B raw
/ 205,980 B gzip to 755,538 B raw / 206,407 B gzip (+2,724 B raw / +427 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Library Metadata Editor

A bounded `LibraryReferenceMetadataEditor` now owns manual bibliographic
values, refinement progress, inline PDF suggestions, grouped provider matches,
work and field selections, and application payload projection. This removes
the coordinator's metadata-field and suggestion maps, refinement panel target,
eight imperative render helpers, and DOM-based selection collection.
`WorkspaceApp` retains PDF extraction, provider requests, the XState refinement
workflow, persistence, Library refreshes, and toasts.

This checkpoint reduces `src/client/app.ts` from 9,067 to 8,777 lines (-290).
The component adds 437 lines. Component tests cover hidden, progress, review,
manual save, refinement, PDF application, and provider application states.
Focused browser workflows pass local PDF metadata review, mixed-provider field
selection, cached preview presentation, and DOI import review. The component
records 74.37% statement and 78.67% line coverage.

Full native CI passes all 1,321 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 755,538 B raw
/ 206,407 B gzip to 759,750 B raw / 206,892 B gzip (+4,212 B raw / +485 B
gzip). The coordinator waits for reference-card component updates before
restoring Library scroll state. Direct and unique production package counts
remain unchanged at 18 and 150.

## Continued Lit Extraction: Library Reference PDF Rows

A bounded `LibraryReferencePdfRows` now owns attached-PDF presentation,
signed-in member access context, rights choices, and primary-versus-secondary
refinement actions. This replaces two imperative render helpers and their
per-artifact open, rights, and refinement handlers with one delegated typed
action stream. `WorkspaceApp` retains PDF presentation, rights persistence,
extraction, refinement workflow, Library refreshes, and toasts.

This checkpoint reduces `src/client/app.ts` from 8,777 to 8,742 lines (-35).
The component adds 93 lines. Component tests cover empty, linked,
multi-artifact, open, validated-rights, and secondary-refinement states.
Focused browser workflows pass linked-PDF access, opening, Library scroll
restoration, and provider refinement. The component records 78.57% statement
and 80% line coverage.

Full native CI passes all 1,323 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 759,750 B raw
/ 206,892 B gzip to 761,155 B raw / 207,102 B gzip (+1,405 B raw / +210 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Library Reference Research Rows

A bounded `LibraryReferenceResearchRows` now composes attached PDFs with
private notes, highlights, and immutable web captures. It owns research share
state, capture diagnostics and downloads, prior-version comparison controls,
project-pin availability, and recapture presentation. This replaces six
imperative render helpers and their per-row handlers with one delegated typed
action stream. `WorkspaceApp` retains persistence, web requests, project-pin
mutations, Library refreshes, and toasts.

This checkpoint reduces `src/client/app.ts` from 8,742 to 8,635 lines (-107).
The component adds 183 lines. Component tests cover empty, populated, linked,
shared, complete, incomplete, valid-timestamp, invalid-timestamp, PDF-composed,
and all five action variants. The component records 77.41% statement and
78.57% line coverage. The focused linked-reference browser workflow passes PDF
access, note sharing, accessible fields, filtering, and deterministic Library
scroll restoration.

The browser application artifact grows from 761,155 B raw / 207,102 B gzip to
763,230 B raw / 207,491 B gzip (+2,075 B raw / +389 B gzip). Direct and unique
production package counts remain unchanged at 18 and 150. Full native CI
passes all 1,325 unit/coverage tests, 120 Workers-runtime tests, and 74 browser
tests.

## Continued Lit Extraction: Editor Insert Menu

A bounded `EditorInsertMenu` now owns the static scholarly-syntax choices,
relative include-file option rendering, include empty state, native titles,
and local menu closing. This replaces two imperative include-list helpers,
DOM-target inspection, and coordinator menu-state mutations with typed syntax
and include-file intents. `WorkspaceApp` retains collaborative passage and
caret resolution, Yjs edits, and notifications.

This checkpoint reduces `src/client/app.ts` from 8,635 to 8,596 lines (-39).
The component adds 100 lines. Component tests cover fallback, empty,
single-file, nested relative-file, syntax, and include intent states. It records
73.07% statement and 81.81% line coverage. The focused compact-editor browser
workflow passes layout, include-label geometry, scholarly-syntax insertion,
relative project-file insertion, and menu closing.

The browser application artifact grows from 763,230 B raw / 207,491 B gzip to
764,185 B raw / 207,627 B gzip (+955 B raw / +136 B gzip). Direct and unique
production package counts remain unchanged at 18 and 150. Full native CI
passes all 1,327 unit/coverage tests, 120 Workers-runtime tests, and 74 browser
tests.

## Coordinator Extraction: Workspace Layout Manager

A bounded `WorkspaceLayoutManager` now owns project-rail collapse and width,
authoring/context pane width, pointer capture and cancellation, keyboard
resizing and reset, responsive bounds, ARIA values, context-specific local
storage, and PDF resize notification. This removes eleven layout and persistence
helpers from `WorkspaceApp`; the coordinator retains URL-backed layout choice,
active context identity, and PDF-only resource opening.

This checkpoint reduces `src/client/app.ts` from 8,596 to 8,397 lines (-199).
The manager adds 235 lines. Unit tests cover stored collapse state, focus
transfer, responsive rail bounds, pointer persistence and cancellation,
keyboard resizing and reset, context-specific pane widths, and PDF resize
notifications. It records 92.3% statement, 100% function, and 97.52% line
coverage. Focused browser workflows pass rail collapse/restoration, pointer and
keyboard resizing, responsive clamping, context switching, pane persistence,
and native reset behavior.

The browser application artifact grows from 764,185 B raw / 207,627 B gzip to
764,696 B raw / 207,939 B gzip (+511 B raw / +312 B gzip). Direct and unique
production package counts remain unchanged at 18 and 150. Full native CI
passes all 1,330 unit/coverage tests, 120 Workers-runtime tests, and 74 browser
tests.

## Continued Lit Extraction: Library PDF Annotation List

A bounded `LibraryPdfAnnotationList` now owns the private reader's saved text
highlight and PDF-markup cards, empty state, comments, page and markup labels,
project citation and research-share availability, and action labels. It emits
one typed stream for navigation, editing, citation, sharing, revocation, and
deletion. `WorkspaceApp` retains PDF navigation, annotation mutations, project
citation and research-share workflows, refreshes, and notifications.

This checkpoint reduces `src/client/app.ts` from 8,397 to 8,347 lines (-50).
The component adds 153 lines. Component tests cover empty, workspace and
private modes, linked and unlinked references, shared and unshared highlights,
comments, notes, drawings, missing-artifact behavior, and all eight action
variants. It records 66.66% statement and line coverage. Focused browser
workflows pass private PDF import, annotation and export plus linked-reference
member access and research sharing.

The browser application artifact grows from 764,696 B raw / 207,939 B gzip to
766,768 B raw / 208,428 B gzip (+2,072 B raw / +489 B gzip). Direct and unique
production package counts remain unchanged at 18 and 150. Full native CI
passes all 1,332 unit/coverage tests, 120 Workers-runtime tests, and 74 browser
tests.

## Continued Lit Extraction: Library Reference List

A bounded `LibraryReferenceList` now owns filtered result and empty-state
rendering, reference-card and details composition, persistent expansion state,
nested component configuration and update settlement, and addressed-card focus.
Nested summary, metadata, personal-field, PDF, and research-row actions continue
to bubble to `WorkspaceApp`, which retains canonical filtering, mutations,
requests, refreshes, and notification policy.

This checkpoint reduces `src/client/app.ts` from 8,347 to 8,229 lines (-118).
The component adds 158 lines. Its isolated test covers loading, empty-Library,
filtered-empty, and populated workspace presentation; it records 23.88%
statement and 25.92% line coverage because DOM composition, update settlement,
and focus require the real browser boundary. Focused browser workflows pass
addressed-card focus, nested linked-PDF sharing, archived duplicate reveal, and
metadata refinement.

The browser application artifact grows from 766,768 B raw / 208,428 B gzip to
767,765 B raw / 208,571 B gzip (+997 B raw / +143 B gzip). Direct and unique
production package counts remain unchanged at 18 and 150. Full native CI
passes all 1,333 unit/coverage tests, 120 Workers-runtime tests, and 74 browser
tests.

## Continued Lit Extraction: Source Completion

A bounded `SourceCompletion` now owns citation and include option markup,
optional action labels, pointer focus preservation, hover and keyboard
selection, active-descendant state, selected-option scrolling, dismissal, and
typed acceptance intents. `WorkspaceApp` retains completion-context detection,
candidate ranking, private-Library linking, Yjs edits, caret restoration, and
menu positioning.

This checkpoint reduces `src/client/app.ts` from 8,229 to 8,132 lines (-97).
The component adds 119 lines. Component tests cover empty and action-labelled
presentation, show and hide ARIA state, keyboard movement, acceptance,
dismissal, composition gating, and both action variants. It records 77.55%
statement and 80.43% line coverage. The focused browser workflow passes
relative include suggestions, listbox presentation, option selection, and
collaborative insertion.

The browser application artifact grows from 767,765 B raw / 208,571 B gzip to
768,037 B raw / 208,636 B gzip (+272 B raw / +65 B gzip). Direct and unique
production package counts remain unchanged at 18 and 150. Full native CI
passes all 1,336 unit/coverage tests, 120 Workers-runtime tests, and 74 browser
tests.

## Continued Lit Extraction: Library PDF Markup Layer

A bounded `LibraryPdfMarkupLayer` now owns saved and draft drawing SVG, note
pins, selected state, open note cards, live draft geometry updates, note
movement, focus restoration, and a typed note-card close intent.
`WorkspaceApp` retains pointer capture, gesture and annotation-machine state,
shape recognition, normalized geometry, persistence, and workflow transitions.

This checkpoint reduces `src/client/app.ts` from 8,132 to 8,055 lines (-77).
The component adds 159 lines. Component tests cover empty, saved and draft
drawings, note drafts, selected notes, open cards, multiple tools, and the typed
close intent. It records 57.14% statement and 62.06% line coverage. The focused
private-PDF browser workflow passes drawing, note placement and movement,
note-card focus, deletion, highlight import, and annotated export.

The browser application artifact grows from 768,037 B raw / 208,636 B gzip to
768,775 B raw / 208,825 B gzip (+738 B raw / +189 B gzip). Direct and unique
production package counts remain unchanged at 18 and 150. Full native CI
passes all 1,338 unit/coverage tests, 120 Workers-runtime tests, and 74 browser
tests.

## Continued Lit Extraction: Library PDF Project Use

A bounded `LibraryPdfProjectUse` now owns unidentified, unlinked, and linked
private-PDF presentation, member-versus-public capability copy, citation
preview, and a typed reference-link intent. `WorkspaceApp` retains canonical
reference and project-link lookup, the linking mutation, refreshes, and
notification policy.

This checkpoint reduces `src/client/app.ts` from 8,055 to 8,004 lines (-51) and
removes four single-use DOM helpers. The component adds 82 lines. Component
tests cover fallback, unidentified, unlinked, linked, citation-alias, and typed
link-intent states. It records 81.81% statement and 84.21% line coverage. The
focused linked-reference browser workflow passes the unlinked-to-linked
transition, member access, public-link exclusion, and explicit research
sharing.

The browser application artifact grows from 768,775 B raw / 208,825 B gzip to
769,285 B raw / 208,855 B gzip (+510 B raw / +30 B gzip). Styles grow by 63 B
raw / 15 B gzip. Direct and unique production package counts remain unchanged
at 18 and 150. Full native CI passes all 1,340 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Collaborator Selection List

A bounded `CollaboratorSelectionList` now owns current-revision and current-file
filtering, remote caret and range presentation, accessible source excerpts, and
missing-file fallbacks. It also supplies the filtered remote ranges used by the
editor overlay so list and highlight eligibility cannot drift. `WorkspaceApp`
retains local-author selection, collaboration transport, revision authority,
and editor-highlight placement.

This checkpoint reduces `src/client/app.ts` from 8,004 to 7,994 lines (-10).
The component adds 69 lines. Component tests cover fallback and empty states,
stale revisions, ranges and excerpts, carets, missing files, and overlay-range
projection. It records 85.18% statement and 91.3% line coverage. Focused browser
workflows pass two-writer source convergence and focused-caret preservation
during remote insertion.

The browser application artifact grows from 769,285 B raw / 208,855 B gzip to
769,814 B raw / 208,949 B gzip (+529 B raw / +94 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,362 B raw / 23,360 B
gzip and 18 and 150. Full native CI passes all 1,341 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Application Toast

A bounded `AppToast` now owns transient and persistent message rendering,
replacement-timer cancellation, one-shot action availability, modal
reparenting, popover visibility, and typed action and dismissal intents.
`WorkspaceApp` retains action effects, deferred-deletion authority, offline
update persistence, and notification policy.

This checkpoint reduces `src/client/app.ts` from 7,994 to 7,967 lines (-27).
The component adds 100 lines. Component tests cover fallback and action
presentation, one-shot action intent, transient dismissal, and replacement
timer cancellation. It records 71.15% statement and 73.17% line coverage.
Focused browser workflows pass persistent update recovery in both Workspace and
Library plus timed image-deletion Undo.

The browser application artifact grows from 769,814 B raw / 208,949 B gzip to
770,529 B raw / 209,185 B gzip (+715 B raw / +236 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,362 B raw / 23,360 B
gzip and 18 and 150. Full native CI passes all 1,343 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Workspace Switcher

A bounded `WorkspaceSwitcher` now owns authorized project option rendering,
archived-current handling, selected state, focus entry, and a typed navigation
intent. `WorkspaceApp` retains catalog fetching and canonical route navigation.
This removes its final feature-level imperative `replaceChildren()` renderer;
the remaining manual DOM supports sanitized Markdown, high-frequency editor
highlighting, and browser download and clipboard fallbacks.

This checkpoint reduces `src/client/app.ts` from 7,967 to 7,961 lines (-6).
The component adds 67 lines. Component tests cover fallback, active, available,
and archived project presentation plus empty, current, and different-project
selection intents. It records 81.81% statement and 84.21% line coverage.
Focused browser workflows pass isolated-workspace navigation and access plus
narrow-phone switcher visibility.

The browser application artifact grows from 770,529 B raw / 209,185 B gzip to
771,477 B raw / 209,360 B gzip (+948 B raw / +175 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,362 B raw / 23,360 B
gzip and 18 and 150. Full native CI passes all 1,345 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Coordinator Extraction: Source Editor Adapter

A bounded `source-editor-adapter` now owns native textarea-to-Yjs
synchronization and history, syntax and collaborator-presence mirroring, scroll
alignment, completion geometry, Yjs-relative selection capture, and optional
Vim binding. `WorkspaceApp` retains document identity, collaboration workflow,
completion candidates, authoring targets, and navigation authority.

This checkpoint reduces `src/client/app.ts` from 7,961 to 7,698 lines (-263).
The adapter adds 261 lines. Four direct tests cover local and remote Yjs edits,
undo and redo, highlighting and scroll synchronization, teardown, collapsed and
ranged relative anchors, stored Vim mode and guarded edits, and completion
geometry. It records 94.47% statement and 99.37% line coverage. Focused browser
workflows pass Markdown highlighting, opt-in Vim editing, remote-caret
preservation, and include-completion positioning.

The browser application artifact shrinks from 771,477 B raw / 209,360 B gzip to
771,417 B raw / 209,280 B gzip (-60 B raw / -80 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,362 B raw / 23,360 B
gzip and 18 and 150. Full native CI passes all 1,349 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Research Diary Summary

A bounded `ResearchDiarySummary` now owns missing and existing diary
presentation, derived entry, open-question, and next-action counts, singular and
plural copy, and a typed open intent. `WorkspaceApp` retains file lookup,
creation, selection, and editor focus.

This checkpoint reduces `src/client/app.ts` from 7,698 to 7,687 lines (-11) and
removes three internal element references. The component adds 60 lines.
Component tests cover missing, singular, and plural presentation plus the typed
open intent; it records 80% statement and 85.71% line coverage. The focused
writing-workflow browser scenario passes diary creation, derived summary copy,
and the Start-to-Open transition alongside question and reviewer ledgers.

The browser application artifact grows from 771,417 B raw / 209,280 B gzip to
772,143 B raw / 209,350 B gzip (+726 B raw / +70 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,362 B raw / 23,360 B
gzip and 18 and 150. Full native CI passes all 1,351 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Assistant Workflow Status

A bounded `AssistantWorkflowStatus` now owns operation-specific phrasing
attribution and initial status copy, subsequent live status presentation, and
typed evidence and connection intents. `WorkspaceApp` retains evidence
navigation, settings authority, provider discovery and generation, and the
policy that selects subsequent status messages.

This checkpoint reduces `src/client/app.ts` from 7,687 to 7,678 lines (-9),
replaces four internal element references with one component reference, and
consolidates two native action bindings. The component adds 90 lines. Component
tests cover default, phrasing, claim, and general operation status plus typed
actions and the settings click-propagation boundary; it records 77.77%
statement and 82.35% line coverage. Five focused browser workflows pass provider
selection and discovery, stale-generation rejection, clarity drilling, and
evidence-backed revision.

The browser application artifact grows from 772,143 B raw / 209,350 B gzip to
774,297 B raw / 209,781 B gzip (+2,154 B raw / +431 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,362 B raw /
23,360 B gzip and 18 and 150. Full native CI passes all 1,353 unit/coverage
tests, 120 Workers-runtime tests, and 74 browser tests.

## Continued Lit Consolidation: Claim Creation

The existing `ClaimListPanel` now owns the **New claim** action and derives its
availability from the same annotation data used to render evidence links. Its
typed action stream includes the create intent; `WorkspaceApp` retains dialog
and mutation authority.

This checkpoint reduces `src/client/app.ts` from 7,678 to 7,675 lines (-3) and
removes one element reference, native binding, and separate availability
mutation. The focused claim browser workflow passes creation and atomic
replacement. The extended component remains at 93.61% statement and 94.28%
line coverage.

The browser application artifact grows from 774,297 B raw / 209,781 B gzip to
774,514 B raw / 209,824 B gzip (+217 B raw / +43 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,362 B raw / 23,360 B
gzip and 18 and 150. Full native CI passes all 1,353 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Workspace Rail Tabs

A bounded `WorkspaceRailTabs` now owns the four project-rail tab controls,
active-mode and ARIA selection presentation, the open-comment count, and a
typed navigation intent. `WorkspaceApp` retains panel visibility, guide
rendering, and route synchronization; the existing layout manager retains
collapse and resize authority.

This checkpoint reduces `src/client/app.ts` from 7,675 to 7,661 lines (-14),
replaces five internal element references and four native action bindings, and
removes four selection mutations plus DOM-derived active-mode lookup. Component
tests cover active mode, comment count, unchanged selection, and typed
navigation. Focused browser workflows pass rail switching and persistence plus
claim creation through the Research rail. The component records 85% statement
and 88.88% line coverage.

The browser application artifact grows from 774,514 B raw / 209,824 B gzip to
775,339 B raw / 210,098 B gzip (+825 B raw / +274 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,362 B raw /
23,360 B gzip and 18 and 150. Full native CI passes all 1,355 unit/coverage
tests, 120 Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Authoring Mode Tabs

A bounded `AuthoringModeTabs` now owns Write and Map active-state and ARIA
presentation plus a typed mode-change intent. `WorkspaceApp` retains editor and
map visibility, focus policy, and route synchronization.

This checkpoint reduces `src/client/app.ts` from 7,661 to 7,660 lines (-1),
replaces two internal element references and two native action bindings, and
removes two ARIA mutations plus DOM-derived active-mode lookup. Component tests
cover active state, unchanged selection, and typed navigation. The focused
workspace-view browser workflow passes Write/Map switching and route
persistence. The component records 81.25% statement and 85.71% line coverage.

The browser application artifact grows from 775,339 B raw / 210,098 B gzip to
776,157 B raw / 210,192 B gzip (+818 B raw / +94 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,362 B raw / 23,360 B
gzip and 18 and 150. Full native CI passes all 1,357 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Consolidation: Claims Collection

The existing `ClaimListPanel` now owns the complete Claims collection shell and
derives its count from the same claim data used for cards and actions.
`WorkspaceApp` retains evidence-selection state, dialogs, mutations, and
navigation authority.

This checkpoint reduces `src/client/app.ts` from 7,657 to 7,654 lines (-3) and
removes the separate claim-count reference and mutation. Focused browser
workflows pass claim creation and atomic replacement plus the complete
annotation-to-claim-to-reviewed-prose path.

The browser application artifact grows from 776,247 B raw / 210,227 B gzip to
776,365 B raw / 210,216 B gzip (+118 B raw / -11 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,362 B raw / 23,360 B
gzip and 18 and 150. Full native CI passes all 1,357 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Consolidation: Publication Collection

The existing `PublicationListPanel` now owns the complete References collection
shell and derives its count from the same publication data used for cards.
`WorkspaceApp` retains context navigation, Library navigation, and enrichment
authority.

This checkpoint reduces `src/client/app.ts` from 7,660 to 7,657 lines (-3) and
removes the separate publication-count reference and mutation. The focused
publication-context browser workflow passes collection expansion, Library
management, context restoration, and PDF linking.

The browser application artifact grows from 776,157 B raw / 210,192 B gzip to
776,247 B raw / 210,227 B gzip (+90 B raw / +35 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,362 B raw / 23,360 B
gzip and 18 and 150. Full native CI passes all 1,357 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Editor Status

A bounded `EditorStatus` now owns authoring-target text and tooltip plus online
and offline save-state presentation. `WorkspaceApp` retains target resolution,
collaboration and offline-save policy, and the status values those workflows
select.

This checkpoint reduces `src/client/app.ts` from 7,654 to 7,649 lines (-5) and
replaces two internal element references with one component reference.
Component coverage is 78.57% statements and 84.61% lines. Focused browser
workflows pass selection-target persistence and offline edit restoration and
synchronization.

The browser application artifact grows from 776,365 B raw / 210,216 B gzip to
776,869 B raw / 210,318 B gzip (+504 B raw / +102 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,362 B raw / 23,360 B
gzip and 18 and 150. Full native CI passes all 1,358 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Project History Trigger

A bounded `ProjectHistoryTrigger` now owns the current revision badge and emits
a typed open intent. `WorkspaceApp` retains revision authority, history loading,
and dialog policy.

This checkpoint reduces `src/client/app.ts` from 7,649 to 7,648 lines (-1),
replaces two internal element references with one component reference, and
removes one native action binding and revision-text mutation. Component coverage
is 76.92% statements and 83.33% lines. Focused browser workflows pass compact
toolbar layout and the complete compare, milestone, restore, and branch flow.

The browser application artifact grows from 776,869 B raw / 210,318 B gzip to
777,474 B raw / 210,454 B gzip (+605 B raw / +136 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,362 B raw / 23,360 B
gzip and 18 and 150. Full native CI passes all 1,359 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Connection Status

A bounded `ConnectionStatus` now owns the synchronized connection label and dot
tone for workspace collaboration and private-Library presentation.
`WorkspaceApp` retains collaboration-state interpretation and the policy that
selects each label and connected value.

This checkpoint reduces `src/client/app.ts` from 7,648 to 7,646 lines (-2) and
replaces two internal element references with one component reference. Component
coverage is 78.57% statements and 84.61% lines. Focused browser workflows pass
private-Library presentation and offline edit restoration and synchronization.

The browser application artifact grows from 777,474 B raw / 210,454 B gzip to
777,986 B raw / 210,515 B gzip (+512 B raw / +61 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,362 B raw / 23,360 B
gzip and 18 and 150. Full native CI passes all 1,360 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Application Version Control

A bounded `ApplicationVersionControl` now owns build-version presentation,
Clipboard API copying, and the installed-PWA textarea fallback. `WorkspaceApp`
supplies the active version and retains toast policy through one typed notice.

This checkpoint reduces `src/client/app.ts` from 7,639 to 7,617 lines (-22),
replaces two internal element references with one component reference, and
removes the coordinator-level clipboard helper. Component coverage is 90.62%
statements and 93.1% lines across the Clipboard API, textarea fallback, and
unavailable-clipboard paths. Focused browser workflows pass version copying and
activated-update version behavior.

The browser application artifact grows from 779,487 B raw / 210,918 B gzip to
780,275 B raw / 211,073 B gzip (+788 B raw / +155 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,362 B raw / 23,360 B
gzip and 18 and 150. Full native CI passes all 1,362 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Workspace Navigation Controls

A bounded `PreviewSyncControls` now owns the two directional actions and their
Preview-context visibility while emitting one typed synchronization stream. A
bounded `WorkspaceSurfaceSwitcher` owns responsive Authoring/Context actions and
ARIA presentation. `WorkspaceApp` retains source-map resolution, caret and
scroll policy, pane visibility, and route synchronization.

This checkpoint reduces `src/client/app.ts` from 7,617 to 7,616 lines (-1),
replaces five internal element references with two component references, and
removes four native action bindings, two ARIA mutations, and one visibility
mutation. Preview-sync coverage is 76.92% statements and 81.81% lines; surface
switcher coverage is 81.25% statements and 85.71% lines. Focused browser
workflows pass compact desktop and phone navigation plus both synchronization
directions and centered-passage behavior.

The browser application artifact grows from 780,275 B raw / 211,073 B gzip to
782,100 B raw / 211,345 B gzip (+1,825 B raw / +272 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,362 B raw / 23,360
B gzip and 18 and 150. Full native CI passes all 1,364 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Vim Mode Control

A bounded `VimModeControl` now owns browser-local enablement, toggle and mode
presentation, modal keyboard behavior, pointer-selection transitions, and
editor-listener teardown. `WorkspaceApp` supplies only the source textarea and
its visual shell; `source-editor-adapter` returns to Yjs synchronization,
history, highlighting, selection, and completion geometry.

This checkpoint reduces `src/client/app.ts` from 7,646 to 7,639 lines (-7),
replaces two internal element references with one component reference, and
removes 66 Vim-specific lines from `source-editor-adapter`. The component records
89.7% statement and 96.49% line coverage. Focused browser workflows pass stored
appearance preferences and opt-in modal editing.

The browser application artifact grows from 777,986 B raw / 210,515 B gzip to
779,487 B raw / 210,918 B gzip (+1,501 B raw / +403 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,362 B raw / 23,360
B gzip and 18 and 150. Full native CI passes all 1,360 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Project Map Workspace

A composed `ProjectMapWorkspace` now owns the Evidence map shell, resource and
link totals, search-versus-overview presentation, graph fan-out to the map and
connection panels, mode visibility, focus entry, and one typed resource-selection
stream. `WorkspaceApp` retains authorized search, response validation, graph
acquisition, resource navigation, editor visibility, and URL policy.

This checkpoint reduces `src/client/app.ts` from 7,616 to 7,589 lines (-27),
replaces six internal element references with one component reference, and
consolidates four child event subscriptions into two domain events. Focused
browser coverage passes graph layout and emphasis, responsive relayout, search,
connection navigation, and return-to-source behavior. Component coverage is
90.69% statements and 91.89% lines.

The browser application artifact grows from 782,100 B raw / 211,345 B gzip to
784,626 B raw / 211,697 B gzip (+2,526 B raw / +352 B gzip). Explicit block-level
container behavior grows styles from 135,362 B raw / 23,360 B gzip to 135,376 B
raw / 23,364 B gzip (+14 B raw / +4 B gzip). Direct and unique production
package counts remain unchanged at 18 and 150. Full native CI passes all 1,367
unit/coverage tests, 120 Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Project Export Dialog

A bounded `ProjectExportDialog` now progressively enhances the server-rendered
export content, owns modal open and close lifecycle, and synchronizes its nested
publication statistics panel. `WorkspaceApp` retains the two spatially separate
open triggers and the canonical word-count projection.

This checkpoint reduces `src/client/app.ts` from 7,589 to 7,584 lines (-5),
replaces separate dialog, close-action, and statistics-panel references with one
component reference, and removes the coordinator's close binding. The focused
browser workflow passes composed word-count presentation and modal opening.
Component coverage is 75% statements and 71.42% lines; the remaining uncovered
lines are native custom-element connection and disconnection hooks exercised by
the browser workflow.

The browser application artifact grows from 784,626 B raw / 211,697 B gzip to
785,079 B raw / 211,723 B gzip (+453 B raw / +26 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,376 B raw / 23,364 B
gzip and 18 and 150. Full native CI passes all 1,369 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Project History Dialog

A composed `ProjectHistoryDialog` now owns revision-modal lifecycle, busy state,
panel-close handling, and delegation of loading, timeline, error, inspection,
and comparison presentation to the existing history panel. `WorkspaceApp`
retains the revision XState workflow, authorized requests, mutations,
navigation, and failure policy.

This checkpoint reduces `src/client/app.ts` from 7,584 to 7,582 lines (-2),
replaces separate dialog and panel references with one component reference, and
consolidates panel-close and native-dialog-close coordination. The focused
browser workflow passes timeline loading, inspection, comparison, milestone,
restore, branch, busy, and close behavior. Component coverage is 70.37%
statements and 69.23% lines; browser coverage owns the custom-element lifecycle
and typed revision/detail delegation not available in the DOM-less unit harness.

The browser application artifact grows from 785,079 B raw / 211,723 B gzip to
785,998 B raw / 211,930 B gzip (+919 B raw / +207 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,376 B raw / 23,364 B
gzip and 18 and 150. Full native CI passes all 1,372 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Citation Network Workspace

A composed `CitationNetworkWorkspace` now owns Reference trail visibility,
current-project filter state and ARIA presentation, close behavior, reference
synchronization, and candidate-save delegation to the existing network panel.
`WorkspaceApp` retains authorized requests, validation, review prompts,
mutations, refreshes, and notification policy.

This checkpoint reduces `src/client/app.ts` from 7,582 to 7,570 lines (-12),
replaces four shell and panel references plus one coordinator filter field with
one component reference, and removes native filter and close bindings. The
focused browser workflow passes opening, manual assertions, review, project
filtering, graph presentation, Crossref expansion, candidate saving, and close
behavior. Component coverage is 85.18% statements and 88% lines.

The browser application artifact grows from 785,998 B raw / 211,930 B gzip to
787,700 B raw / 212,289 B gzip (+1,702 B raw / +359 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,376 B raw / 23,364
B gzip and 18 and 150. Full native CI passes all 1,374 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Preview Navigation Control

A bounded `PreviewNavigationControl` now owns browser-local top-navigation
visibility, stored restoration, toggle and restore labels, ARIA and title
presentation, Preview-context availability, and focus handoff. `WorkspaceApp`
supplies only whether Preview is the active workspace context.

This checkpoint reduces `src/client/app.ts` from 7,570 to 7,529 lines (-41),
replaces three internal element references with one component reference, and
removes two native bindings plus the coordinator's persistence and presentation
helpers. The focused browser workflow passes workspace and Library visibility,
stored state, accessible copy, and focus restoration across compact layouts.
Component coverage is 83.33% statements and 80.48% lines.

The browser application artifact grows from 787,700 B raw / 212,289 B gzip to
788,448 B raw / 212,575 B gzip (+748 B raw / +286 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,376 B raw / 23,364 B
gzip and 18 and 150. Full native CI passes all 1,376 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Context Tab Strip

A composed `ContextTabStrip` now owns fixed research-tab presentation, typed
primary actions, roving keyboard focus, programmatic focus handoff, and
delegation to the existing dynamic resource-tab component. `WorkspaceApp`
retains canonical active-context state, authorized Library loading, resource
closure, route synchronization, and panel presentation.

This checkpoint reduces `src/client/app.ts` from 7,529 to 7,480 lines (-49),
replaces the tablist, three fixed-tab, and dynamic-tab component references with
one component reference, and removes three native primary bindings plus the
coordinator's fixed ARIA renderer and keyboard handler. Focused browser coverage
passes fixed-tab selection and keyboard navigation plus resource-keyed tab
opening, activation, closure, and focus restoration. Component coverage is
100% statements and lines.

The browser application artifact grows from 788,448 B raw / 212,575 B gzip to
789,012 B raw / 212,660 B gzip (+564 B raw / +85 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,376 B raw / 23,364 B
gzip and 18 and 150. Full native CI passes all 1,381 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Coordinator Reduction: PDF Context Opening

The three workspace, private-Library, and project-reference PDF entry paths now
share one context preparation sequence for scroll capture, tab activation,
location restoration, rendering, responsive surface selection, and focus.
Route-history policy and asynchronous PDF loading remain explicit in each
caller because their standalone-Library and workspace behavior differs.

This checkpoint removes the duplicated orchestration flagged by the code-health
audit and reduces `src/client/app.ts` from 7,480 to 7,478 lines (-2). The focused
browser workflows pass resource-keyed PDF opening, standalone Library routes,
project-reference opening, annotation focus, and back/forward restoration.

The browser application artifact shrinks from 789,012 B raw / 212,660 B gzip to
788,731 B raw / 212,648 B gzip (-281 B raw / -12 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,376 B raw / 23,364 B
gzip and 18 and 150. Full native CI passes all 1,381 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Composition: Context Tab Overview

The existing `ContextTabStrip` now composes both the scrollable fixed and
resource tabs and the non-scrolling overflow overview from one active-context
projection. It delegates the two dynamic presentations to their existing Lit
children and centralizes their typed event boundary. `WorkspaceApp` retains
active-context state, title resolution, authorized Library loading, resource
closure, route synchronization, and panel presentation.

This checkpoint reduces `src/client/app.ts` from 7,478 to 7,466 lines (-12),
removes the separate overview component reference and coordinator renderer, and
keeps the semantic tablist separate from the overflow menu. Focused browser
coverage passes fixed-tab keyboard selection, resource opening and closure,
overflow activation, focus restoration, and standalone Library presentation.
Component coverage remains 100% statements and lines.

The browser application artifact changes from 788,731 B raw / 212,648 B gzip to
788,927 B raw / 212,646 B gzip (+196 B raw / -2 B gzip). Explicit display-only
host styling grows from 135,376 B raw / 23,364 B gzip to 135,411 B raw / 23,373
B gzip (+35 B raw / +9 B gzip). Direct and unique production package counts
remain unchanged at 18 and 150. Full native CI passes all 1,381 unit/coverage
tests, 120 Workers-runtime tests, and 74 browser tests.

## Continued Coordinator Reduction: Workspace Layout Controls

`WorkspaceLayoutManager` now resolves its four bounded rail and pane controls
beneath the workspace root. `WorkspaceApp` supplies only that root, the
context-specific pane key, and the PDF resize hook; it no longer exposes
manager-internal controls through its global element registry.

This checkpoint reduces `src/client/app.ts` from 7,466 to 7,449 lines (-17),
removes four coordinator-only element references, and adds explicit failure for
an incomplete layout shell. Focused unit and browser coverage passes rail
collapse, pointer and keyboard resizing, persistence, responsive restoration,
pane resizing, focus transfer, and missing-control detection.

The browser application artifact changes from 788,927 B raw / 212,646 B gzip to
788,880 B raw / 212,687 B gzip (-47 B raw / +41 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,411 B raw / 23,373 B
gzip and 18 and 150. Full native CI passes all 1,383 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Ownership: Workspace Rail Panels

The existing `WorkspaceRailTabs` now derives the four panels it controls from
the tab contract and updates panel visibility together with selected-tab
presentation. `WorkspaceApp` retains route synchronization, responsive rail
layout, and the Writing guide's derived rendering, but no longer registers or
mutates the four panel elements independently.

This checkpoint reduces `src/client/app.ts` from 7,449 to 7,433 lines (-16) and
removes four coordinator-only element references. Focused unit coverage verifies
the complete panel-visibility projection, and focused browser coverage passes
real Files, Research, and Writing guide switches.

The browser application artifact shrinks from 788,880 B raw / 212,687 B gzip to
788,646 B raw / 212,670 B gzip (-234 B raw / -17 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,411 B raw / 23,373 B
gzip and 18 and 150. Full native CI passes all 1,383 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Ownership: New Project Dialog Lifecycle

The existing `ProjectStartingPointBrowser` now owns its native parent dialog's
open, close, focus-containment, listener-teardown, and return-focus lifecycle
alongside its existing starting-point presentation. `WorkspaceApp` retains
authorized template and project-preview requests, deferred deletion, creation,
import workflows, navigation, and error policy.

This checkpoint reduces `src/client/app.ts` from 7,433 to 7,408 lines (-25),
removes the separate dialog reference, and deletes the coordinator's native
keydown and close bindings. Focused browser coverage passes forward focus wrap,
Escape restoration, loading, cancellation, reopening, template selection,
project preview, and creation.

The browser application artifact changes from 788,646 B raw / 212,670 B gzip
to 789,386 B raw / 213,011 B gzip (+740 B raw / +341 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150. Full native CI passes all 1,385 unit/coverage
tests, 120 Workers-runtime tests, and 74 browser tests.

## Continued Lit Composition: GitHub Import

`GitHubImportPanel` now composes account connection presentation with the
repository picker, preview, confirmation, and native dialog lifecycle. The
standalone connection component and its application-level reference are gone;
`WorkspaceApp` retains authenticated requests, response validation, preview
identity, and project creation.

This checkpoint reduces `src/client/app.ts` from 7,376 to 7,372 lines (-4),
deletes the 74-line connection component, removes two coordinator references,
and consolidates four typed import intents on one Lit boundary. Focused unit
coverage passes connection, picker, preview, confirmation, disconnect, and
dialog lifecycle behavior, while focused browser coverage passes the guarded
GitHub connection/import flow.

The browser application artifact changes from 789,338 B raw / 213,050 B gzip
to 789,139 B raw / 213,062 B gzip (-199 B raw / +12 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150. Full native CI passes all 1,386 unit/coverage
tests, 120 Workers-runtime tests, and 74 browser tests.

## Continued Lit Ownership: LaTeX Import Dialog

The existing `LatexImportPanel` now owns reset, native modal opening and
closing, and initial title focus alongside its archive, preview, diagnostic,
and confirmation state. `WorkspaceApp` retains authenticated conversion and
creation requests, response validation, and navigation.

This checkpoint reduces `src/client/app.ts` from 7,372 to 7,368 lines (-4) and
removes the separate dialog reference plus split reset/open/focus coordination.
Focused unit and browser coverage passes modal opening, initial focus,
cancellation, and reopening through the New project workflow.

The browser application artifact changes from 789,139 B raw / 213,062 B gzip
to 789,241 B raw / 212,982 B gzip (+102 B raw / -80 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,387 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Coordinator Reduction: PDF Viewer Shell

`PdfEvidenceViewer` now resolves its bounded canvas, page, link, text,
highlight, status, and dual page-control elements from the document shell.
`WorkspaceApp` supplies only typed selection, highlight, page-change, and
private-highlight hooks; the two shared status/text-layer references remain in
the coordinator only because separate workflows still use them.

This checkpoint reduces `src/client/app.ts` from 7,408 to 7,376 lines (-32),
removes nine viewer-only element references, and replaces the large constructor
object with one document-scoped factory. Focused browser coverage passes the
standalone private-PDF import, page rendering, selection, annotation, and export
workflow.

The browser application artifact changes from 789,386 B raw / 213,011 B gzip
to 789,338 B raw / 213,050 B gzip (-48 B raw / +39 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150. Full native CI passes all 1,385 unit/coverage
tests, 120 Workers-runtime tests, and 74 browser tests.

## Continued Lit Ownership: Catalog and Sharing Dialogs

The existing `WorkspaceCatalogPanel` and `WorkspaceSharingPanel` now own their
native parent dialogs' opening and closing. The catalog panel also owns its
open-time filter reset and focus. `WorkspaceApp` retains catalog fetching,
navigation, membership and capability-link requests, authorization outcomes,
and toast policy.

This checkpoint reduces `src/client/app.ts` from 7,368 to 7,360 lines (-8),
removes two separate dialog references, and deletes both synthetic close-event
bridges. Focused unit coverage passes each native dialog lifecycle, while the
existing browser coverage passes project catalog and sharing opening, closing,
and reopening.

The browser application artifact changes from 789,241 B raw / 212,982 B gzip
to 789,120 B raw / 212,922 B gzip (-121 B raw / -60 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,389 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Contract: Project-File Save Mode

`ProjectFileDialog` now emits its owned operation mode together with the
submitted path. `WorkspaceApp` no longer mirrors that mode in a coordinator
field and consumes one stable typed intent for create, create-and-include,
rename, folder-create, and folder-rename operations.

This checkpoint reduces `src/client/app.ts` from 7,360 to 7,357 lines (-3) and
removes duplicated mutable mode state. Focused unit coverage verifies that the
dialog emits its configured mode with the trimmed path.

The browser application artifact changes from 789,120 B raw / 212,922 B gzip
to 789,109 B raw / 212,926 B gzip (-11 B raw / +4 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,389 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Model Preferences Entry

`ModelProviderSettings` now opens its enclosing preferences menu and focuses
the connection selector when Writing assistant requests connection settings.
`WorkspaceApp` no longer addresses the outer preferences shell separately.

This checkpoint reduces `src/client/app.ts` from 7,357 to 7,352 lines (-5),
removes the preferences-menu reference, and consolidates split open/focus
coordination. Focused unit and browser coverage verifies menu opening and
connection focus through Writing assistant.

The browser application artifact changes from 789,109 B raw / 212,926 B gzip
to 789,183 B raw / 212,957 B gzip (+74 B raw / +31 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,390 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Composition: Project-File Actions

Two `ProjectFileActions` instances now own the project rail and editor-menu
commands, entry-file delete availability, and one typed action protocol.
`WorkspaceApp` retains active-file identity, resource checks, dialogs, upload
selection, persistence, deferred deletion, selection, refresh, and toast policy.

This checkpoint reduces `src/client/app.ts` from 7,352 to 7,343 lines (-9),
replaces seven raw button references and direct bindings with two component
references, and removes coordinator-owned delete-button presentation. Focused
unit and browser coverage passes both variants, every typed intent, the
entry-file guard, and the complete create/include/folder/rename/delete workflow.

The browser application artifact changes from 789,183 B raw / 212,957 B gzip
to 790,598 B raw / 213,321 B gzip (+1,415 B raw / +364 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,392 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Research Context Panels

`ContextTabStrip` now derives all controlled research-panel visibility from the
same canonical active-tab input it uses for fixed, resource, and overview tab
presentation. It also owns active resource labelling, PDF-mode data attributes,
and PDF-control visibility. `WorkspaceApp` retains canonical context state,
authorized content loading, content rendering, routing, and scroll restoration.

This checkpoint reduces `src/client/app.ts` from 7,343 to 7,308 lines (-35),
removes seven raw panel/control references, and deletes the separate visibility
and resource-labelling coordination. Focused unit and browser coverage passes
fixed, publication, candidate, workspace-PDF, and private-library-PDF context
transitions.

The browser application artifact changes from 790,598 B raw / 213,321 B gzip
to 790,644 B raw / 213,368 B gzip (+46 B raw / +47 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,393 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Fixed Context Scroll

`ContextTabStrip` now resolves the Preview, Library, and Writing-assistant
scroll containers controlled by its permanent tabs and owns their scroll
capture and restoration. `WorkspaceApp` retains canonical tab state and the
resource-specific publication, candidate, and PDF scroll contracts.

This checkpoint reduces `src/client/app.ts` from 7,308 to 7,279 lines (-29),
removes two scroll-element references, and deletes the coordinator's fixed-tab
scroll selector and restorer table. Focused unit and browser coverage passes
Preview and Library scroll retention plus resource-key rejection.

The browser application artifact changes from 790,644 B raw / 213,368 B gzip
to 790,503 B raw / 213,336 B gzip (-141 B raw / -32 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,394 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Composition: Project Annotation Tools

`ProjectAnnotationForm` now owns the complete project-PDF annotation composer,
including publication-intake composition, composer visibility, citation
availability and copy, paint/eraser presentation, undo availability, capture
status, and annotation fields. `WorkspaceApp` retains canonical PDF selection,
highlight geometry and persistence, manuscript insertion and linking, refreshes,
and notification policy.

This checkpoint reduces `src/client/app.ts` from 7,279 to 7,271 lines (-8),
removes five raw element references and four direct bindings, and replaces them
with one typed component action protocol. Focused unit and browser coverage
passes tool, undo, and citation intents, resource-context switching, and the
complete paint, extend, undo, erase, and delete lifecycle.

The browser application artifact changes from 790,503 B raw / 213,336 B gzip
to 792,712 B raw / 213,766 B gzip (+2,209 B raw / +430 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,395 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Composition: Private-PDF Inspector

`LibraryPdfInspector` now owns the private-PDF inspector shell, active-artifact
identity, visibility, status, expansion, annotation-details opening, nested
annotation component composition, and one typed close intent. `WorkspaceApp`
retains PDF gestures, annotation state, persistence, close-time draft policy,
refreshes, and focus restoration.

This checkpoint reduces `src/client/app.ts` from 7,271 to 7,268 lines (-3),
replaces four raw shell references with one component reference, and removes a
direct close binding plus repeated dataset, status, visibility, and details
mutations. Focused unit and browser coverage passes shell state, close intent,
project-context switching, and the complete project-free private-PDF annotate
and export workflow.

The browser application artifact changes from 792,712 B raw / 213,766 B gzip
to 795,095 B raw / 214,163 B gzip (+2,383 B raw / +397 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,397 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Library PDF Intake

`LibraryPdfUploadControl` now owns file selection, drag-and-drop acceptance,
drag and busy presentation, input reset and disabling, and typed file and
busy-drop intents. `WorkspaceApp` retains ordered batch execution, upload
transport, failed-file retry ownership, Library refreshes, duplicate handling,
and notification policy.

This checkpoint reduces `src/client/app.ts` from 7,268 to 7,248 lines (-20),
replaces two raw element references with one component reference, removes four
native file and drag listeners, and deletes duplicated upload-busy state.
Focused unit and browser coverage passes empty and populated selection, busy
presentation, partial batch success, retry, exact duplicate detection, and
archived-reference reveal.

The browser application artifact changes from 795,095 B raw / 214,163 B gzip
to 796,464 B raw / 214,497 B gzip (+1,369 B raw / +334 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,399 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Composition: Library Tools

`LibraryToolsMenu` now owns portable-archive file selection and reset, Library
export links, citation-network and archived-reference controls,
archived-state presentation, and typed restore, navigation, and filter intents.
`WorkspaceApp` retains archive transport, citation-network loading, canonical
filter state, Library refreshes, and notification policy.

This checkpoint reduces `src/client/app.ts` from 7,248 to 7,245 lines (-3),
replaces three raw controls with one component reference, removes three native
bindings, and deletes archive-file DOM reads and scattered archived-button
mutations. Focused unit and browser coverage passes filter toggling, archived
duplicate reveal, portable metadata restore, and citation-network review.

The browser application artifact changes from 796,464 B raw / 214,497 B gzip
to 797,955 B raw / 214,842 B gzip (+1,491 B raw / +345 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,401 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Authoring Mode Surfaces

`AuthoringModeTabs` now owns the editor shell, write-only toolbar, and composed
map workspace visibility alongside Write/Map selection and ARIA presentation.
`WorkspaceApp` retains canonical route state and editor focus policy.

This checkpoint reduces `src/client/app.ts` from 7,231 to 7,226 lines (-5),
removes the write-action element reference and three coordinator-owned
visibility mutations. Focused unit and browser coverage passes both controlled
surface states, map layout refresh and focus entry, resource rendering, and the
return-to-Write workflow.

The browser application artifact changes from 797,884 B raw / 214,806 B gzip
to 797,956 B raw / 214,835 B gzip (+72 B raw / +29 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,402 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project Export Entry

`ProjectExportDialog` now owns both spatially separate export triggers and the
live word-count badge in addition to modal lifecycle, close handling, and its
nested statistics panel. `WorkspaceApp` supplies only the canonical
`PublicationWordStatistics` projection.

This checkpoint reduces `src/client/app.ts` from 7,245 to 7,231 lines (-14),
removes two raw trigger references, two direct bindings, the coordinator's
open helper, and word-count badge mutation. Focused unit and browser coverage
passes external trigger delegation, modal lifecycle, composed word-count
presentation, statistics rendering, and export-link availability.

The browser application artifact changes from 797,955 B raw / 214,842 B gzip
to 797,884 B raw / 214,806 B gzip (-71 B raw / -36 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,401 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Source Citation Action

`SourceCitationControl` now derives citation context from the active source
caret once, owns the contextual action's availability, and emits one typed
resolved-citation intent. `WorkspaceApp` retains publication lookup,
grouped-citation policy, PDF-locator navigation, and notification policy.

This checkpoint reduces `src/client/app.ts` from 7,226 to 7,216 lines (-10),
replaces one raw button reference and direct click binding, and removes
duplicated citation parsing plus scattered disabled and visibility mutations.
Focused unit and browser coverage passes citation and non-citation caret state,
locator propagation, toolbar fit, and citation navigation.

The browser application artifact changes from 797,956 B raw / 214,835 B gzip
to 798,490 B raw / 214,795 B gzip (+534 B raw / -40 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,404 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued PDF Viewer Encapsulation: Status

`PdfEvidenceViewer` now owns its complete loading, rendering, selection, mode,
and failure status presentation. `WorkspaceApp` retains active-tab stale-load
protection and reports only the active load failure through the viewer API.

This checkpoint reduces `src/client/app.ts` from 7,216 to 7,214 lines (-2),
removes the last raw PDF-status element reference, and leaves the separate text
layer reference only for annotation-tool pointer routing. Focused private and
project PDF browser workflows pass status, rendering, selection, annotation,
and resource-context behavior.

The browser application artifact changes from 798,490 B raw / 214,795 B gzip
to 798,475 B raw / 214,784 B gzip (-15 B raw / -11 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,404 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Completed PDF Viewer Shell Encapsulation

`PdfEvidenceViewer` now also owns text-selection pointer routing for annotation
tool changes. `WorkspaceApp` supplies only the selected tool state through the
viewer API and no longer retains any raw viewer-internal element references.

This checkpoint reduces `src/client/app.ts` from 7,214 to 7,212 lines (-2) and
removes the final raw text-layer reference. Focused browser coverage passes the
paint, extend, undo, erase, and delete lifecycle while switching among text,
drawing, erasing, and selection tools.

The browser application artifact changes from 798,475 B raw / 214,784 B gzip
to 798,483 B raw / 214,778 B gzip (+8 B raw / -6 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,411 B raw / 23,373 B
gzip and 18 and 150.

Full native CI passes all 1,404 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Preview Encapsulation: DOM Adapter

`PreviewDocument` now owns direct article and viewport mechanics: rendered and
fallback content assignment, source-span lookup, viewport centering, transient
sync emphasis, project-image lookup, scroll reset, and anchor navigation.
`WorkspaceApp` retains Markdown rendering, source-map translation, project
authorization, citation behavior, source selection, and routing.

This checkpoint reduces `src/client/app.ts` from 7,212 to 7,166 lines (-46),
removes both raw Preview element references and the coordinator's transient
highlight timer, and deletes four DOM-query and geometry helpers. Focused unit
and browser coverage passes content ownership, nearest-span selection,
centering, transient emphasis, clicks, anchor and image lookup, live Markdown
rendering, bidirectional source sync, and authorized project images.

The browser application artifact changes from 798,483 B raw / 214,778 B gzip
to 798,937 B raw / 215,080 B gzip (+454 B raw / +302 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,407 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Action Menus

`ActionMenuController` now owns document-level outside-action dismissal,
settings-menu containment, Escape ordering, summary-focus restoration, and
listener teardown for the server-rendered native `details` menus.
`WorkspaceApp` no longer coordinates global menu presentation.

This checkpoint reduces `src/client/app.ts` from 7,157 to 7,139 lines (-18)
and removes two document listeners plus repeated open-menu queries from the
coordinator. Focused unit and browser coverage passes internal and external
clicks, selected actions, settings persistence, Escape ordering, focus return,
appearance selection, and editor action-popover behavior.

The browser application artifact changes from 798,805 B raw / 215,044 B gzip
to 799,411 B raw / 215,061 B gzip (+606 B raw / +17 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,410 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Completed Lit Candidate Availability Ownership

`CandidateReviewPanel` now owns live Apply availability updates when document
stability or assistant decision state changes, while preserving its current
candidate, failure, and scroll presentation. `WorkspaceApp` retains canonical
candidate applicability and workflow state.

This checkpoint reduces `src/client/app.ts` from 7,166 to 7,157 lines (-9) and
removes the stale document-wide query for legacy candidate Apply buttons that
the Lit panel no longer renders. Focused unit and browser coverage passes live
availability changes, stale-candidate rejection, and reviewed evidence-backed
candidate decisions.

The browser application artifact changes from 798,937 B raw / 215,080 B gzip
to 798,805 B raw / 215,044 B gzip (-132 B raw / -36 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,407 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Passage Resolution

`ClaimListPanel` and `ProjectEvidencePanel` now own live passage-resolution
updates for the links they render. `WorkspaceApp` supplies refreshed typed link
data after Preview composition and no longer scans the document or mutates
button labels, availability, or data attributes outside those components.

This checkpoint reduces `src/client/app.ts` from 7,139 to 7,129 lines (-10)
and removes the coordinator's last selector dependency on passage-action
markup. Focused unit and browser coverage passes refreshed claim and annotation
passage navigation, changed-match presentation, and stale-link availability.

The browser application artifact changes from 799,411 B raw / 215,061 B gzip
to 799,325 B raw / 214,992 B gzip (-86 B raw / -69 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,410 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project Quick Open

`ProjectTreePanel` now owns workspace-only Cmd/Ctrl+P detection, open-dialog
suppression, the document listener lifecycle, and a typed quick-open intent.
`WorkspaceApp` retains rail and layout coordination, then asks the visible
panel to focus its filter. The follow-up also removes obsolete anchor-link DOM
identity attributes after passage resolution became typed panel data.

This checkpoint reduces `src/client/app.ts` from 7,129 to 7,116 lines (-13)
and removes its remaining global keyboard listener. Focused unit and browser
coverage passes project-tree rendering and the collapsed-rail quick-open flow.

The browser application artifact changes from 799,325 B raw / 214,992 B gzip
to 799,504 B raw / 215,054 B gzip (+179 B raw / +62 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,411 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Grounding Choice Focus

`ProjectEvidencePanel` and `ClaimListPanel` now own opening, scrolling, and
focusing their first available model-grounding choice through one shared DOM
primitive. `WorkspaceApp` retains Research-rail selection, panel priority,
workflow status, and empty-evidence notification policy without querying panel
markup.

This checkpoint reduces `src/client/app.ts` from 7,116 to 7,111 lines (-5)
and removes its last document-wide model-evidence query. Focused unit and
browser coverage passes positive and empty focus discovery, collection opening,
focus placement, and the concurrent-edit rejection workflow.

The browser application artifact changes from 799,504 B raw / 215,054 B gzip
to 799,651 B raw / 215,110 B gzip (+147 B raw / +56 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,412 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Markup Geometry

`LibraryPdfMarkupLayer` now owns clamped pointer normalization against its page
bounds and the active-tool and drawing data attributes used by its interaction
styles. `WorkspaceApp` retains pointer capture, annotation state transitions,
shape recognition, persistence, and inspector policy without calculating the
layer's local coordinates or mutating its attributes.

This checkpoint reduces `src/client/app.ts` from 7,111 to 7,101 lines (-10)
and removes its duplicated markup-bound geometry helper. Focused unit and
browser coverage passes centered, clamped, and unavailable geometry, tool and
drawing state, plus the complete PDF annotation interaction lifecycle.

The browser application artifact changes from 799,651 B raw / 215,110 B gzip
to 799,775 B raw / 215,172 B gzip (+124 B raw / +62 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,413 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Drawing Samples

`LibraryPdfMarkupLayer` now owns expansion of coalesced pointer samples into
clamped page points, rejection of near-duplicate additions, and assembly of the
next draft geometry. `WorkspaceApp` retains Safari scroll cancellation,
annotation-machine updates, recognition scheduling, and persistence.

This checkpoint reduces `src/client/app.ts` from 7,087 to 7,078 lines (-9)
and removes its local sample loop and distance filtering. Focused unit and
browser coverage passes coalesced samples, duplicate rejection, a real mouse
stroke, shape recognition, private persistence, rendering, and annotated
export.

The browser application artifact changes from 799,932 B raw / 215,491 B gzip
to 800,029 B raw / 215,499 B gzip (+97 B raw / +8 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,413 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Shape Geometry

`LibraryPdfMarkupLayer` now owns the rendered-bound conversions required to
recognize normalized strokes in pixel space and return snapped or adjusted
shapes to normalized page coordinates. `WorkspaceApp` retains gesture and
recognized-shape state, the recognition delay, workflow transitions,
persistence, and inspector messaging.

This checkpoint reduces `src/client/app.ts` from 7,101 to 7,087 lines (-14),
removes its shape-normalization helper, and removes its direct dependency on
the recognition and manipulation functions. Focused unit and browser coverage
passes recognition, adjustment, unavailable bounds, a real held line gesture,
private persistence, rendering, and annotated export.

The browser application artifact changes from 799,775 B raw / 215,172 B gzip
to 799,932 B raw / 215,491 B gzip (+157 B raw / +319 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,413 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Shape Recognition Timing

`LibraryPdfMarkupLayer` now owns the delayed shape-recognition timer, live
snapped-draft update, cancellation, and disconnect cleanup. It emits a typed
recognition intent after applying its rendered-bound geometry.
`WorkspaceApp` retains stale-pointer protection, recognized-shape gesture
state, annotation-machine transitions, persistence, and inspector messaging.

This checkpoint reduces `src/client/app.ts` from 7,078 to 7,074 lines (-4)
and removes its component-local timer field and scheduling method. Focused unit
coverage passes the delay, recognition event, and cancellation contract; the
real held-pointer private-PDF browser flow passes recognition, persistence,
rendering, and annotated export.

The browser application artifact changes from 800,029 B raw / 215,499 B gzip
to 800,454 B raw / 215,695 B gzip (+425 B raw / +196 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,414 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Shape Manipulation

`LibraryPdfMarkupLayer` now keeps recognized pixel-space shape state private,
handles subsequent pointer movement, updates the live draft, and emits typed
normalized adjustment intents. `WorkspaceApp` no longer imports the recognition
model or stores and routes a component-internal shape; it retains pointer and
workflow validation, annotation-machine transitions, persistence, and inspector
messaging.

This checkpoint reduces `src/client/app.ts` from 7,074 to 7,063 lines (-11).
Focused unit coverage passes recognized and inactive adjustment behavior, while
the real held-pointer private-PDF browser flow passes recognition, adjustment,
persistence, rendering, and annotated export.

The browser application artifact changes from 800,454 B raw / 215,695 B gzip
to 800,734 B raw / 215,735 B gzip (+280 B raw / +40 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,414 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Markup Hit-Testing

`LibraryPdfMarkupLayer` now resolves note-pin and drawing-stroke pointer targets
to typed kind and identifier data. `WorkspaceApp` no longer queries component
selectors or reads markup IDs from the layer's light DOM; it retains tool
validation, annotation-machine transitions, pointer capture, and persistence.
Draft note pins remain consumed without starting a second page placement.

This checkpoint reduces `src/client/app.ts` from 7,063 to 7,061 lines (-2).
Focused unit coverage passes saved-note, draft-note, drawing, and empty target
resolution, while the private-PDF browser workflow passes note placement and
movement, drawing selection, persistence, rendering, and annotated export.

The browser application artifact changes from 800,734 B raw / 215,735 B gzip
to 800,894 B raw / 215,757 B gzip (+160 B raw / +22 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,415 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Tool Guidance

`LibraryPdfAnnotationToolbar` now owns the exact guidance copy associated with
its Select, Text, Note, and Draw tools. `WorkspaceApp` retains tool workflow,
PDF viewer configuration, inspector visibility, and the decision to present
the returned guidance.

This checkpoint reduces `src/client/app.ts` from 7,061 to 7,054 lines (-7).
Focused unit coverage passes all four tool messages, and the private-PDF browser
workflow passes tool switching, note and drawing interaction, persistence, and
annotated export.

The browser application artifact changes from 800,894 B raw / 215,757 B gzip
to 800,885 B raw / 215,763 B gzip (-9 B raw / +6 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,411 B raw / 23,373 B
gzip and 18 and 150.

Full native CI passes all 1,415 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Pointer Interpretation

`LibraryPdfMarkupLayer` now combines its active tool, local hit-testing, and
page-relative geometry into typed pointer-down actions for note targets,
drawing targets, note placement, drawing starts, and touch-only drawing
rejection. `WorkspaceApp` retains pointer capture, annotation-machine
transitions, selection, persistence, inspector messaging, and notifications.

This checkpoint reduces `src/client/app.ts` from 7,054 to 7,051 lines (-3).
Focused unit coverage passes every tool and target branch, and the private-PDF
browser workflow passes tool switching, touch-compatible interaction, note and
drawing behavior, persistence, rendering, and annotated export.

The browser application artifact changes from 800,885 B raw / 215,763 B gzip
to 801,333 B raw / 215,914 B gzip (+448 B raw / +151 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,415 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Pointer Activation

`LibraryPdfMarkupLayer` now performs the local mechanics associated with its
typed pointer actions: drawing-selection default suppression, note and drawing
pointer capture, stale-shape cancellation, and active-drawing presentation.
`WorkspaceApp` retains annotation-machine transitions, selection, rerendering,
persistence, inspector messaging, and notifications. The resulting dispatcher
also absorbs three one-call start helpers.

This checkpoint reduces `src/client/app.ts` from 7,051 to 7,037 lines (-14).
Focused unit coverage passes capture and suppression behavior, and the
private-PDF browser workflow passes selection, note dragging, drawing start and
recognition, persistence, rendering, and annotated export.

The browser application artifact changes from 801,333 B raw / 215,914 B gzip
to 801,290 B raw / 215,903 B gzip (-43 B raw / -11 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,415 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Drawing Continuation

`LibraryPdfMarkupLayer` now owns the full local continuation step for an
unrecognized drawing: Safari scroll suppression, coalesced-sample expansion,
near-duplicate rejection, live draft updates, and recognition scheduling. It
returns only new normalized points to `WorkspaceApp`, which retains the
annotation-machine transition and persistence.

This checkpoint reduces `src/client/app.ts` from 7,037 to 7,027 lines (-10)
and removes its one-use drawing-append helper. Focused unit coverage passes the
local continuation contract, and the private-PDF browser workflow passes held
mouse drawing, recognition, persistence, rendering, and annotated export.

The browser application artifact changes from 801,290 B raw / 215,903 B gzip
to 801,313 B raw / 215,902 B gzip (+23 B raw / -1 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,411 B raw / 23,373 B
gzip and 18 and 150.

Full native CI passes all 1,415 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Interaction Cleanup

`LibraryPdfMarkupLayer.setInteraction` now treats every inactive interaction as
a recognition-cleanup boundary. Tool changes and pointer cancellation no longer
require coordinator-owned timer or shape cleanup, while the separate composer
reset can still cancel recognition directly before changing other UI state.

This checkpoint reduces `src/client/app.ts` from 7,027 to 7,021 lines (-6) and
removes its shape-recognition cleanup wrapper. Focused unit and private-PDF
browser coverage passes tool changes, cancellation, drawing recognition,
persistence, rendering, and annotated export.

The browser application artifact changes from 801,313 B raw / 215,902 B gzip
to 801,295 B raw / 215,875 B gzip (-18 B raw / -27 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,415 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Note Dragging

`LibraryPdfMarkupLayer` now owns note-drag start coordinates, the movement
threshold, normalized preview geometry, native-default suppression, and the
transient pin update. The PDF annotation machine retains only the active note
and pointer identity, while `WorkspaceApp` retains workflow transitions, final
position persistence, rerendering, and notifications.

This checkpoint reduces `src/client/app.ts` from 7,021 to 7,014 lines (-7) and
the PDF annotation machine from 304 to 289 lines (-15). Focused unit coverage
passes stationary, moved, mismatched-pointer, completion, and cancellation
behavior. The private-PDF browser flow now performs a real note drag and passes
persistence before drawing, recognition, rendering, and annotated export.

The browser application artifact changes from 801,295 B raw / 215,875 B gzip
to 801,417 B raw / 215,992 B gzip (+122 B raw / +117 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,415 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Note Placement

`LibraryPdfMarkupLayer` now owns prospective note-placement start geometry, the
eight-pixel stationary-press threshold, pointer identity, completion, and
cancellation. It reports a normalized point only after a stationary release.
The PDF annotation machine no longer models `pressingNote`, its transient
context, guards, actions, or pointer events; `WorkspaceApp` sends `PLACE_NOTE`
only when the layer completes a valid press.

This checkpoint reduces `src/client/app.ts` from 7,014 to 7,002 lines (-12), the
PDF annotation machine from 289 to 221 lines (-68), and the three runtime files
by 39 lines overall. Focused unit coverage passes stationary, moved,
mismatched-pointer, completion, and cancellation behavior. The private-PDF
browser flow passes note placement, editing, movement, drawing, recognition,
persistence, rendering, and annotated export.

The browser application artifact changes from 801,417 B raw / 215,992 B gzip
to 800,438 B raw / 215,744 B gzip (-979 B raw / -248 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,414 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Complete PDF Drawing Gestures

`LibraryPdfMarkupLayer` now owns the complete transient drawing gesture: active
pointer identity, normalized points, coalesced-sample expansion, duplicate
rejection, reactive draft rendering, recognition timing, snapped geometry,
shape manipulation, cancellation, and completion. It returns final points only
for coordinator-owned persistence. The PDF annotation machine no longer stores
drawing geometry or models drawing and shape-manipulation states, and
`WorkspaceApp` no longer mirrors draft geometry or routes incremental drawing
events.

This checkpoint reduces `src/client/app.ts` from 7,002 to 6,958 lines (-44), the
PDF annotation machine from 221 to 166 lines (-55), and the three runtime files
by 84 lines overall. Focused unit coverage passes active and mismatched pointers,
coalesced samples, duplicate rejection, recognition, adjustment, completion,
and cancellation. The private-PDF browser flow passes a real held-pointer stroke,
recognition, persistence, rendering, and annotated export.

The browser application artifact changes from 800,438 B raw / 215,744 B gzip
to 798,434 B raw / 215,245 B gzip (-2,004 B raw / -499 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,412 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Complete PDF Note Dragging

`LibraryPdfMarkupLayer` now owns note identity and pointer identity for the full
drag lifecycle in addition to its existing threshold, preview, completion, and
cancellation behavior. Its completion result gives `WorkspaceApp` everything
needed to toggle a stationary note or persist a moved note. The PDF annotation
machine no longer models `draggingNote`, note-drag context, pointer guards, or
drag lifecycle events, leaving it responsible for tool, selection, and note
composition or editing workflow only.

This checkpoint reduces `src/client/app.ts` from 6,958 to 6,938 lines (-20), the
PDF annotation machine from 166 to 133 lines (-33), and the three runtime files
by 52 lines overall. Focused unit coverage passes stationary and moved previews,
mismatched pointers, completion identity, and cancellation. The private-PDF
browser flow passes note selection, opening, editing, movement, and persistence
before drawing, recognition, rendering, and annotated export.

The browser application artifact changes from 798,434 B raw / 215,245 B gzip
to 797,474 B raw / 214,991 B gzip (-960 B raw / -254 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,412 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Source Completion Interaction

`SourceCompletion` now owns its editor keyboard and delayed-blur lifecycle in
addition to option presentation, selection, and ARIA state. It restores and
persists the browser-local citation suggestion scope and reports scope changes
as typed intents. `WorkspaceApp` retains candidate generation, private-Library
loading and linking, Yjs edits, caret restoration, and menu positioning.

This checkpoint reduces `src/client/app.ts` from 6,938 to 6,926 lines (-12).
The component grows from 119 to 170 lines to contain its reusable binding and
cleanup lifecycle, for 39 additional runtime lines overall. Focused unit
coverage passes persisted scope restoration, scope-change intents, keyboard
acceptance, and delayed dismissal. The include-completion browser flow passes
Enter and Tab acceptance through the bound editor lifecycle.

The browser application artifact changes from 797,474 B raw / 214,991 B gzip
to 798,193 B raw / 215,085 B gzip (+719 B raw / +94 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,413 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Complete PDF Annotation State

`LibraryPdfMarkupLayer` now owns the remaining private-PDF interaction state:
active tool, saved-highlight or markup selection, note composition or editing,
and the open note card. Note-card dismissal and focus restoration are local to
the layer. `WorkspaceApp` retains authorized persistence, refreshes, inspector
policy, and notifications, and the separate PDF annotation XState machine is
deleted.

This checkpoint reduces `src/client/app.ts` from 6,926 to 6,883 lines (-43),
deletes the 133-line annotation machine, and grows the markup layer from 467 to
538 lines (+71), for 105 fewer runtime lines overall. Focused component coverage
passes tool changes, guarded note placement, selection exclusivity, note
composition and editing, card toggling, pointer gestures, and shape recognition.
The private-PDF browser flow passes note placement, editing, movement, drawing,
recognition, persistence, rendering, and annotated export.

The browser application artifact changes from 798,193 B raw / 215,085 B gzip
to 796,823 B raw / 214,550 B gzip (-1,370 B raw / -535 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,408 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Starting-Point Catalog State

`ProjectStartingPointBrowser` now owns the fetched template catalog, optimistic
hidden-template IDs, and the derived visible-template view used by both its
starting-point list and the save-template replacement dialog. `WorkspaceApp`
retains validated requests, deferred deletion, durable mutations, project
creation, and import workflows without duplicating the component's array or
set.

This checkpoint reduces `src/client/app.ts` from 6,883 to 6,871 lines (-12)
and grows the starting-point component from 484 to 492 lines (+8), for four
fewer runtime lines overall. Focused component coverage passes hide, restore,
selection normalization, creation, project-source loading, and modal focus.
The browser workflow passes built-in, promoted personal, and existing-project
starting points plus template deletion and replacement.

The browser application artifact changes from 796,823 B raw / 214,550 B gzip
to 797,020 B raw / 214,591 B gzip (+197 B raw / +41 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,408 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: GitHub Preview Identity

`GitHubImportPanel` and `GitHubSyncReview` now own their opaque preview IDs and
confirmation working state. Enabled confirmation intents carry only the current
preview ID, and `WorkspaceSettingsPanel` preserves that detail while forwarding
nested sync-review events. `WorkspaceApp` retains requests, payload validation
and construction, project refresh, and navigation.

This checkpoint reduces `src/client/app.ts` from 6,871 to 6,858 lines (-13).
The import panel grows from 407 to 410 lines, the sync review from 364 to 374,
and the settings panel from 283 to 285, for two additional runtime lines
overall while deleting three duplicated coordinator identity fields. Focused
component coverage passes preview identity, guarded confirmation, and
progress/error/success lifecycle behavior. Four focused browser workflows pass
import, incoming pull, conflict resolution, and publish confirmation.

The browser application artifact changes from 797,020 B raw / 214,591 B gzip
to 796,904 B raw / 214,612 B gzip (-116 B raw / +21 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,410 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Residual Component State

`LibraryPdfUploadStatus` now owns the ephemeral failed-file retry selection and
emits it only from a guarded retry intent. `LibraryToolsMenu` is the canonical
owner of archived-reference visibility, which `WorkspaceApp` reads when loading
the Library. `ProjectExportDialog` retains the latest word-statistics projection
it already synchronizes across the badge and nested statistics panel.

This checkpoint reduces `src/client/app.ts` from 6,858 to 6,848 lines (-10),
grows the upload status from 122 to 125 lines and the tools menu from 86 to 90,
and removes three runtime lines overall. Focused component coverage passes
guarded failed-file retry details and archived-visibility reads. Three browser
workflows pass partial PDF retry, archived duplicate reveal, and live export
statistics.

The browser application artifact changes from 796,904 B raw / 214,612 B gzip
to 797,057 B raw / 214,636 B gzip (+153 B raw / +24 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,410 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Citation Network Snapshots

`CitationNetworkWorkspace` now owns the latest validated network and expansion
presentation snapshots it synchronizes into the nested graph/list panel.
`WorkspaceApp` retains authorized requests, validation, provenance-bearing
mutations, refresh sequencing, prompts, and notifications without caching a
second copy or rebuilding the component payload through a render helper.

This checkpoint reduces `src/client/app.ts` from 6,848 to 6,840 lines (-8) and
grows the citation-network workspace from 120 to 130 lines, for two additional
runtime lines overall while deleting two coordinator fields and one assembly
helper. Focused component coverage passes independent network and expansion
snapshot updates. The browser workflow passes manual assertions, review,
snowball expansion, candidate acceptance, provenance, and accessible graph/list
presentation.

The browser application artifact changes from 797,057 B raw / 214,636 B gzip
to 797,142 B raw / 214,626 B gzip (+85 B raw / -10 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,410 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Toast Action Lifecycle

`AppToast` now owns one-shot action callbacks and a pinned fallback notice in
addition to message rendering, timers, modal reparenting, and popover state.
This keeps an activated application update available after transient notices
without coordinator action or reminder fields. `WorkspaceApp` still supplies
authorized effects and retains deferred-deletion authority, offline persistence,
and notification policy.

This checkpoint reduces `src/client/app.ts` from 6,840 to 6,808 lines (-32) and
grows the toast component from 100 to 118 lines, for 14 fewer runtime lines
overall. Focused component coverage passes one-shot callback execution,
transient dismissal, and pinned-notice restoration. Four browser workflows pass
project deletion, template deletion and replacement, and application-update
retention in both workspace and Library modes.

The browser application artifact changes from 797,142 B raw / 214,626 B gzip
to 797,065 B raw / 214,599 B gzip (-77 B raw / -27 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,411 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Detection Identity

`PdfHighlightImportPanel` now owns the opaque artifact identity associated with
its current detection result and carries that identity with a guarded import
intent. Detection, error, reset, and cancel transitions clear the identity
locally. `WorkspaceApp` retains PDF inspection, duplicate filtering,
active-reader validation, mutation, refresh, and notification policy without a
second identity field.

This checkpoint reduces `src/client/app.ts` from 6,808 to 6,803 lines (-5) and
grows the import panel from 209 to 215 lines, for one additional runtime line
overall. Focused component coverage passes guarded result identity, reviewed
candidate values, cancellation, and stale-import suppression. The private-PDF
browser workflow passes native and flattened detection, reviewed import,
annotation editing, and export.

The browser application artifact changes from 797,065 B raw / 214,599 B gzip
to 797,102 B raw / 214,617 B gzip (+37 B raw / +18 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,411 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Preview Source Map

`PreviewSyncControls` now owns the current composition source map and resolves
both Preview-to-source and source-to-Preview offsets for the directional
intents it presents. `WorkspaceApp` retains active-file and editor-offset
selection, caret placement, scrolling, focus, and Preview document navigation
without caching the map or maintaining a separate offset helper.

This checkpoint reduces `src/client/app.ts` from 6,803 to 6,797 lines (-6) and
grows the synchronization control from 62 to 78 lines, for ten additional
runtime lines overall. Focused component coverage passes source-map updates and
both resolution directions. Two browser workflows pass clicked and centered
Preview-to-source navigation plus explicit and automatic source-to-Preview
synchronization.

The browser application artifact changes from 797,102 B raw / 214,617 B gzip
to 797,274 B raw / 214,638 B gzip (+172 B raw / +21 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,411 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Private Highlight Draft

`LibraryPdfAnnotationForms` now owns the complete private-highlight draft:
page, quotation, comment, captured rectangles, and optional editing identity.
Its typed save intent carries that reviewed draft to `WorkspaceApp`, which
retains active-resource validation, overlap policy, persistence, refreshes, and
notifications without caching geometry or editing state.

This checkpoint reduces `src/client/app.ts` from 6,797 to 6,787 lines (-10) and
grows the annotation forms from 295 to 307 lines, for two additional runtime
lines overall while deleting two coordinator fields. Focused component coverage
passes complete create and edit draft payloads plus composer cancellation. Two
browser workflows pass private-highlight creation, extension, note editing,
erasing, deletion, detected import, and annotated export.

The browser application artifact changes from 797,274 B raw / 214,638 B gzip
to 797,182 B raw / 214,623 B gzip (-92 B raw / -15 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,411 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Browser Shell Registry Deduplication

The browser shell now resolves all required native and Lit elements through one
typed `app-elements` registry. TypeScript infers the complete registry shape
from the constructors checked at startup, so `WorkspaceApp` no longer repeats
the same 86 entries in a manually synchronized interface or owns the lookup
helper. Theme preference lookup joins the same boundary.

This checkpoint reduces `src/client/app.ts` from 6,787 to 6,539 lines (-248).
The extracted 165-line registry replaces 266 removed registry, interface, and
import lines, reducing runtime source by 83 lines overall. Focused coverage
checks all 87 unique element identities through the inferred boundary and the
missing-or-wrong-constructor failure path.

The browser application artifact changes from 797,182 B raw / 214,623 B gzip
to 797,139 B raw / 214,746 B gzip (-43 B raw / +123 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,413 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Model Discovery Lifecycle

`ModelProviderSettings` now owns its browser-local model discovery request,
overlapping-request guard, busy presentation, normalized result selection, and
failure recovery. Its existing typed change stream reports starting and final
status to `WorkspaceApp`, which retains assistant-workflow availability,
browser-local preference persistence, generation requests, and status mirroring
without a second busy field or discovery method.

This checkpoint reduces `src/client/app.ts` from 6,539 to 6,511 lines (-28) and
grows the settings component from 225 to 247 lines, reducing runtime source by
six lines overall. Focused component coverage passes successful, overlapping,
failed, and coordinator-disabled discovery plus preference normalization and
presentation.

The browser application artifact changes from 797,139 B raw / 214,746 B gzip
to 796,767 B raw / 214,985 B gzip (-372 B raw / +239 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,416 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Complete Source-Completion Intent

`SourceCompletion` now emits the selected citation or include candidate together
with its replacement context instead of reporting only a row index. The
component already owns option ordering and keyboard or pointer selection, so
the complete typed intent removes two context fields, two candidate arrays, and
the completion-kind discriminator from `WorkspaceApp`. The coordinator retains
candidate generation, private-Library linking, Yjs mutation, caret restoration,
and menu placement.

This checkpoint reduces `src/client/app.ts` from 6,511 to 6,480 lines (-31) and
grows the completion component from 170 to 182 lines, reducing runtime source
by 19 lines overall. Focused component coverage passes pointer-independent typed
acceptance, keyboard selection, dismissal, scope persistence, and option
presentation.

The browser application artifact changes from 796,767 B raw / 214,985 B gzip
to 796,585 B raw / 214,960 B gzip (-182 B raw / -25 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,416 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Residual Simplification: Library Completion Loading

Library-scoped citation completion now relies on its existing single-flight
loading guard without a second request-generation counter. Because a request
cannot start while that guard is active, the counter could never distinguish
two in-flight loads; failures still clear the guard and remain retryable.

This checkpoint reduces `src/client/app.ts` from 6,480 to 6,477 lines (-3) and
removes one coordinator field. The browser application artifact changes from
796,585 B raw / 214,960 B gzip to 796,515 B raw / 214,918 B gzip (-70 B raw /
-42 B gzip). Styles and direct and unique production package counts remain
unchanged at 135,411 B raw / 23,373 B gzip and 18 and 150.

Full native CI passes all 1,416 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Shared Annotation Composer State

`ProjectAnnotationForm` now owns its active annotation identity, selected paint
or erase tool, and last undoable stroke. Save and undo events carry the complete
typed intent needed by `WorkspaceApp`, which retains PDF geometry, persistence,
manuscript linking, refreshes, and notification policy without duplicating the
form's local lifecycle.

This checkpoint reduces `src/client/app.ts` from 6,477 to 6,466 lines (-11) and
grows the annotation form from 298 to 317 lines, increasing runtime source by
eight lines overall while removing three coordinator fields. Focused component
coverage passes capture and edit identity, save and link intent, tool choice,
complete undo intent, citation, and presentation behavior.

The browser application artifact changes from 796,515 B raw / 214,918 B gzip
to 796,895 B raw / 214,967 B gzip (+380 B raw / +49 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,416 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Complete Project-File Save Intent

`ProjectFileDialog` now retains the stable file or folder target associated with
its active operation and emits that identity with the mode and submitted path.
`WorkspaceApp` no longer caches a duplicate folder target or reconstructs the
mutation target from ambient selection; it continues to own the live Yjs
include continuation and persistence.

This checkpoint reduces `src/client/app.ts` from 6,466 to 6,462 lines (-4) and
grows the project-file dialog from 142 to 144 lines, reducing runtime source by
two lines overall and removing one coordinator field. Focused component
coverage passes operation classification, complete trimmed save intent,
presentation, focus, reuse, and cancellation.

The browser application artifact changes from 796,895 B raw / 214,967 B gzip
to 796,941 B raw / 214,964 B gzip (+46 B raw / -3 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,416 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Complete Assistant Result Context

`AssistantResultPanel` now retains the captured passage, source revision,
evidence, provider continuation, or table target associated with the transient
result it presents. Table insertion, clarity continuation, and revision choice
events carry that complete typed context, so `WorkspaceApp` no longer stores a
parallel result discriminator or context cache. The panel also derives whether
a table replaces a selection from its target instead of storing a second flag.

This checkpoint reduces `src/client/app.ts` from 6,462 to 6,431 lines (-31) and
grows the assistant result panel from 305 to 343 lines, increasing runtime
source by seven lines overall while removing one coordinator field and four
coordinator-only context types. Focused coverage passes empty and guarded
actions, table and clarity presentation, complete table/clarity/revision
intents, transient result adaptation, and reference-save progress.

The browser application artifact changes from 796,941 B raw / 214,964 B gzip
to 796,773 B raw / 214,895 B gzip (-168 B raw / -69 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,416 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Assistant Evidence Selection

`AssistantWorkflowStatus` now owns browser-local annotation and claim selection,
valid-key reconciliation, readonly selection snapshots, and the existing count
or limit status copy associated with **Choose evidence**. `WorkspaceApp` still
resolves selected keys against canonical workspace snapshots and enforces
generation policy, but no longer stores or formats a parallel selection set.

This checkpoint reduces `src/client/app.ts` from 6,431 to 6,422 lines (-9) and
grows the workflow-status component from 90 to 110 lines, increasing runtime
source by eleven lines overall while removing one coordinator field. Focused
coverage passes invalid-key rejection, annotation and claim selection, readonly
selection exposure, reconciliation, deselection, limit status, operation copy,
and typed workflow actions.

The browser application artifact changes from 796,773 B raw / 214,895 B gzip
to 797,222 B raw / 214,811 B gzip (+449 B raw / -84 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,417 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: GitHub Picker Discovery

`GitHubImportPanel` now owns the read-only connection, installation, repository,
and branch discovery sequence that exists solely to populate its local picker.
The component validates existing Valibot-backed response contracts, sorts
repositories, presents loading and failure states, and ignores superseded
connection responses. `WorkspaceApp` retains import preview and creation,
account disconnection, project refresh, and navigation mutations.

This checkpoint reduces `src/client/app.ts` from 6,422 to 6,332 lines (-90) and
grows the GitHub import panel from 410 to 514 lines, increasing runtime source
by fourteen lines overall while removing one coordinator field, two event
bridges, and four coordinator request methods. Focused coverage passes connected
discovery, sorted picker population, disconnected and failed connection states,
superseded response rejection, preview and creation presentation, typed intents,
and native dialog lifecycle.

The browser application artifact changes from 797,222 B raw / 214,811 B gzip
to 797,112 B raw / 214,964 B gzip (-110 B raw / +153 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,420 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. One PDF zoom scenario timed out once, then passed both in
isolation and in the complete rerun.

## Continued Lit Ownership: GitHub Sync Review Requests

`GitHubSyncReview` now owns the Pull and Publish preview and confirmation
requests, confirmation payloads, response validation, disconnect confirmation,
and success or error presentation that serve only its local review workflow.
It emits one completed-mutation event after a successful external change;
`WorkspaceApp` retains canonical project refresh and the cross-component sync
status refresh. `WorkspaceSettingsPanel` configures the nested review through
its Lit lifecycle instead of forwarding five intermediate intent events.

This checkpoint reduces `src/client/app.ts` from 6,332 to 6,257 lines (-75).
Across the app coordinator, detailed sync review, and settings panel, runtime
source falls from 6,991 to 6,965 lines (-26). Focused coverage passes request
payloads, existing Valibot-backed preview validation, failure presentation,
parent-child configuration timing, and completed mutation events. The four
GitHub browser scenarios also pass after explicitly preserving success feedback
through the subsequent read-only status refresh.

The browser application artifact changes from 797,112 B raw / 214,964 B gzip
to 796,643 B raw / 215,299 B gzip (-469 B raw / +335 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,421 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: GitHub Sync Status Refresh

`GitHubSyncMenu` now owns the bounded read-only project connection and status
requests that feed its primary toolbar presentation, including the refresh
interval, existing Valibot-backed connection validation, status validation,
failure presentation, and stale-request rejection. It emits one typed state
event for the settings mirror. `WorkspaceApp` retains online and active-review
pause policy, explicit refresh triggers, canonical project refresh, and preview
entry points, but no longer owns sync request counters or rendering adapters.

This checkpoint reduces `src/client/app.ts` from 6,257 to 6,219 lines (-38)
and grows the sync menu from 134 to 197 lines. Runtime source across those files
increases by 25 lines while removing two coordinator fields and five
coordinator-only request, validation, and presentation methods. Focused coverage
passes interval gating, connected and disconnected presentation, request
failure, and superseded-response rejection. All four GitHub browser scenarios
also pass.

The browser application artifact changes from 796,643 B raw / 215,299 B gzip
to 797,130 B raw / 215,382 B gzip (+487 B raw / +83 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,424 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Coordinator Reduction: Offline Save Queue

A reusable `DebouncedAsyncQueue` now owns the timer, monotonic version,
serialized promise chain, stale-completion guard, failure recovery, and flush
behavior used by offline workspace persistence. `WorkspaceApp` retains the
domain policy for when a project is eligible for an offline save, the snapshot
write itself, and the resulting editor, dataset, and toast presentation, but no
longer carries three independent scheduling fields or the queue algorithm.

This checkpoint reduces `src/client/app.ts` from 6,219 to 6,210 lines (-9),
grows the shared collaboration coordination module from 99 to 135 lines, and
increases runtime source by 27 lines while isolating a concurrency mechanism
behind one tested boundary. Focused coverage passes debounce replacement,
latest-version completion, serialized recovery after failure, active-work
flush, and pending-work cancellation.

The browser application artifact changes from 797,130 B raw / 215,382 B gzip
to 797,320 B raw / 215,470 B gzip (+190 B raw / +88 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,427 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: LaTeX Import Requests

`LatexImportPanel` now owns both authenticated phases of its local workflow:
bounded archive preview and reviewed project creation. It constructs each
request from the archive, selected root, preview digest, bibliography choice,
and title already held by the component; validates preview and created-workspace
responses through shared Valibot contracts; presents request failures; and
emits only cancel or completed-navigation actions. `WorkspaceApp` retains the
browser navigation authority.

This checkpoint reduces `src/client/app.ts` from 6,210 to 6,150 lines (-60)
and grows the LaTeX import panel from 309 to 340 lines. Including the seven-line
shared result contract, runtime source across those files increases by two
lines while removing four coordinator-only request and adaptation methods.
Focused coverage passes request URLs and archive bodies, reviewed confirmation
parameters, malformed preview and creation responses, local bounds, component
state transitions, and typed completed navigation.

The browser application artifact changes from 797,320 B raw / 215,470 B gzip
to 797,241 B raw / 215,470 B gzip (-79 B raw / unchanged gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,429 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: GitHub Import Mutations

`GitHubImportPanel` now owns the complete picker-local workflow: connection and
repository discovery, import preview, reviewed project creation, and account
disconnection. It constructs request payloads from the installation,
repository, branch, root, entry, preview identity, and title already held by the
component; validates created-workspace responses through a shared Valibot
contract; and presents request progress and failures locally. The application
coordinator receives only cancellation or the completed workspace href and
retains browser navigation.

This checkpoint reduces `src/client/app.ts` from 6,150 to 6,099 lines (-51)
and grows the GitHub import panel from 514 to 560 lines. Including the seven-line
shared result contract, runtime source across those files increases by two
lines while removing three coordinator-only request methods and two event
bridges. Focused coverage passes discovery, stale discovery rejection, import
payloads, reviewed creation, account disconnection and refresh, Valibot result
validation, dialog lifecycle, and typed cancellation and navigation.

The browser application artifact changes from 797,241 B raw / 215,470 B gzip
to 796,925 B raw / 215,353 B gzip (-316 B raw / -117 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,430 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project Starting-Point Requests

`ProjectStartingPointBrowser` now owns template-catalog loading,
existing-project preview loading, and project creation. It constructs creation
requests from the title and selected starting point already held locally,
validates catalog, preview, and created-workspace responses through the existing
domain guards, contains request failures in its status presentation, and emits
only import/cancel actions, template-delete intent, or the completed workspace
href. `WorkspaceApp` retains navigation, its shared deferred-deletion policy,
and template promotion.

This checkpoint reduces `src/client/app.ts` from 6,099 to 6,062 lines (-37)
and grows the starting-point browser from 489 to 535 lines. Runtime source
across those files increases by nine lines while removing two coordinator-only
request methods, the project-creation method, and one event bridge. Focused
coverage passes catalog loading and validation, built-in and existing-project
creation payloads, preview loading, contained request failures, local selection,
template deletion intent, and dialog lifecycle.

The browser application artifact changes from 796,925 B raw / 215,353 B gzip
to 797,264 B raw / 215,343 B gzip (+339 B raw / -10 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,432 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Workspace Sharing Requests

`WorkspaceSharingPanel` now owns collaborator listing and invitation plus the
read-only and edit capability-link status, creation, and revocation lifecycles.
It validates status and created-link responses through shared Valibot contracts,
renders forbidden and failed request states locally, refreshes affected state
after mutations, and emits only user-facing notices. `WorkspaceApp` retains the
global toast presentation used for those notices.

This checkpoint reduces `src/client/app.ts` from 6,062 to 5,964 lines (-98),
grows the sharing panel from 251 to 320 lines, and adds five lines to the shared
Valibot contract module. Runtime source across those files decreases by 24
lines while removing seven coordinator-only request methods and two intent
adapters. Focused coverage passes member and link refresh, owner-only status,
create and revoke requests, invitation payloads and refresh, malformed mutation
containment, Valibot result validation, presentation, and modal lifecycle.

The browser application artifact changes from 797,264 B raw / 215,343 B gzip
to 797,028 B raw / 215,599 B gzip (-236 B raw / +256 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,436 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Library Discovery Search

`LibraryDiscoverySearch` now owns its scholarly-provider request and response
validation together with the query, duplicate-submit guard, progress, result
count, and failure state it already held. It clears and emits validated result
lists through one typed event. `WorkspaceApp` only routes those results to the
sibling presentation component and retains the reference-import path shared
with assistant discovery.

This checkpoint reduces `src/client/app.ts` from 5,964 to 5,949 lines (-15)
and grows the discovery-search component from 129 to 159 lines. Runtime source
across those files increases by 15 lines while removing one coordinator-only
request method and replacing its query adapter with a validated-result bridge.
Focused coverage passes request payloads, duplicate-submit gating, result and
empty states, provider failures, malformed responses, form values, and missing
control errors.

The browser application artifact changes from 797,028 B raw / 215,599 B gzip
to 797,265 B raw / 215,631 B gzip (+237 B raw / +32 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,437 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Workspace Settings Mutations

`WorkspaceSettingsPanel` now owns title, entry-file, and publication-profile
persistence plus archive/restore, duplication, and permanent deletion. It owns
the destructive prompts, request overlap guard, disabled controls, local error
presentation, and duplicate-response validation, and emits only navigation,
catalog-refresh, or save-as-template outcomes. `WorkspaceApp` retains those
cross-feature outcomes and GitHub synchronization.

This checkpoint reduces `src/client/app.ts` from 5,949 to 5,906 lines (-43)
and grows the settings panel from 274 to 372 lines. Runtime source across those
files increases by 55 lines while removing four coordinator-only mutation
methods and narrowing one five-way action adapter to three cross-feature
outcomes. Focused coverage passes settings payloads, navigation targets,
archive refresh, duplication, destructive confirmation, malformed responses,
request failures and overlap, modal reuse, and missing-control errors.

The browser application artifact changes from 797,265 B raw / 215,631 B gzip
to 798,376 B raw / 215,938 B gzip (+1,111 B raw / +307 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,438 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Shared Client HTTP Contract

A 24-line client HTTP adapter now owns same-origin JSON request construction,
supported write methods, unsuccessful-response parsing, Valibot validation of
the bounded `{ error: string }` API contract, status-aware fallback errors, and
caught-value message normalization. `WorkspaceApp`, the review-study workflow,
and eight request-owning Lit components now import that contract instead of
maintaining local variants.

This checkpoint reduces `src/client/app.ts` from 5,906 to 5,892 lines (-14)
and removes 132 lines from the ten existing runtime modules. Including the new
24-line shared adapter, runtime source decreases by 108 lines. Focused coverage
passes JSON method, body, header and credential construction, successful
responses, validated API errors, malformed and non-JSON fallbacks, and caught
value normalization; existing request-component suites remain green.

The browser application artifact changes from 798,376 B raw / 215,938 B gzip
to 795,979 B raw / 215,271 B gzip (-2,397 B raw / -667 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,442 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Publication Intake Workflow

`PublicationIntakePanel` now owns the complete browser-local DOI workflow: its
XState actor, active-PDF identity, preview and acceptance requests, response
validation, request generations, stale-response rejection, cancellation,
status, busy state, and focus handoff. A successful acceptance remains in the
machine's accepting state until `WorkspaceApp` refreshes the canonical snapshot
and acknowledges the accepted DOI; refresh failure returns the panel to review.
The coordinator retains only that canonical refresh, publication navigation,
and toast presentation.

This checkpoint reduces `src/client/app.ts` from 5,892 to 5,774 lines (-118)
and grows the intake panel from 208 to 294 lines. Runtime source across those
files decreases by 32 lines while removing one coordinator actor and seven
request, stale-response, and presentation methods. Focused coverage passes
preview and acceptance payloads, cancellation, linked presentation, provider
and malformed failures, delayed preview rejection after PDF changes, refresh
acknowledgement, and typed navigation outcomes.

The browser application artifact changes from 795,979 B raw / 215,271 B gzip
to 795,747 B raw / 216,404 B gzip (-232 B raw / +1,133 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,445 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project Template Promotion

`ProjectTemplateSaveDialog` now owns create-or-replace promotion requests,
saved-summary validation, duplicate-submit gating, progress, local request and
response errors, disabled controls, modal completion, and a typed validated
result. `WorkspaceApp` retains only the shared template-catalog refresh and
cross-feature toast after a successful save.

This checkpoint reduces `src/client/app.ts` from 5,774 to 5,764 lines (-10)
and grows the save dialog from 183 to 223 lines. Runtime source across those
files increases by 30 lines while removing the remaining raw save intent and
coordinator-only promotion method. Focused coverage passes create and replace
payloads and outcomes, request errors, malformed successful responses, loading,
focus, cancellation, replacement values, and missing-control errors.

The browser application artifact changes from 795,747 B raw / 216,404 B gzip
to 796,405 B raw / 216,512 B gzip (+658 B raw / +108 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,447 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project History Workflow

`ProjectHistoryDialog` now owns the browser-local XState actor, timeline,
inspect, compare, milestone, restore, and branch requests, response validation,
confirmations, request generations, stale-response rejection, busy and error
state, and modal lifecycle. It emits only typed notice, navigation, reload, and
close outcomes. `WorkspaceApp` retains toast and browser-navigation policy.

This checkpoint reduces `src/client/app.ts` from 5,764 to 5,601 lines (-163)
and grows the history dialog from 80 to 221 lines. Runtime source across those
files decreases by 22 lines while removing one coordinator actor and eleven
request, operation, availability, and failure methods. Focused coverage passes
timeline loading, inspect and compare projections, milestone payload and
refresh, restore and branch outcomes, provider and malformed failures, modal
lifecycle, and missing server-rendered children.

The browser application artifact changes from 796,405 B raw / 216,512 B gzip
to 796,874 B raw / 216,369 B gzip (+469 B raw / -143 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,449 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Metadata Refinement Workflow

`LibraryReferenceMetadataEditor` now owns its browser-local XState actor,
bounded PDF extraction, provider preview and acceptance requests, response
validation, request supersession, busy and retryable error state, PDF metadata
acceptance, and validated refresh or notice outcomes. `WorkspaceApp` retains
manual metadata persistence, canonical Library/project refresh, and toast
policy.

This checkpoint reduces `src/client/app.ts` from 5,601 to 5,497 lines (-104)
and grows the metadata editor from 437 to 548 lines. Runtime source across
those files increases by 7 lines while removing one coordinator actor and five
request, payload, apply, and failure methods. Focused coverage passes local
extraction and preview payloads, cache presentation, provider and malformed
fallback, PDF and mixed-provider acceptance payloads, retry after fingerprint
failure, and delayed extraction rejection after the editor switches sources.

The browser application artifact changes from 796,874 B raw / 216,369 B gzip
to 797,869 B raw / 216,598 B gzip (+995 B raw / +229 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,454 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Web Source Requests

`WebSourceCapture` now owns URL capture requests, duplicate-submit gating,
progress, local failures, reset, and a typed captured outcome shared by the
top-level form and per-source recapture actions. `WebSnapshotComparisonPanel`
owns comparison requests, Valibot-backed response validation, progress,
failures, and neutral diff presentation. `WorkspaceApp` retains canonical
Library refresh and toast policy.

This checkpoint reduces `src/client/app.ts` from 5,497 to 5,484 lines (-13)
and grows the two-panel module from 129 to 183 lines. Runtime source across
those files increases by 41 lines while removing four coordinator capture and
comparison methods or adapters. Focused coverage passes capture payloads,
duplicate submission, provider errors, identical and changed comparisons,
malformed comparison responses, and both light-DOM boundaries.

The browser application artifact changes from 797,869 B raw / 216,598 B gzip
to 798,749 B raw / 216,769 B gzip (+880 B raw / +171 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,456 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Citation Network Workflow

`CitationNetworkWorkspace` now owns network loading and project filtering,
request generations, response guards, manual assertion and review mutations,
Crossref expansion, candidate acceptance, prompts, local progress and retryable
failures, and typed notice or Library-refresh outcomes. `WorkspaceApp` retains
only canonical Library refresh and toast policy.

This checkpoint reduces `src/client/app.ts` from 5,484 to 5,399 lines (-85)
and grows the workspace from 130 to 268 lines. Runtime source across those
files increases by 53 lines while removing six coordinator request and mutation
methods plus two event adapters. Focused coverage passes load and project-filter
URLs, stale-response rejection, assertion and review payloads, expansion,
candidate acceptance, invalid selections, malformed representations, provider
errors, visibility, and nested panel synchronization.

The browser application artifact changes from 798,749 B raw / 216,769 B gzip
to 799,986 B raw / 217,066 B gzip (+1,237 B raw / +297 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,459 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Personal Library Mutations

`LibraryReferencePersonalFields` now owns tag, collection, reading-state,
private-note, and archive requests; comma-separated payload normalization;
archive confirmation; duplicate-submit gating; local progress and retryable
failures; and one typed successful-refresh outcome. `WorkspaceApp` retains only
canonical Library refresh and toast policy.

This checkpoint reduces `src/client/app.ts` from 5,399 to 5,339 lines (-60)
and grows the personal-fields component from 174 to 268 lines. Runtime source
across those files increases by 34 lines while removing five coordinator
mutation methods and the five-way action adapter. Focused coverage passes all
five request payloads, success outcomes, archive cancellation, empty notes,
provider failures, and duplicate submissions.

The browser application artifact changes from 799,986 B raw / 217,066 B gzip
to 800,138 B raw / 217,105 B gzip (+152 B raw / +39 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,461 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Manual Metadata Persistence

`LibraryReferenceMetadataEditor` now also owns manual bibliographic PATCH
payloads, duplicate-submit gating, and retryable failures. Its existing typed
refresh and notice outcomes cover both manual and reviewed metadata operations;
`WorkspaceApp` no longer brokers a separate manual-save intent.

This checkpoint reduces `src/client/app.ts` from 5,339 to 5,309 lines (-30)
and grows the metadata editor from 548 to 562 lines. Runtime source across
those files decreases by 16 lines while removing the final metadata request
method and action adapter from the coordinator. Focused coverage passes the
normalized manual payload, successful refresh, provider failure, and duplicate
submission behavior alongside the existing refinement workflow.

The browser application artifact changes from 800,138 B raw / 217,105 B gzip
to 800,036 B raw / 217,149 B gzip (-102 B raw / +44 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,462 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Rights Persistence

`LibraryReferencePdfRows` now owns rights PUT requests, value validation,
duplicate-submit gating, local progress and retryable failures, and a typed
successful-refresh outcome. `WorkspaceApp` retains PDF opening, cross-component
metadata refinement, and canonical Library refresh policy.

This checkpoint reduces `src/client/app.ts` from 5,309 to 5,308 lines (-1)
and grows the PDF rows from 95 to 119 lines. Runtime source across those files
increases by 23 lines; the small line-count result reflects replacing the
request method with an explicit canonical-refresh listener. Focused coverage
passes the rights payload, invalid value, success, provider failure, duplicate
submission, opening, and secondary-PDF refinement behavior.

The browser application artifact changes from 800,036 B raw / 217,149 B gzip
to 800,470 B raw / 217,180 B gzip (+434 B raw / +31 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,463 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Batch Intake

`LibraryPdfUploadControl` now binds its spatially separate status component and
owns ordered batch execution, upload transport, response validation,
partial-failure projection, retries, duplicate-submit gating, and
refresh-pending state. It emits typed notice or refresh outcomes;
`WorkspaceApp` retains only canonical Library refresh, refresh acknowledgment,
duplicate-source navigation, and toast policy.

This checkpoint reduces `src/client/app.ts` from 5,308 to 5,246 lines (-62)
and grows the upload control from 120 to 199 lines. Runtime source across those
files increases by 17 lines while removing the coordinator message helper,
three upload lifecycle methods, transport/validation method, and retry/action
adapters. Focused coverage passes created and existing payloads, malformed
responses, all-failed batches, status-triggered retries, stale refresh
acknowledgment, duplicate submissions, and refresh-pending gating.

The browser application artifact changes from 800,470 B raw / 217,180 B gzip
to 800,799 B raw / 217,499 B gzip (+329 B raw / +319 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,465 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Reference File Imports

The new `LibraryReferenceImportControl` progressively enhances the existing
BibTeX and CSL JSON inputs and owns file selection and reset, file reads, both
import transports, duplicate-submit gating, local busy and retryable failure
state, and refresh-pending acknowledgment. `WorkspaceApp` retains canonical
Library refresh and toast policy.

This checkpoint reduces `src/client/app.ts` from 5,246 to 5,234 lines (-12),
replaces two raw application element references with one component, and adds a
124-line component. Runtime source across the shell and new component increases
by 112 lines; most of that fixed cost is the accessible light-DOM fallback
template and direct transport coverage. Focused coverage passes both request
formats and success messages, refresh-pending gating, stale acknowledgment,
provider failure, and concurrent-import rejection.

The browser application artifact changes from 800,799 B raw / 217,499 B gzip
to 802,484 B raw / 217,790 B gzip (+1,685 B raw / +291 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,468 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Archive Restore and Refresh Policy

`LibraryToolsMenu` now owns portable-archive restore transport,
duplicate-submit gating, local busy and retryable failure state, and
refresh-pending acknowledgment. `WorkspaceApp` also consolidates the repeated
canonical Library refresh, success/fallback toast, optional component
acknowledgment, and alternate bibliographic-refresh policy used by PDF intake,
reference-file imports, archive restore, web capture, personal fields, metadata
refinement, and citation candidates.

This checkpoint reduces `src/client/app.ts` from 5,234 to 5,207 lines (-27)
and grows the tools menu from 90 to 145 lines. Runtime source across those files
increases by 28 lines while removing archive transport plus six duplicated
refresh-completion methods or branches. Focused coverage passes archive request
headers and body, successful acknowledgment, stale acknowledgment,
duplicate-submit gating, provider failure, and all existing refresh-producing
component outcomes.

The browser application artifact changes from 802,484 B raw / 217,790 B gzip
to 803,246 B raw / 217,909 B gzip (+762 B raw / +119 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,470 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Legacy PDF Identification

`UnidentifiedPdfList` now owns the legacy artifact-to-reference identification
transport, duplicate-submit gating, local progress and retryable failure state,
and refresh-pending acknowledgment in addition to its existing selection and
presentation responsibilities. `WorkspaceApp` retains only canonical Library
refresh and toast policy.

This checkpoint reduces `src/client/app.ts` from 5,207 to 5,201 lines (-6) and
grows the identification queue from 117 to 144 lines. Runtime source across
those files increases by 21 lines while replacing a coordinator mutation with
explicit local failure and refresh-pending behavior. Focused coverage passes
the request payload, successful refresh outcome, stale acknowledgment,
selection cleanup, retryable provider failure, and missing-selection guard.

The browser application artifact changes from 803,246 B raw / 217,909 B gzip
to 803,860 B raw / 218,031 B gzip (+614 B raw / +122 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,471 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Discovery Result Persistence

`LibraryDiscoveryResults` now owns discovered-metadata CSL projection, import
transport, per-result duplicate-submit gating, local save progress and
retryable failure state, stale-response rejection, and refresh-pending
acknowledgment. Shared CSL projection and identifier verification URLs moved
to the reference-discovery domain so the Library and assistant surfaces no
longer depend on one UI component for another component's rules.
`WorkspaceApp` retains the assistant-result import workflow plus canonical
Library refresh and toast policy.

This checkpoint reduces `src/client/app.ts` from 5,201 to 5,174 lines (-27),
reduces the assistant result panel from 343 to 335 lines, grows the Library
results panel from 105 to 141 lines, and grows the shared discovery domain from
203 to 228 lines. Runtime source across those files increases by 26 lines while
removing a cross-component dependency and the Library-specific coordinator
mutation. Focused coverage passes CSL payload projection, all verification URL
schemes, successful and failed imports, duplicate submission, stale refresh
acknowledgment, and replaced-result response rejection.

The browser application artifact changes from 803,860 B raw / 218,031 B gzip
to 804,525 B raw / 218,170 B gzip (+665 B raw / +139 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,475 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Assistant Reference Persistence

`AssistantResultPanel` now owns discovered-reference import requests,
per-result duplicate-submit gating, local save progress and retryable failures,
stale-response rejection, and refresh-pending acknowledgment. Both assistant
and Library discovery cards use a new 12-line `importDiscoveredReference`
adapter for the shared CSL JSON endpoint instead of maintaining parallel
request protocols. `WorkspaceApp` retains canonical Library refresh and the
assistant workflow-status projection.

This checkpoint reduces `src/client/app.ts` from 5,174 to 5,164 lines (-10),
grows the assistant result panel from 335 to 383 lines, reduces the Library
discovery results panel from 141 to 136 lines, and adds the 12-line shared
adapter. Runtime source across those files increases by 45 lines while removing
the coordinator import lifecycle and duplicate transport implementations.
Focused coverage passes the CSL payload, successful refresh outcome,
duplicate submission, stale acknowledgment, retryable provider failure, and
cleared-result response rejection.

The browser application artifact changes from 804,525 B raw / 218,170 B gzip
to 805,267 B raw / 218,149 B gzip (+742 B raw / -21 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,478 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project File Operations

`ProjectFileDialog` now owns file and folder mutation transport, endpoint
derivation from its stable target, response validation, duplicate-submit
gating, local busy and retryable failure state, modal completion, and operation
messages. It emits the completed mode, path, message, and validated workspace
snapshot. `WorkspaceApp` retains resource availability, collaborative include-
caret capture and Yjs insertion, snapshot application, selection, rendering,
and toast policy.

This checkpoint reduces `src/client/app.ts` from 5,164 to 5,141 lines (-23)
and grows the project-file dialog from 144 to 190 lines. Runtime source across
those files increases by 23 lines while removing the coordinator message
projection, request construction helper, response parsing, and dialog-close
lifecycle. Focused coverage passes create and rename endpoints, trimmed payloads,
stable encoded targets, validated snapshot outcomes, missing-target rejection,
provider failures, and retries.

The browser application artifact changes from 805,267 B raw / 218,149 B gzip
to 805,757 B raw / 218,496 B gzip (+490 B raw / +347 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,480 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Workspace Layout Selection

The new `WorkspaceLayoutControl` progressively enhances the server-rendered
project-view selector and owns its four-option template, normalized selected
value, workspace-scoped local persistence, storage-failure tolerance, and typed
change outcome. `WorkspaceApp` retains surface mutation, PDF activation, resize
notification, and URL synchronization.

This checkpoint reduces `src/client/app.ts` from 5,141 to 5,137 lines (-4),
replaces one raw select registry entry with the typed component, and adds a
110-line component. Runtime source across the app, component registry, view
fallback, and component increases by 107 lines; this is the fixed cost of
moving the complete responsive selector template and resilient storage contract
behind a typed owner. Focused coverage passes normalization, workspace-scoped
persistence, unavailable storage, typed changes, both server fallbacks, and the
required-element registry.

The browser application artifact changes from 805,757 B raw / 218,496 B gzip
to 807,357 B raw / 218,919 B gzip (+1,600 B raw / +423 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,483 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests, including workspace layout switching and reload
restoration.

## Continued Lit Ownership: Claim Persistence

`ClaimDialog` now owns create and edit transport, stable encoded claim targets,
request validation, evidence preconditions, duplicate-submit gating, local busy
and retryable failure state, modal completion, and the successful-save outcome.
`WorkspaceApp` retains claim-list refresh and workspace-level toast policy.

This checkpoint reduces `src/client/app.ts` from 5,137 to 5,125 lines (-12)
and grows the claim dialog from 196 to 220 lines. Runtime source across those
files increases by 12 lines while removing the coordinator save method and its
request-payload projection. Focused coverage passes create and edit requests,
encoded identities, missing evidence, retryable provider failures, successful
completion, and duplicate submissions.

The browser application artifact changes from 807,357 B raw / 218,919 B gzip
to 807,832 B raw / 219,045 B gzip (+475 B raw / +126 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,486 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Comment Resolution

`ManuscriptCommentList` now owns self-contained resolution transport, stable
encoded comment targets, request validation, duplicate-submit gating, pending
and retryable failure state, and the typed completed-resolution outcome on its
existing action channel. `WorkspaceApp` retains selection-dependent comment
creation and re-anchoring, project-resource refresh, toast policy, and passage
navigation.

This checkpoint reduces `src/client/app.ts` from 5,125 to 5,120 lines (-5) and
grows the manuscript comment list from 147 to 177 lines. Runtime source across
those files increases by 25 lines while removing the coordinator resolution
method. Focused coverage passes stable encoded targets, successful completion,
provider failure and retry, and duplicate resolution submissions.

The browser application artifact changes from 807,832 B raw / 219,045 B gzip
to 808,450 B raw / 219,265 B gzip (+618 B raw / +220 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,489 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Claim Deletion

`ClaimListPanel` now owns confirmation, deletion transport, stable encoded
claim targets, request validation, duplicate-submit gating, pending and
retryable failure state, and the typed completed-deletion outcome on its
existing action channel. `WorkspaceApp` retains canonical project-resource
refresh, toast policy, evidence selection, and editor-dependent claim links.

This checkpoint reduces `src/client/app.ts` from 5,120 to 5,117 lines (-3) and
grows the claim list from 210 to 245 lines. Runtime source across those files
increases by 32 lines while removing the coordinator deletion method. Focused
coverage passes cancellation, stable encoded targets, successful completion,
provider failure and retry, and duplicate deletion submissions.

The browser application artifact changes from 808,450 B raw / 219,265 B gzip
to 809,178 B raw / 219,449 B gzip (+728 B raw / +184 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,492 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Publication Enrichment

`PublicationListPanel` now owns DOI-enrichment transport, stable encoded
publication targets, request validation, duplicate-submit gating, pending and
retryable failure state, and the typed completed-enrichment outcome on its
existing action channel. `WorkspaceApp` retains canonical project-resource
refresh, workspace notification policy, publication navigation, and Library
management.

This checkpoint reduces `src/client/app.ts` from 5,117 to 5,111 lines (-6) and
grows the project publication list from 130 to 164 lines. Runtime source across
those files increases by 28 lines while removing the coordinator enrichment
method. Focused coverage passes stable encoded targets, successful completion,
provider failure and retry, and duplicate enrichment submissions.

The browser application artifact changes from 809,178 B raw / 219,449 B gzip
to 809,952 B raw / 219,542 B gzip (+774 B raw / +93 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,495 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Publication Paper Links

`PublicationContextPanel` now owns explicit project-PDF link and unlink
transport, stable encoded link targets, response validation, shared
duplicate-submit gating, pending and retryable failure state, and the typed
completed-relationship outcome on its existing action channel. `WorkspaceApp`
retains canonical project-resource refresh, workspace notification policy,
citation insertion, and paper navigation.

This checkpoint reduces `src/client/app.ts` from 5,111 to 5,096 lines (-15)
and grows the publication context panel from 208 to 259 lines. Runtime source
across those files increases by 36 lines while removing both coordinator
relationship-mutation methods and consolidating their component behavior behind
one update path. Focused coverage passes link and unlink requests, stable
encoded link targets, successful outcomes, provider failure and retry, and
duplicate relationship submissions.

The browser application artifact changes from 809,952 B raw / 219,542 B gzip
to 810,614 B raw / 219,688 B gzip (+662 B raw / +146 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,497 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Legacy Project PDF Removal

`ProjectEvidencePanel` now owns guarded legacy project-PDF removal, deriving
annotation and explicit publication-link preconditions from its canonical
input, plus confirmation, stable encoded PDF targets, response validation,
duplicate-submit gating, pending and retryable failure state, and the typed
completed-removal outcome on its existing action channel. `WorkspaceApp`
retains canonical project-resource refresh, workspace notification policy,
PDF navigation, grounding authority, and editor-dependent evidence mutations.

This checkpoint reduces `src/client/app.ts` from 5,096 to 5,085 lines (-11)
and grows the project evidence panel from 367 to 418 lines. Runtime source
across those files increases by 40 lines while removing the coordinator
PDF-removal method and keeping removal eligibility derivable instead of
introducing separate boolean state. Focused coverage passes relationship
preconditions, cancellation, stable encoded targets, successful completion,
provider failure and retry, and duplicate removal submissions.

The browser application artifact changes from 810,614 B raw / 219,688 B gzip
to 811,437 B raw / 219,965 B gzip (+823 B raw / +277 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,501 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Evidence Annotation Removal

`ProjectEvidencePanel` now also owns guarded annotation deletion, deriving
claim-evidence and passage-link preconditions from canonical input and reusing
the same removal lock, status, stable encoded targets, response validation,
retryable failure state, notice outcome, and completed-removal channel as
legacy project PDFs. `WorkspaceApp` retains annotation-form reset, canonical
project-resource refresh, workspace notification policy, PDF navigation,
grounding authority, and editor-dependent evidence mutations.

This checkpoint reduces `src/client/app.ts` from 5,085 to 5,073 lines (-12)
and grows the project evidence panel from 418 to 450 lines. Runtime source
across those files increases by 20 lines while removing the coordinator
annotation-deletion method and merging both removal workflows under one
derived lock. Focused coverage passes claim-evidence preconditions,
passage-aware confirmation, cancellation, stable encoded targets, successful
completion, provider failure and retry, and cross-resource duplicate removal.

The browser application artifact changes from 811,437 B raw / 219,965 B gzip
to 812,054 B raw / 220,056 B gzip (+617 B raw / +91 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,505 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Private Highlight Persistence

`LibraryPdfAnnotationForms` now owns private-highlight create and comment-
update transport, stable encoded reference and highlight targets, request
validation, overlap-extension classification from current artifact highlights,
duplicate-submit gating, pending and retryable failure state, and a typed
created, extended, or updated outcome. `WorkspaceApp` retains canonical Library
refresh, PDF draft clearing, inspector guidance, and toast policy.

This checkpoint reduces `src/client/app.ts` from 5,073 to 5,033 lines (-40)
and grows the Library PDF annotation forms from 307 to 360 lines. Runtime source
across those files increases by 13 lines while removing four coordinator save,
update, create, and overlap-classification methods. Focused coverage passes
trimmed create payloads, overlap extension, stable encoded update targets,
successful outcomes, provider failure and retry, and duplicate submissions.

The browser application artifact changes from 812,054 B raw / 220,056 B gzip
to 812,667 B raw / 220,119 B gzip (+613 B raw / +63 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,508 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Private Page-Note Persistence

`LibraryPdfAnnotationForms` now also owns private page-note create and body-
update transport, stable encoded reference and note targets, normalized anchor
payloads, shared duplicate-submit gating, pending state, and retryable local
failures. `WorkspaceApp` passes the stable note context at composition time and
retains canonical Library refresh, overlay-draft clearing, inspector policy,
and outcome-specific toasts.

This checkpoint reduces `src/client/app.ts` from 5,033 to 5,020 lines (-13)
and grows the Library PDF annotation forms from 360 to 417 lines. Runtime source
across those files increases by 44 lines while removing the coordinator note-
save request method. Focused coverage passes trimmed create payloads, stable
encoded update targets, successful typed outcomes, provider failure and retry,
and duplicate submissions.

The browser application artifact changes from 812,667 B raw / 220,119 B gzip
to 813,323 B raw / 220,256 B gzip (+656 B raw / +137 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,511 unit/coverage tests, 120 Workers-
runtime tests, and 74 browser tests.

## Continued Lit Ownership: Selected PDF Markup Mutations

`LibraryPdfAnnotationForms` now also owns selected-drawing style update and
selected-markup delete transport from stable reference and markup identities.
The component shares duplicate-submit gating across its annotation workflows,
disables conflicting controls while a request is pending, and keeps retryable
failures beside the affected controls. `WorkspaceApp` retains canonical Library
refresh, overlay-selection clearing, and outcome-specific toasts; list deletion
and drawing undo remain separate coordinator entry points.

This checkpoint reduces `src/client/app.ts` from 5,020 to 4,998 lines (-22)
and grows the Library PDF annotation forms from 417 to 470 lines. Runtime source
across those files increases by 31 lines while removing the coordinator's
selected-drawing update and selected-markup deletion-resolution methods.
Focused coverage passes stable encoded update and delete targets, exact style
payloads, typed outcomes, provider failure and retry, and cross-mutation
duplicate suppression.

The browser application artifact changes from 813,323 B raw / 220,256 B gzip
to 814,245 B raw / 220,404 B gzip (+922 B raw / +148 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,514 unit/coverage tests, 120 Workers-
runtime tests, and 74 browser tests.

## Continued Lit Ownership: Private Note Movement

`LibraryPdfMarkupLayer` now resolves a completed note drag against its saved
note data and owns stable encoded move transport, pending state, overlap
suppression, local failure status, and canonical-position restoration. A click
without movement remains a local note-card toggle. `WorkspaceApp` retains only
the successful-move refresh and toast outcome.

This checkpoint reduces `src/client/app.ts` from 4,998 to 4,987 lines (-11)
and grows the Library PDF markup layer from 538 to 583 lines. Runtime source
across those files increases by 34 lines while removing the coordinator note-
move resolution and request adapter. Focused coverage passes normalized move
payloads, stable encoded targets, typed success, unmatched pointers, provider
failure and retry, canonical rollback, and overlapping-gesture suppression.

The browser application artifact changes from 814,245 B raw / 220,404 B gzip
to 814,936 B raw / 220,555 B gzip (+691 B raw / +151 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,515 unit/coverage tests, 120 Workers-
runtime tests, and 74 browser tests.

## Continued Lit Ownership: Private Drawing Creation

`LibraryPdfMarkupLayer` now owns completed-drawing transport from its normalized
stroke, current style, page, and stable active artifact and reference target.
It suppresses new strokes during a request and retains a failed draft with
local status plus explicit retry and discard controls. `WorkspaceApp` retains
only canonical Library refresh and the successful-save toast.

This checkpoint reduces `src/client/app.ts` from 4,987 to 4,975 lines (-12)
and grows the Library PDF markup layer from 583 to 651 lines. Runtime source
across those files increases by 56 lines while removing the coordinator's
drawing-target resolution, payload assembly, request, and draft-reset adapter.
Focused coverage passes normalized points, captured style and page, stable
encoded targets, typed success, short and mismatched strokes, provider failure,
overlap suppression, retry, and discard.

The browser application artifact changes from 814,936 B raw / 220,555 B gzip
to 816,280 B raw / 220,865 B gzip (+1,344 B raw / +310 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,516 unit/coverage tests, 120 Workers-
runtime tests, and 74 browser tests.

## Continued Lit Ownership: Private Drawing Undo

`LibraryPdfAnnotationToolbar` now derives the newest drawing from the active
page's stable drawing records and owns its encoded DELETE request, pending-state
suppression, retryable failure status, and typed completion outcome. The undo
target itself is the source of truth for availability rather than duplicated
boolean state. `WorkspaceApp` retains canonical Library refresh and the
successful-delete toast; annotation-list deletion remains a separate entry
point.

This checkpoint reduces `src/client/app.ts` from 4,975 to 4,966 lines (-9)
and grows the Library PDF annotation toolbar from 200 to 238 lines. Runtime
source across those files increases by 29 lines while removing the coordinator
undo-target filtering, ordering, deletion request, and adapter method. Focused
coverage passes newest-target selection, stable encoded deletion, typed
completion, provider failure and retry, and overlapping-submit suppression.

The browser application artifact changes from 816,280 B raw / 220,865 B gzip
to 816,820 B raw / 220,797 B gzip (+540 B raw / -68 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,518 unit/coverage tests, 120 Workers-
runtime tests, and 74 browser tests.

## Continued Lit Ownership: Saved PDF Markup Deletion

`LibraryPdfAnnotationList` now owns deletion initiated from a saved markup card,
including stable encoded reference and markup targets, a list-wide pending
lock, retryable card-local failure state, and a typed completion outcome. One
deletion state object keeps identity, pending status, and presentation together.
`WorkspaceApp` retains only canonical Library refresh and the successful-
deletion toast.

This checkpoint reduces `src/client/app.ts` from 4,966 to 4,961 lines (-5)
and grows the Library PDF annotation list from 153 to 184 lines. Runtime source
across those files increases by 26 lines while removing the final generic
coordinator PDF-markup deletion request method. Focused coverage passes stable
encoded targets, typed completion, provider failure and retry, originating-card
rendering, and cross-card duplicate suppression.

The browser application artifact changes from 816,820 B raw / 220,797 B gzip
to 817,425 B raw / 220,876 B gzip (+605 B raw / +79 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,520 unit/coverage tests, 120 Workers-
runtime tests, and 74 browser tests.

## Continued Lit Ownership: Annotated PDF Export

`LibraryPdfAnnotationToolbar` now owns annotated-PDF export from a stable
artifact identity and filename. It handles ordinary browser downloads,
installed-app fetch and file sharing, user cancellation, unsupported or failed
sharing fallback, pending-state suppression, and typed status outcomes.
Availability derives from annotation count plus the export target rather than a
separate boolean. `WorkspaceApp` retains only toast presentation.

This checkpoint reduces `src/client/app.ts` from 4,961 to 4,930 lines (-31)
and grows the Library PDF annotation toolbar from 238 to 281 lines. Runtime
source across those files increases by 12 lines while removing the coordinator
export method and its single-use installed-app detection helper. Focused
coverage passes stable encoded download targets and filenames, installed-app
file sharing, provider failure fallback, typed status outcomes, and pending-
state cleanup.

The browser application artifact changes from 817,425 B raw / 220,876 B gzip
to 817,848 B raw / 221,036 B gzip (+423 B raw / +160 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,523 unit/coverage tests, 120 Workers-
runtime tests, and 74 browser tests.

## Continued Lit Ownership: Detected PDF Highlight Imports

`PdfHighlightImportPanel` now owns bounded PDF inspection, saved-highlight
overlap filtering, review state, stable encoded bulk-import transport,
duplicate-submit suppression, retryable local failures, completion copy, and
stale-result rejection when the active artifact identity changes. Its typed
outcome carries only the successful import count. `WorkspaceApp` retains
canonical Library refresh and completion toast policy.

This checkpoint reduces `src/client/app.ts` from 4,930 to 4,878 lines (-52)
and grows the PDF highlight import panel from 215 to 275 lines. Runtime source
across those files increases by 8 lines while removing the coordinator's scan,
duplicate-filter, selection-validation, import-request, busy-state, and reset
adapter methods. Focused coverage passes stable encoded detection and import
targets, duplicate filtering, edited review values, empty selection, provider
failure and retry, typed completion, identity changes, and local cancellation.

The browser application artifact changes from 817,848 B raw / 221,036 B gzip
to 817,854 B raw / 221,266 B gzip (+6 B raw / +230 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,526 unit/coverage tests, 120 Workers-
runtime tests, and 74 browser tests.

## Coordinator Simplification: PDF Markup Completion

`WorkspaceApp` now converges drawing saves, drawing undo, note moves, and saved
markup deletion through one post-mutation Library refresh adapter. The shared
path preserves each success notice and gives all four outcomes the same visible
refresh-failure fallback instead of leaving rejected refreshes unhandled.

This checkpoint reduces `src/client/app.ts` from 4,878 to 4,861 lines (-17)
with no compensating runtime source growth. The browser application artifact
changes from 817,854 B raw / 221,266 B gzip to 817,787 B raw / 221,306 B gzip
(-67 B raw / +40 B gzip). Styles and direct and unique production package
counts remain unchanged at 135,411 B raw / 23,373 B gzip and 18 and 150.

Full native CI passes all 1,526 unit/coverage tests, 120 Workers-
runtime tests, and 74 browser tests.

## Coordinator Simplification: Assistant Result Forwarders

`WorkspaceApp` now sends generated tables, phrasing alternatives, reference
results, ideas, clarity questions, and clarity rewrites directly to the
existing `AssistantInteractiveResult` Lit owner. Six single-use forwarding
methods and four now-unused model-result type imports are gone; assistant
workflow, model requests, source validation, and status policy remain in the
coordinator.

This checkpoint reduces `src/client/app.ts` from 4,861 to 4,834 lines (-27)
with no compensating runtime source growth. The browser application artifact
changes from 817,787 B raw / 221,306 B gzip to 817,629 B raw / 221,248 B gzip
(-158 B raw / -58 B gzip). Styles and direct and unique production package
counts remain unchanged at 135,411 B raw / 23,373 B gzip and 18 and 150.

Full native CI passes all 1,526 unit/coverage tests, 120 Workers-
runtime tests, and 74 browser tests.

## Coordinator Simplification: Presentation Forwarders

`WorkspaceApp` now supplies manuscript workflow cards, publication cards,
candidate cards, and the knowledge graph directly to their existing Lit
owners. Six single-use presentation forwarding methods and the unused graph
type import are gone. The manuscript map still owns the orchestration point
that derives all four workflow projections from one project-file snapshot.

This checkpoint reduces `src/client/app.ts` from 4,834 to 4,808 lines (-26)
with no compensating runtime source growth. The browser application artifact
changes from 817,629 B raw / 221,248 B gzip to 817,482 B raw / 221,178 B gzip
(-147 B raw / -70 B gzip). Styles and direct and unique production package
counts remain unchanged at 135,411 B raw / 23,373 B gzip and 18 and 150.

Full native CI passes all 1,526 unit/coverage tests, 120 Workers-
runtime tests, and 74 browser tests.

## Continued Lit Ownership: Project Reference Links

`LibraryReferenceSummary` and `LibraryPdfProjectUse` now own their project-
reference link and unlink requests through one shared Lit mutation boundary.
That boundary constructs stable encoded requests, validates the returned
canonical workspace snapshot, and emits one completed outcome. `WorkspaceApp`
retains snapshot application, project-PDF refresh, Library rerendering, and
toast policy. The existing workspace guard remains the single large domain
validator; duplicating it as a second Valibot schema would increase rather than
reduce maintained contract code.

This checkpoint reduces `src/client/app.ts` from 4,808 to 4,798 lines (-10).
Runtime source across the coordinator, both controls, and their shared mutation
boundary increases by 70 lines to remove two coordinator transport methods and
give both entry points one validation and outcome contract. Focused coverage
passes link and unlink request construction, stable encoded targets, invalid
workspace rejection, completed outcomes, retryable provider failures, and
workspace availability guards.

The browser application artifact changes from 817,545 B raw / 221,216 B gzip
to 818,526 B raw / 221,582 B gzip (+981 B raw / +366 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,532 unit/coverage tests, 120 Workers-
runtime tests, and 74 browser tests.

## Continued Lit Ownership: Project Research Mutations

`LibraryReferenceResearchRows` and `LibraryPdfAnnotationList` now own project
research-share, revoke, and exact-web-capture pin requests through one shared
Lit mutation boundary. It constructs stable encoded targets, validates the
canonical workspace response, and emits completed outcomes. `WorkspaceApp`
retains snapshot application, project-PDF refresh, Library rerendering, and
toast policy.

This checkpoint reduces `src/client/app.ts` from 4,798 to 4,778 lines (-20).
Focused coverage passes pin, share, and encoded revoke requests, invalid-
workspace rejection, both Lit presentations, and the remaining typed capture,
comparison, navigation, edit, and citation intents.

The browser application artifact changes from 818,526 B raw / 221,582 B gzip
to 819,001 B raw / 221,705 B gzip (+475 B raw / +123 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,535 unit/coverage tests, 120 Workers-
runtime tests, and 74 browser tests.

## Continued Lit Ownership: Project Image Uploads

`ProjectImageUploadControl` now owns the Files rail's image input, sequential
upload transport, response validation, duplicate-submit gating, progress, and
retryable local failures. It emits the final validated workspace snapshot and
completion message only after the full selected batch succeeds. `WorkspaceApp`
retains snapshot application, project-tree and preview rendering, collaborative
image insertion, deferred deletion, and toast policy.

This checkpoint reduces `src/client/app.ts` from 4,742 to 4,730 lines (-12).
The new 119-line upload owner replaces the coordinator's raw input binding and
upload loop, for a 107-line increase across those two runtime files while
isolating the complete request lifecycle behind a typed outcome. Focused
coverage passes sequential encoded upload targets and payloads, final-snapshot
delivery, invalid-response containment, retry, shell registration, and the
remaining application contracts.

The browser application artifact changes from 819,852 B raw / 221,855 B gzip
to 821,362 B raw / 222,222 B gzip (+1,510 B raw / +367 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,544 unit/coverage tests, 120 Workers-
runtime tests, and 74 browser tests.

## Continued Lit Ownership: Manuscript Comment Mutations

`ManuscriptCommentList` now owns create and re-anchor transport alongside its
existing resolve workflow. The workspace coordinator retains Yjs stability
checks and derives the current typed passage input before invoking the Lit
owner. The component owns request status, retryable local failures, successful
composer reset, and one completed mutation outcome; `WorkspaceApp` retains
canonical refresh, toast, and passage-navigation policy.

This checkpoint reduces `src/client/app.ts` from 4,766 to 4,759 lines (-7) and
grows the comment owner from 177 to 202 lines. Runtime source across those two
files increases by 18 lines while removing the coordinator's remaining comment
HTTP requests. Focused coverage passes stable create and encoded re-anchor
targets, completed outcomes, local failure and retry, resolve suppression, and
the remaining selection-dependent intents.

The browser application artifact changes from 818,910 B raw / 221,674 B gzip
to 819,216 B raw / 221,767 B gzip (+306 B raw / +93 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,537 unit/coverage tests, 120 Workers-
runtime tests, and 74 browser tests.

## Continued Lit Ownership: Claim Passage Links

`ClaimListPanel` now owns claim-passage-link transport alongside its existing
confirmed deletion workflow. The workspace coordinator retains Yjs stability
checks and derives the current typed `CreateClaimPassageLinkInput`; the Lit
owner handles request status, retryable local failures, and the same completed
mutation outcome used by deletion. Canonical refresh, toast, evidence
selection, dialogs, and navigation remain coordinator-owned.

This checkpoint reduces `src/client/app.ts` from 4,759 to 4,756 lines (-3) and
grows the claim owner from 245 to 264 lines. Runtime source across those two
files increases by 16 lines while removing the claim list's final coordinator
HTTP request. Focused coverage passes the typed request payload, completed
outcome, local failure and retry, confirmed deletion, duplicate suppression,
and the remaining selection and navigation intents.

The browser application artifact changes from 819,216 B raw / 221,767 B gzip
to 819,440 B raw / 221,853 B gzip (+224 B raw / +86 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,539 unit/coverage tests, 120 Workers-
runtime tests, and 74 browser tests.

## Continued Lit Ownership: Annotation Passage Links

`ProjectEvidencePanel` now owns annotation-passage-link transport alongside
its guarded PDF and annotation removals. The coordinator retains Yjs stability
checks and derives the typed `CreatePassageLinkInput`; the Lit owner handles
request status, retryable local failures, and a completed link outcome.
Canonical refresh, notification, PDF interaction, editor form state, grounding
selection, and navigation remain coordinator-owned.

This checkpoint reduces `src/client/app.ts` from 4,756 to 4,753 lines (-3) and
grows the evidence owner from 450 to 464 lines. Runtime source across those two
files increases by 11 lines while removing the evidence panel's final
coordinator link request. Focused coverage passes the typed request payload,
completed outcome, local failure and retry, guarded removals, fragment actions,
and the remaining selection and navigation intents.

The browser application artifact changes from 819,440 B raw / 221,853 B gzip
to 819,721 B raw / 221,801 B gzip (+281 B raw / -52 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,541 unit/coverage tests, 120 Workers-
runtime tests, and 74 browser tests.

## Continued Lit Ownership: Project Annotation Notes

`ProjectAnnotationForm` now owns optional highlight-note persistence from its
existing stable annotation identity and comment value. It handles the encoded
PUT target, local saving and retryable failure status, and a typed completed
save outcome. `WorkspaceApp` retains canonical resource refresh and the
optional Yjs-dependent annotation-link continuation.

This checkpoint reduces `src/client/app.ts` from 4,753 to 4,742 lines (-11)
and grows the annotation form from 317 to 333 lines. Runtime source across
those two files increases by 5 lines while removing the coordinator note-save
request, raw form-value outcome, and missing-target branch. Focused coverage
passes the stable note target and payload, save-and-link outcome, missing
target, local failure and retry, form state, and remaining toolbar and citation
intents.

The browser application artifact changes from 819,721 B raw / 221,801 B gzip
to 819,852 B raw / 221,855 B gzip (+131 B raw / +54 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,542 unit/coverage tests, 120 Workers-
runtime tests, and 74 browser tests.

## Coordinator Simplification: Single-Use Projections

`WorkspaceApp` now reads the active rail, settled Library list, and empty PDF
inspector state directly from their existing Lit owners. The one-off
bibliographic refresh adapter is inlined at its sole metadata-completion call
site. Four single-use forwarding methods are gone without moving transport,
domain state, or notification policy.

This checkpoint reduces `src/client/app.ts` from 4,778 to 4,766 lines (-12)
with no compensating runtime source growth. The browser application artifact
changes from 819,001 B raw / 221,705 B gzip to 818,910 B raw / 221,674 B gzip
(-91 B raw / -31 B gzip). Styles and direct and unique production package
counts remain unchanged at 135,411 B raw / 23,373 B gzip and 18 and 150.

Full native CI passes all 1,535 unit/coverage tests, 120 Workers-
runtime tests, and 74 browser tests.

## Continued Lit Ownership: Project PDF Imports

`ProjectEvidencePanel` now owns the legacy project-PDF input alongside its
existing PDF removal workflow. The Lit owner validates the selected file,
encodes and sends the import request, gates duplicate submissions, resets the
input, keeps progress and retryable failures local, and emits a typed completed
mutation. `WorkspaceApp` retains canonical resource refresh and toast policy.

This checkpoint reduces `src/client/app.ts` from 4,730 to 4,713 lines (-17)
and grows the evidence owner from 464 to 508 lines. Runtime source across those
two files increases by 27 lines while removing the final raw project-PDF element
reference and coordinator upload request. Focused coverage passes file-type
validation, the encoded upload target and payload, completed outcome, local
failure and retry, shell ownership, application contracts, and the panel's
remaining evidence workflows.

The browser application artifact changes from 821,362 B raw / 222,222 B gzip
to 821,764 B raw / 222,287 B gzip (+402 B raw / +65 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,546 unit/coverage tests, 120 Workers-
runtime tests, and 74 browser tests.

## Continued Lit Ownership: Project Tree Deletions

`ProjectTreePanel` now owns the encoded empty-folder and image DELETE requests
that originate from its action menus, including response validation. The
workspace coordinator retains optimistic hiding, the six-second delayed commit,
Undo restoration, validated snapshot application, project-tree and preview
rendering, and failure notification.

This checkpoint reduces `src/client/app.ts` from 4,713 to 4,700 lines (-13)
and grows the project-tree owner from 252 to 278 lines. Runtime source across
those two files increases by 13 lines while removing two duplicated coordinator
request/validation closures. Focused coverage passes encoded folder and asset
targets, validated snapshots, malformed-response rejection, remaining tree
intents, application contracts, and strict types.

The browser application artifact changes from 821,764 B raw / 222,287 B gzip
to 821,926 B raw / 222,373 B gzip (+162 B raw / +86 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,548 unit/coverage tests, 120 Workers-
runtime tests, and 74 browser tests.

## Continued Lit Ownership: Project File Deletion

`ProjectFileDialog` now owns encoded file DELETE transport alongside its file
and folder create and rename requests. One shared response helper validates all
returned workspaces. `WorkspaceApp` retains optimistic hiding, the six-second
delayed commit, Undo restoration, editor rebinding, snapshot application,
rendering, and failure notification.

This checkpoint reduces `src/client/app.ts` from 4,700 to 4,693 lines (-7) and
grows the project-file dialog from 190 to 204 lines. Runtime source across those
two files increases by 7 lines while removing the last file DELETE request and
deduplicating the owner's snapshot validation. Focused coverage passes the
encoded target, validated snapshot, malformed-response rejection, existing
create and rename requests, dialog lifecycle, application contracts, and strict
types.

The browser application artifact changes from 821,926 B raw / 222,373 B gzip
to 821,981 B raw / 222,398 B gzip (+55 B raw / +25 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,550 unit/coverage tests, 120 Workers-
runtime tests, and 74 browser tests.

## Continued Lit Ownership: Candidate Creation

`CandidateListPanel` now owns typed revision- and claim-candidate persistence
alongside candidate collection rendering. It derives the fixed OpenAI-compatible
adapter and operation prompt version, sends each operation to its stable endpoint,
and validates both the shared candidate contract and expected operation.
`WorkspaceApp` retains local provider calls, authorized manuscript targets,
evidence derivation, canonical refresh, context opening, workflow state, and
candidate decisions.

This checkpoint reduces `src/client/app.ts` from 4,693 to 4,684 lines (-9) and
grows the candidate list from 78 to 125 lines. Runtime source across those two
files increases by 38 lines while removing two coordinator requests, two
response parsers and guards, and four repeated invariant payload fields. Focused
coverage passes both stable endpoints and payloads, invariant derivation,
operation-specific validated outcomes, malformed and mismatched responses,
remaining list navigation, application contracts, and strict types.

The browser application artifact changes from 821,981 B raw / 222,398 B gzip
to 822,390 B raw / 221,846 B gzip (+409 B raw / -552 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,552 unit/coverage tests, 120 Workers-
runtime tests, and 74 browser tests.

## Continued Lit Ownership: Candidate Decisions

`CandidateReviewPanel` now owns apply/reject gating from its current candidate,
applicability, stable-document, pending, and busy state. It emits a typed start
outcome, sends the encoded decision request, preserves retryable local failure
copy across refreshes of the same pending candidate, and emits a typed completed
outcome. `WorkspaceApp` retains the assistant workflow actor, canonical refresh,
tab movement, success and failure toasts, and evidence navigation.

This checkpoint reduces `src/client/app.ts` from 4,684 to 4,670 lines (-14) and
grows the candidate review owner from 219 to 278 lines. Runtime source across
those two files increases by 45 lines while removing coordinator eligibility,
request, active-candidate forwarding, and local failure-reconstruction branches.
Focused coverage passes encoded decision targets, completed and failed outcomes,
same-candidate failure preservation, retry, gating intents, remaining rendering
and evidence navigation, application contracts, and strict types.

The browser application artifact changes from 822,390 B raw / 221,846 B gzip
to 822,763 B raw / 221,993 B gzip (+373 B raw / +147 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,554 unit/coverage tests, 120 Workers-
runtime tests, and 74 browser tests.

## Continued Lit Ownership: Highlight Fragments

`ProjectEvidencePanel` now owns highlight-fragment update and deletion
transport alongside its fragment controls and broader annotation workflow. It
trims and validates revised quotes, encodes annotation and fragment identities,
shares its mutation gate, keeps progress and retryable failures local, performs
UI-originated updates directly, and emits a completed update outcome.
`WorkspaceApp` retains PDF selection and eraser coordination, annotation-form
reset and undo state, canonical refresh, and toast policy.

This checkpoint reduces `src/client/app.ts` from 4,670 to 4,642 lines (-28) and
grows the project-evidence owner from 508 to 544 lines. Runtime source across
those two files increases by 8 lines while removing the coordinator update
method, quote-validation branch, both fragment requests, and the verbose update
intent payload. Focused coverage passes UI-driven adjusted geometry, trimmed
payloads, encoded update and delete targets, whole-annotation deletion signals,
invalid input, local failure and retry, remaining evidence workflows,
application contracts, and strict types.

The browser application artifact changes from 822,763 B raw / 221,993 B gzip
to 823,362 B raw / 222,132 B gzip (+599 B raw / +139 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,556 unit/coverage tests, 120 Workers-
runtime tests, and 74 browser tests.

## Continued Lit Ownership: Highlight Capture

`ProjectAnnotationForm` now owns new-highlight creation and existing-highlight
stroke extension alongside its editing annotation and undo-stroke state. It
selects the stable endpoint, sends coordinator-supplied PDF geometry, reuses the
Valibot-backed created-annotation guard, requires a returned stroke, updates its
own form and undo state, and keeps progress and retryable errors local.
`WorkspaceApp` retains selection-overlap derivation, viewer draft clearing,
canonical refresh, passage linking, and notification policy.

This checkpoint reduces `src/client/app.ts` from 4,642 to 4,627 lines (-15)
and grows the annotation form from 333 to 358 lines. Runtime source across those
two files increases by 10 lines while removing coordinator endpoint selection,
request transport, Valibot response validation, fragment selection, form state,
undo state, and success-copy branches. Focused coverage passes create and
encoded extension targets, payloads, form and undo updates, malformed resources,
missing strokes, local retry, existing note workflows, application contracts,
and strict types.

The browser application artifact changes from 823,362 B raw / 222,132 B gzip
to 823,543 B raw / 222,216 B gzip (+181 B raw / +84 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,558 unit/coverage tests, 120 Workers-
runtime tests, and 74 browser tests.

## Continued Lit Ownership: Workflow File Creation

`ProjectFileDialog` now owns content-bearing project-file creation alongside its
interactive create, rename, and delete transport. It sends the workflow path and
template content, reuses shared workspace validation, verifies the requested path
exists in the returned snapshot, and returns the created stable file.
`WorkspaceApp` retains research-diary, research-question, or reviewer-response
template choice and route navigation.

This checkpoint reduces `src/client/app.ts` from 4,627 to 4,622 lines (-5) and
grows the project-file owner from 204 to 214 lines. Runtime source across those
two files increases by 5 lines while removing coordinator request, response
parsing, workspace validation, and created-path lookup branches. Focused
coverage passes content payloads, stable created-file return, missing-path
rejection, existing create/rename/delete behavior, application contracts, and
strict types.

The browser application artifact changes from 823,543 B raw / 222,216 B gzip
to 823,581 B raw / 222,239 B gzip (+38 B raw / +23 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,560 unit/coverage tests, 120 Workers-
runtime tests, and 74 browser tests.

## Continued Lit Ownership: Project Knowledge Search

`ProjectMapWorkspace` now owns the authorized project-search request and
Valibot-backed result validation alongside the idle, result, and error state
that already controls its search presentation and graph-overview visibility.
The nested search panel remains responsible for query capture and result cards.
`WorkspaceApp` retains graph derivation and kind-qualified resource navigation.

This checkpoint reduces `src/client/app.ts` from 4,622 to 4,604 lines (-18)
and grows the project-map workspace from 145 to 163 lines. Runtime source across
those two files is unchanged while removing the coordinator search method,
request listener, response guard import, and duplicated state handoff. Focused
coverage passes encoded authorized requests, valid results, empty-query reset,
server errors, malformed results, resource selection, existing presentation
states, and strict types.

The browser application artifact changes from 823,581 B raw / 222,239 B gzip
to 823,423 B raw / 222,191 B gzip (-158 B raw / -48 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,561 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Personal Template Deletion

`ProjectStartingPointBrowser` now owns encoded personal-template deletion and
the required post-delete catalog refresh alongside its template loading,
optimistic hidden-template state, and visible-template derivation.
`WorkspaceApp` retains the shared deferred-deletion timer, optimistic hide and
restore coordination, replacement-option synchronization, and toast policy.

This checkpoint reduces `src/client/app.ts` from 4,604 to 4,599 lines (-5) and
grows the starting-point browser from 519 to 529 lines. Runtime source across
those two files increases by 5 lines while removing coordinator request details
and keeping the global undo mechanism centralized. Focused coverage passes
encoded delete targets, same-origin credentials, catalog refresh, visible-state
replacement, existing template workflows, application contracts, and strict
types.

The browser application artifact changes from 823,423 B raw / 222,191 B gzip
to 823,536 B raw / 222,208 B gzip (+113 B raw / +17 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,562 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Assistant Reference Discovery

`AssistantResultPanel` now owns local-model reference-query formulation,
registry discovery transport, response validation, and result presentation
alongside its existing discovered-reference import lifecycle. `WorkspaceApp`
supplies the authorized passage, instruction, and evidence and retains XState
transitions, cross-panel status, and canonical Library refresh policy.

This checkpoint reduces `src/client/app.ts` from 4,599 to 4,594 lines (-5) and
grows the assistant result owner from 383 to 394 lines. Runtime source across
those two files increases by 6 lines while removing registry endpoint details,
response parsing, and the Valibot-backed result guard from the coordinator.
Focused coverage passes provider request context, discovery payloads, validated
result counts and rendering, malformed responses, existing transient-result
workflows, application contracts, and strict types.

The browser application artifact changes from 823,536 B raw / 222,208 B gzip
to 823,602 B raw / 222,224 B gzip (+66 B raw / +16 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,564 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Clarity Provider Requests

`AssistantResultPanel` now owns both clarity-drill provider requests alongside
the captured passage, evidence, question, answer input, continuation provider,
and rewrite presentation they serve. `WorkspaceApp` retains empty-answer and
stale-workflow gates, XState transitions, shared progress and failure status,
candidate persistence, and manuscript authority.

This checkpoint reduces `src/client/app.ts` from 4,594 to 4,579 lines (-15) and
grows the assistant result owner from 394 to 418 lines. Runtime source across
those two files increases by 9 lines while removing both provider request shapes
and result-to-view handoffs from the coordinator. Focused coverage passes exact
question and continuation payloads, rewrite presentation, existing result
intents, workflow-state contracts, application contracts, and strict types.

The browser application artifact changes from 823,602 B raw / 222,224 B gzip
to 823,738 B raw / 222,271 B gzip (+136 B raw / +47 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,565 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Ideation and Phrasing Requests

`AssistantResultPanel` now owns ideation and phrasing provider requests,
including rhetorical-pattern lookup, alongside the transient choices and
captured revision context they serve. `WorkspaceApp` retains authorized target
and evidence derivation, XState transitions, shared status and failure policy,
and candidate persistence after a researcher chooses an option.

This checkpoint reduces `src/client/app.ts` from 4,579 to 4,569 lines (-10) and
grows the assistant result owner from 418 to 442 lines. Runtime source across
those two files increases by 14 lines while removing both provider request
shapes, rhetorical-pattern knowledge, and result-to-view handoffs from the
coordinator. Focused coverage passes exact ideation and phrasing payloads,
pattern inclusion, transient option presentation, existing result intents,
application contracts, and strict types.

The browser application artifact changes from 823,738 B raw / 222,271 B gzip
to 823,878 B raw / 222,346 B gzip (+140 B raw / +75 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,566 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Table Generation

`AssistantResultPanel` now owns structured-table provider generation, returned-
shape validation, deterministic GFM serialization, and preview presentation.
`WorkspaceApp` retains live editor target and paragraph-context derivation,
requirements parsing, XState transitions, status and failure policy, and the
revision-checked Yjs insertion.

This checkpoint reduces `src/client/app.ts` from 4,569 to 4,567 lines (-2) and
grows the assistant result owner from 442 to 456 lines. Runtime source across
those two files increases by 12 lines while removing provider-result shape
knowledge and serialization from the coordinator. Focused coverage passes exact
table payloads, shape rejection, GFM presentation, existing insertion intents,
application contracts, and strict types.

The browser application artifact changes from 823,878 B raw / 222,346 B gzip
to 823,941 B raw / 222,271 B gzip (+63 B raw / -75 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,567 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Canonical Candidate Generation

`CandidateListPanel` now owns revision and claim-draft provider calls alongside
the typed candidate persistence, fixed adapter and prompt-version derivation,
and operation-specific response validation they immediately feed. Prompt
evidence remains explicitly separate from versioned canonical evidence.
`WorkspaceApp` retains authorized target and evidence derivation, canonical
refresh, Context navigation, workflow status, and XState transitions.

This checkpoint reduces `src/client/app.ts` from 4,567 to 4,559 lines (-8) and
grows the candidate-list owner from 125 to 173 lines. Runtime source across
those two files increases by 40 lines while removing the last direct model-
provider calls from the coordinator and consolidating created-candidate refresh
and navigation. Focused coverage passes exact revision and claim prompt payloads,
typed persistence, canonical evidence, existing response guards and list
behavior, application contracts, and strict types.

The browser application artifact changes from 823,941 B raw / 222,271 B gzip
to 824,310 B raw / 222,370 B gzip (+369 B raw / +99 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,568 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Source Completion Presentation

`SourceCompletion` now owns citation and include candidate ranking, display-
option adaptation, empty-result hiding, and popup positioning alongside its
scope, keyboard, hover, active-descendant, and selection state. `WorkspaceApp`
retains context detection, canonical project and Library candidate derivation,
private-Library linking, Yjs edits, and caret restoration.

This checkpoint reduces `src/client/app.ts` from 4,559 to 4,533 lines (-26) and
grows the source-completion owner from 182 to 221 lines. Runtime source across
those two files increases by 13 lines while removing two parallel ranking,
mapping, empty-state, and positioning paths from the coordinator. Focused
coverage passes ranked include and citation presentation, Library action labels,
token-relative positioning, empty results, existing keyboard and scope behavior,
application contracts, and strict types.

The browser application artifact changes from 824,310 B raw / 222,370 B gzip
to 824,348 B raw / 222,440 B gzip (+38 B raw / +70 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,569 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Assistant Target Presentation

`AssistantTaskPanel` now owns operation-specific target-preview wording,
selection and insertion messaging, whitespace normalization, scope labels, and
bounded excerpt truncation. `WorkspaceApp` retains canonical Yjs target,
passage, and scope resolution and supplies only those typed values.

This checkpoint reduces `src/client/app.ts` from 4,533 to 4,507 lines (-26) and
grows the assistant-task owner from 263 to 287 lines. Runtime source across
those two files decreases by two lines while removing four operation-specific
presentation branches from the coordinator. Focused coverage passes missing,
claim, table-replacement, table-insertion, and scoped truncated-passage states,
existing task behavior, application contracts, and strict types.

The browser application artifact changes from 824,348 B raw / 222,440 B gzip
to 824,294 B raw / 222,451 B gzip (-54 B raw / +11 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,570 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Completion Ownership: Canonical Citation Adaptation

The pure citation-completion module now adapts canonical project references and
available unlinked Library references into its own candidate contract. It owns
duplicate, archived, and deleted Library exclusion alongside the existing
context, ranking, and replacement rules. `WorkspaceApp` retains canonical
reference sets, Library loading, authorization, linking, Yjs insertion, and
caret restoration.

This checkpoint reduces `src/client/app.ts` from 4,507 to 4,487 lines (-20) and
grows the citation-completion domain module from 74 to 110 lines. Runtime source
across those two files increases by 16 lines, trading an application-specific
27-line mapper for one independently tested completion-domain adapter. Focused
coverage passes project-only candidates, linked/archived/deleted exclusion,
available Library candidates, existing context and ranking behavior,
application contracts, and strict types.

The browser application artifact changes from 824,294 B raw / 222,451 B gzip
to 824,259 B raw / 222,443 B gzip (-35 B raw / -8 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,411 B raw / 23,373 B
gzip and 18 and 150.

Full native CI passes all 1,571 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Publication Intake Links

`PublicationIntakePanel` now derives the active PDF's linked references from
canonical publication and publication-PDF-link collections. `WorkspaceApp`
retains canonical snapshot ownership, snapshot refresh after acceptance,
navigation, and notification policy.

This checkpoint reduces `src/client/app.ts` from 4,406 to 4,402 lines (-4) and
grows the publication-intake owner from 294 to 302 lines. Runtime source across
those two files increases by four lines while deleting the coordinator-only
publication-link join. Focused coverage passes linked and lookup presentation,
request ownership, stale-response rejection, application contracts, and strict
types.

The browser application artifact changes from 824,561 B raw / 222,605 B gzip
to 824,524 B raw / 222,609 B gzip (-37 B raw / +4 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

The full native fast gate passes all 1,573 unit/coverage tests and 120
Workers-runtime tests. Its first browser phase was invalidated by two concurrent
local CI runners competing for the test server; the isolated retry passes all
74 browser tests.

## Continued Lit Ownership: Candidate Applicability

`CandidateReviewPanel` now derives evidence-link availability and local apply
eligibility from canonical candidate, annotation-version, source-revision,
anchor-resolution, collaboration, and workflow inputs. `WorkspaceApp` retains
those canonical authorities, XState transitions, refresh, navigation, evidence
opening, and notifications. Server-side application continues to independently
revalidate pending state, exact anchors, revisions, and annotation versions.

This checkpoint reduces `src/client/app.ts` from 4,468 to 4,449 lines (-19) and
grows the candidate-review owner from 278 to 312 lines. Runtime source across
those two files increases by 15 lines while deleting the coordinator's parallel
evidence-id and revision/claim-draft eligibility methods. Focused coverage passes
stale revisions, non-exact anchors, stale and current claim evidence, terminal
states, existing gating and transport behavior, application contracts, and
strict types.

The browser application artifact changes from 824,296 B raw / 222,485 B gzip
to 824,420 B raw / 222,534 B gzip (+124 B raw / +49 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,572 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Internal Resource DOM

The Library reference list now routes secondary-PDF refinement to the metadata
editor in its own reference row. The claim list and project-evidence panels now
own addressed-card lookup, scrolling, and optional claim focus. `WorkspaceApp`
retains PDF presentation, canonical refresh, and cross-feature resource
navigation without knowing the three components' internal card structure.

This checkpoint reduces `src/client/app.ts` from 3,592 to 3,568 lines (-24).
Runtime source across the four changed components and coordinator grows by
seven lines while removing every feature-level `querySelector` and `closest`
call from the coordinator. The browser application artifact changes from
824,268 B raw / 223,159 B gzip to 824,517 B raw / 223,290 B gzip (+249 B raw /
+131 B gzip). Styles and direct and unique production package counts remain
unchanged at 135,411 B raw / 23,373 B gzip, 18, and 150. The readability audit
reports 263 externally visible low-level component members, two more for the
explicit reveal APIs.

Focused reference-list, claim-list, and project-evidence coverage passes 29
tests. The affected guardrails pass formatting, lint, strict types, 31 related
tests, and 29 directly affected tests.

Full native CI passes all 1,596 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Remote Collaborator Selections

`CollaboratorSelectionList` now owns the ephemeral remote-selection map,
same-collaborator replacement, departure and disconnect cleanup, stale-revision
pruning, presentation, and editor-overlay range projection. `WorkspaceApp`
retains collaboration transport, revision authority, the local-author range,
and editor-highlight placement.

This checkpoint reduces `src/client/app.ts` from 3,568 to 3,553 lines (-15)
and grows the collaborator-selection owner from 69 to 96 lines. Runtime source
across the two files grows by 12 lines while removing the coordinator's parallel
selection collection and refresh method. The browser application artifact
changes from 824,517 B raw / 223,290 B gzip to 824,976 B raw / 223,413 B gzip
(+459 B raw / +123 B gzip). Styles and direct and unique production package
counts remain unchanged at 135,411 B raw / 23,373 B gzip, 18, and 150.

Focused coverage passes replacement, stale selection rejection, departure,
disconnect clearing, revision pruning, presentation, and overlay-range behavior.
The affected guardrails pass formatting, lint, strict types, four related tests,
and two directly affected tests.

Full native CI passes all 1,597 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Coordinator Extraction: Collaboration Session

A typed `CollaborationSession` now composes the connection XState actor,
ordered pending-update queue, Yjs server-shadow document, acknowledged server
state vector, and offline-delta reconstruction. `WorkspaceApp` retains the
actual WebSocket and retry timer, editor selection restoration, canonical
revision consequences, resource refresh, and UI projection.

This checkpoint reduces `src/client/app.ts` from 3,553 to 3,498 lines (-55).
The new session is 158 lines, so runtime source across the two files grows by
103 lines while concentrating the protocol invariants behind one independently
tested authority. The browser application artifact changes from 824,976 B raw /
223,413 B gzip to 825,900 B raw / 223,595 B gzip (+924 B raw / +182 B gzip).
Styles and direct and unique production package counts remain unchanged at
135,411 B raw / 23,373 B gzip, 18, and 150.

Nineteen focused tests across the session, workflow actor, and queue cover
connection phases, presence, offline availability, ordered send and
acknowledgement, server-shadow updates, remote-revision stability, and offline
delta recovery. The affected guardrails pass formatting, lint, strict types,
and four directly affected session tests.

Full native CI passes all 1,601 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Valibot Adoption: GitHub App Responses

The GitHub App repository client now validates repository identity, refs,
commits, recursive tree entries, created Git objects, and blob envelopes with
named Valibot schemas. Subtree normalization, Markdown and aggregate-byte
bounds, LFS detection, optimistic concurrency, bounded reads, and stable error
mapping remain explicit.

The file remains 344 lines: schema declarations replace the same amount of
handwritten record, integer, SHA, nested-object, tree-entry, and blob guarding.
The readability audit lowers `readMarkdownSnapshot` from cyclomatic 29 /
cognitive 33 / estimated CRAP 210.7 to 23 / 30 / 137.3 and removes one duplicate
clone group. Browser application and style artifacts remain unchanged at
825,900 B raw / 223,595 B gzip and 135,411 B raw / 23,373 B gzip because this
boundary is Worker-side. Direct and unique production package counts remain 18
and 150; Valibot was already pinned.

All 20 direct GitHub App cases pass. The affected guardrails pass formatting,
lint, strict types, 85 related integration tests, and all 120 Workers-runtime
tests. Full native CI passes all 1,601 unit/coverage tests, 120 Workers-runtime
tests, and 74 browser tests.

## Continued Lit Ownership: GitHub Sync Coordination

`GitHubSyncMenu` now binds the workspace-settings review and owns online and
active-review polling pauses, Check/Pull/Push/Settings routing, settings-status
mirroring, preview entry, canonical project refresh after Pull, and menu-status
refresh after every completed mutation. `WorkspaceApp` retains canonical
settings-view preparation and project fetching without knowing the review's
local working state.

This checkpoint reduces `src/client/app.ts` from 3,498 to 3,458 lines (-40).
The menu grows from 188 to 234 lines and the settings owner from 353 to 372
lines, so runtime source across the three files grows by 25 lines while deleting
five coordinator event bindings and three GitHub refresh-routing methods. The
browser application artifact changes from 825,900 B raw / 223,595 B gzip to
826,411 B raw / 223,595 B gzip (+511 B raw / unchanged gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Focused menu and settings coverage passes 11 cases, including review pauses,
preview routing, mutation refresh, settings mirroring, and the existing request
and lifecycle behavior. Strict client and Workers types pass. Full native CI
passes all 1,604 unit/coverage tests, 120 Workers-runtime tests, and 74 browser
tests.

## Continued Valibot Adoption: GitHub App Transport

The Octokit-authenticated GitHub App transport now validates installation-token
and bounded provider-error envelopes with named Valibot schemas. Response-byte
limits, JSON parsing, HTTP-status mapping, configuration validation, and stable
integration errors remain explicit.

This checkpoint reduces `src/integrations/github-app-transport.ts` from 130 to
129 lines, replacing the final generic record and positive-integer predicates
plus their inline token and error-message structure checks. The 20-case GitHub
App integration suite now also covers a non-string token and rejection of an
oversized provider message. Browser and style artifacts remain unchanged at
826,411 B raw / 223,595 B gzip and 135,411 B raw / 23,373 B gzip because this
boundary is Worker-side. Direct and unique production package counts remain 18
and 150; Valibot and Octokit were already pinned. Full native CI passes all
1,604 unit/coverage tests, 120 Workers-runtime tests, and 74 browser tests.

## Continued Coordinator Extraction: Collaboration Socket

A typed `CollaborationSocket` now composes the existing session with WebSocket
creation, reconnect and selection timers, strict JSON control routing, binary
Yjs update application, ordered queue flushing, reset cleanup, and reload
sequencing. `WorkspaceApp` supplies editor-selection preservation, canonical
revision effects, resource refresh, collaborator presentation, and connection
UI through explicit callbacks.

This checkpoint reduces `src/client/app.ts` from 3,458 to 3,322 lines (-136).
The independently tested socket authority is 228 lines, so runtime source across
the two files grows by 92 lines while removing three coordinator fields and ten
transport/protocol methods. The browser application artifact changes from
826,411 B raw / 223,595 B gzip to 827,405 B raw / 223,826 B gzip (+994 B raw /
+231 B gzip). Styles and direct and unique production package counts remain
unchanged at 135,411 B raw / 23,373 B gzip, 18, and 150.

Seven focused tests across the socket and session cover online and offline
connection, synchronization, acknowledgements, revision and presence controls,
remote selections, resource invalidation, binary updates, queued sends,
selection debounce, invalid-frame closes, reconnect, reset cleanup, and reload.
Full native CI passes all 1,607 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Context Presentation

`ContextTabStrip` now derives all controlled-panel visibility, Preview status,
sync and navigation-control availability, active resource labels, and private-
versus-read-only PDF presentation from its existing canonical inputs.
`WorkspaceApp` retains active-context state, authorized loading, content
rendering, routing, PDF-specific form and inspector visibility, and transitions.

This checkpoint reduces `src/client/app.ts` from 3,322 to 3,314 lines (-8),
grows the context-tab owner from 236 to 252 lines, and replaces the obsolete
Preview-navigation entry in the application element registry with an explicit
owner-side custom-element registration. Runtime source across those three files
grows by six lines while deleting one coordinator presentation method and its
imperative PDF-mode API. Fourteen focused tests cover fixed, publication,
project-PDF, private-Library, shared-reference, Preview-control, registry, and
existing component behavior alongside strict types.

The browser application artifact changes from 827,405 B raw / 223,826 B gzip
to 827,435 B raw / 223,883 B gzip (+30 B raw / +57 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,607 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Active PDF Load Projection

`activePdfLoadContext` now derives the active project, private-Library, or
shared-reference PDF, its encoded authorized URL, matching annotations, and
private highlights from canonical inputs. `WorkspaceApp` retains viewer
mutation, project-annotation selection, routing, stale-load rejection, scroll
restoration, and failure presentation.

This checkpoint reduces `src/client/app.ts` from 3,314 to 3,292 lines (-22)
and adds a 48-line pure projection, moving the coordinator's 21-branch hotspot
behind four focused cases for inactive and missing resources, project evidence,
private highlights, and shared-reference reading. Strict client and Workers
types pass.

The browser application artifact changes from 827,435 B raw / 223,883 B gzip
to 827,688 B raw / 223,953 B gzip (+253 B raw / +70 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,611 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Library UI Route Projection

`readLibraryUiRoute` and `libraryPdfRoute` now own pure parsing and construction
for the Library root, addressed-reference links, encoded private-PDF artifacts,
and bounded page locations. `WorkspaceApp` retains browser-history mutation,
authorized artifact lookup, focus and PDF navigation, canonical fallback, and
notification policy.

This checkpoint reduces `src/client/app.ts` from 3,292 to 3,281 lines (-11)
and adds a 25-line route adapter. Four focused cases cover root and addressed
references, encoded PDF artifacts, invalid pages, malformed encoding, and
canonical URL writing alongside strict client and Workers types.

The browser application artifact changes from 827,688 B raw / 223,953 B gzip
to 827,817 B raw / 223,956 B gzip (+129 B raw / +3 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,615 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Fixed Context Scroll

`ContextTabStrip` now restores Preview, Library, and Writing assistant scroll
positions directly from the same canonical tab update that drives visibility
and presentation. `WorkspaceApp` retains capture into canonical local tab state
and resource-panel scroll restoration, but no longer selects or invokes a
second fixed-panel restoration path.

This checkpoint reduces `src/client/app.ts` from 3,281 to 3,269 lines (-12)
and the context-tab owner from 252 to 249 lines (-3), deleting the imperative
restore API and two coordinator-only wrapper methods. Existing focused coverage
passes fixed-panel capture and restoration, resource presentation, Preview
controls, and strict client and Workers types.

The browser application artifact changes from 827,817 B raw / 223,956 B gzip
to 827,643 B raw / 223,905 B gzip (-174 B raw / -51 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,615 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Context Presentation Readability

The context-tab owner now separates fixed-scroll restoration, controlled-panel
visibility, Preview sibling controls, PDF mode, and active-resource labelling
into small derivable presentation steps. Behavior and ownership are unchanged;
the split removes the 26-cyclomatic `syncControlledPanels` hotspot introduced as
the component accumulated those responsibilities.

This checkpoint grows `src/client/context-tab-strip.ts` from 249 to 267 lines
without changing `src/client/app.ts`. The readability audit's high-complexity
count falls from 26 to 25, and the context-tab owner no longer appears in that
list. Existing focused coverage passes all eight context-tab cases alongside
strict client and Workers types.

The browser application artifact changes from 827,643 B raw / 223,905 B gzip
to 827,932 B raw / 223,962 B gzip (+289 B raw / +57 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,615 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Settings View Projection

`WorkspaceSettingsPanel` now derives the current title, archived state, visible
entry-file choices, publication-profile defaults, and template eligibility from
the canonical workspace catalog, bounded snapshot fields, hidden-file set, and
workspace identity supplied when it opens. `WorkspaceApp` retains those
canonical authorities, settings opening, GitHub refresh policy, catalog refresh,
template workflow, and toast policy.

This checkpoint reduces `src/client/app.ts` from 3,269 to 3,264 lines (-5) and
grows the workspace-settings owner from 372 to 397 lines. Runtime source across
those two files grows by 20 lines while removing the coordinator's settings-view
projection and its default-profile dependency. Eleven focused settings and
GitHub-menu cases cover canonical derivation, hidden files, demo eligibility,
modal reuse, existing requests and coordination, and strict client and Workers
types. The readability audit's high-complexity count falls from 25 to 24, and
the coordinator settings method no longer appears in that list.

The browser application artifact changes from 827,932 B raw / 223,962 B gzip
to 828,090 B raw / 223,986 B gzip (+158 B raw / +24 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,615 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Publication Lookup

`PublicationContextPanel` now resolves its active publication id against the
canonical publication snapshot before deriving scholarly metadata, available
project PDFs, and ordered private-Library, shared-reference, and project paper
options. `WorkspaceApp` retains canonical inputs, citation availability and
insertion, paper navigation, refresh, scroll coordination, and notification
policy.

This checkpoint reduces `src/client/app.ts` from 3,264 to 3,259 lines (-5) and
grows the publication-context owner from 284 to 294 lines. Runtime source across
those two files grows by five lines while deleting the coordinator's canonical
publication lookup. Seven focused cases cover unavailable snapshots, metadata,
all paper variants, citation and paper intents, scroll, existing relationship
transport, and strict client and Workers types. The readability audit remains at
24 high-complexity functions without introducing a new coordinator hotspot.

The browser application artifact changes from 828,090 B raw / 223,986 B gzip
to 828,056 B raw / 224,005 B gzip (-34 B raw / +19 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,615 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Candidate Lookup

`CandidateReviewPanel` now resolves its active candidate id against the
canonical workspace snapshot and matches the current decision before deriving
evidence availability and revision or claim-draft applicability. `WorkspaceApp`
retains canonical inputs, assistant workflow transitions, refresh, context
navigation, scroll coordination, and notification policy.

This checkpoint reduces `src/client/app.ts` from 3,259 to 3,254 lines (-5) and
grows the candidate-review owner from 312 to 325 lines. Runtime source across
those two files grows by eight lines while deleting the coordinator's canonical
candidate and matching-decision lookups. Eight focused cases cover unavailable
snapshots and ids, both candidate operations, applicability, evidence and
decision intents, transport, retryable failure, scroll, and strict client and
Workers types. The change introduces no new branching in the coordinator.

The browser application artifact changes from 828,056 B raw / 224,005 B gzip
to 828,028 B raw / 224,000 B gzip (-28 B raw / -5 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,616 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Resource Context Projection

`ContextResourcePresenter` now selects and synchronizes the active publication,
candidate, project-PDF, private-Library PDF, or shared-reference PDF owner from
canonical context inputs. It restores publication and candidate scroll,
projects citation and intake inputs, and switches project-annotation versus
private-inspector presentation. `WorkspaceApp` retains canonical context state,
PDF loading, private markup drafts, citation insertion, refresh, routing, and
notification policy.

This checkpoint reduces `src/client/app.ts` from 3,254 to 3,205 lines (-49) and
adds a 124-line bounded resource presenter. Runtime source across those two
files grows by 75 lines while deleting four coordinator presentation methods
and consolidating five resource variants behind one typed boundary. Three
direct presenter cases plus the server-rendered shell contract cover inactive,
publication, candidate, project-PDF, private-Library, and shared-reference
projection alongside strict client and Workers types. A simplify pass removes
derivable result flags, and the readability audit remains at 24 high-complexity
functions without retaining the presenter's initial hotspot.

The browser application artifact changes from 828,028 B raw / 224,000 B gzip
to 829,260 B raw / 224,606 B gzip (+1,232 B raw / +606 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,619 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Resource Scroll Capture

`ContextResourcePresenter` now reads publication, candidate, and PDF scroll
from the owning resource panel. `WorkspaceApp` retains browser-local tab state,
fixed-panel delegation, PDF page and focused-annotation capture, and route
synchronization.

This checkpoint reduces `src/client/app.ts` from 3,205 to 3,198 lines (-7) and
grows the resource presenter from 124 to 130 lines. Runtime source across those
two files decreases by one line while deleting the coordinator's three-way DOM
scroll lookup. Four direct presenter cases cover publication, candidate,
project-PDF, inactive and existing presentation behavior alongside strict
client and Workers types.

The browser application artifact changes from 829,260 B raw / 224,606 B gzip
to 829,375 B raw / 224,642 B gzip (+115 B raw / +36 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,620 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Library Projections

The citation-network workspace now derives display titles from canonical
bibliographic records, the Library filter derives linked-reference ids from
canonical project references, and the unidentified-PDF queue derives its
legacy unattached-artifact subset from the canonical Library snapshot.
`WorkspaceApp` retains canonical snapshot loading, result-card composition,
navigation, refresh, and notification policy.

This checkpoint reduces `src/client/app.ts` from 3,198 to 3,195 lines (-3).
Runtime source across the three existing Lit owners grows by three lines, so
the four-file total is unchanged while three coordinator-side adapter
projections disappear. Twelve focused cases cover title normalization,
project-link derivation, unattached-artifact selection, existing presentation
and mutation behavior, and strict client and Workers types.

The browser application artifact changes from 829,375 B raw / 224,642 B gzip
to 829,400 B raw / 224,627 B gzip (+25 B raw / -15 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,621 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Page-Local PDF Markups

`LibraryPdfMarkupLayer` now derives the active page's saved drawings, notes,
and stable drawing target from canonical artifact and markup inputs.
`WorkspaceApp` retains active-page selection, drawing-style and toolbar
coordination, persistence outcomes, canonical Library refresh, and notification
policy.

This checkpoint reduces `src/client/app.ts` from 3,195 to 3,185 lines (-10)
and grows the markup owner from 683 to 701 lines. Runtime source across those
two files grows by eight lines while deleting the coordinator's page-local
filtering and kind partition. Nine focused cases cover canonical artifact and
page filtering, drawing-target derivation, empty input, existing markup
presentation, gesture, persistence, and strict client and Workers types.

The browser application artifact changes from 829,400 B raw / 224,627 B gzip
to 829,436 B raw / 224,657 B gzip (+36 B raw / +30 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,622 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Composition: Reference Library Workspace

A bounded light-DOM `ReferenceLibraryWorkspace` now synchronizes canonical
Library inputs across the filter, result list, citation network, and
unidentified-PDF queue. It owns filter-driven rerendering, result settlement,
focused-reference reveal, and nested citation-network and identification
lifecycle delegation. Child mutation outcomes continue bubbling to
`WorkspaceApp`, which retains canonical loading, cross-feature navigation,
refresh, and notification policy.

This checkpoint reduces `src/client/app.ts` from 3,185 to 3,174 lines (-11)
and the typed application registry from 158 to 152 lines while adding a
100-line composed owner and two server-shell wrapper lines. Runtime source
across those four files grows by 85 lines, consolidating four direct registry
entries and their sibling synchronization behind one boundary. Three direct
workspace cases plus shell, registry, application-contract, and strict-type
coverage exercise canonical projection, filter changes, open and reveal focus,
settlement, lifecycle delegation, and light-DOM preservation.

The browser application artifact changes from 829,436 B raw / 224,657 B gzip
to 830,463 B raw / 225,001 B gzip (+1,027 B raw / +344 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,625 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Publication List Inputs

`PublicationListPanel` now reads publications and project-reference links
directly from the canonical workspace snapshot input. `WorkspaceApp` retains
canonical refresh, context navigation, Library management, and notification
policy.

This checkpoint reduces `src/client/app.ts` from 3,174 to 3,171 lines (-3)
and the publication-list owner from 164 to 159 lines (-5). Runtime source
across the two files decreases by eight lines while deleting the dedicated
two-field interface and its coordinator-built adapter. Five focused cases cover
empty, enrichable, connected, intent, transport, retry, and duplicate-submit
behavior alongside application contracts and strict client and Workers types.

The browser application artifact changes from 830,463 B raw / 225,001 B gzip
to 830,455 B raw / 225,002 B gzip (-8 B raw / +1 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,411 B raw / 23,373 B
gzip, 18, and 150.

Full native CI passes all 1,625 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Workspace Resource Projection

`ContextResourcePresenter` now synchronizes the bounded evidence, annotation,
publication, claim, comment, and candidate owners from one canonical workspace
snapshot. It also derives the active PDF's annotation subset for the viewer.
`WorkspaceApp` retains snapshot authority, context reconciliation, PDF
rendering, model availability, routing, refresh, and notification policy.

This checkpoint reduces `src/client/app.ts` from 3,171 to 3,162 lines (-9)
and grows the existing resource presenter from 130 to 151 lines. Runtime source
across those two files grows by 12 lines while replacing eight sibling
presentation calls and one coordinator-side annotation filter with one typed
boundary. Five direct presenter cases cover publication, candidate, all three
PDF modes, inactive state, scroll capture, canonical workspace fan-out,
selected-evidence reuse, comment counts, active-PDF annotation filtering, and
strict client and Workers types.

The browser application artifact changes from 830,455 B raw / 225,002 B gzip
to 830,551 B raw / 224,852 B gzip (+96 B raw / -150 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,626 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Private PDF Presentation

`ContextResourcePresenter` now owns private-PDF inspector context,
artifact-change markup reset, annotation availability, export-target state, and
inspector closure when the active resource changes. It returns only the active
private highlights needed by the PDF viewer. `WorkspaceApp` retains viewer
state, page-local markup rendering, drafts, persistence, refresh, and
notification policy.

This checkpoint reduces `src/client/app.ts` from 3,162 to 3,145 lines (-17)
and grows the existing resource presenter from 151 to 185 lines. Runtime source
across those two files grows by 17 lines while deleting the coordinator's
18-line private-PDF composer and the now-derivable active-artifact result. Six
direct presenter cases cover private, shared-reference and project PDF modes,
inspector context, artifact reset, toolbar availability and export state,
inactive closure, canonical resource presentation, and strict client and
Workers types.

The browser application artifact changes from 830,551 B raw / 224,852 B gzip
to 830,702 B raw / 224,790 B gzip (+151 B raw / -62 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,627 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Private PDF Page Projection

`ContextResourcePresenter` now supplies the private markup layer with the
active artifact, canonical saved markups, page, and toolbar drawing style, then
projects the resulting page drawings back to toolbar undo state. `WorkspaceApp`
retains active-page selection, Library route updates, and page-change timing.

This checkpoint reduces `src/client/app.ts` from 3,145 to 3,141 lines (-4)
and grows the existing resource presenter from 185 to 198 lines. Runtime source
across those two files grows by nine lines while reducing the coordinator's
page renderer to one typed owner call. Seven direct presenter cases cover
page-local markup inputs, drawing style, undo projection, private-PDF
presentation, canonical workspace fan-out, scroll capture, and strict client
and Workers types.

The browser application artifact changes from 830,702 B raw / 224,790 B gzip
to 830,803 B raw / 224,825 B gzip (+101 B raw / +35 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,628 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Private PDF Tool Projection

`ContextResourcePresenter` now coordinates private-PDF tool choice,
inspector-open state, and draft clearing across the markup layer, inspector, and
toolbar. It returns a typed projection containing only the text-selection and
selected-highlight effects still owned by the PDF viewer. `WorkspaceApp`
retains viewer mutation, canonical Library refresh, persistence, routing, and
notification policy.

This checkpoint reduces `src/client/app.ts` from 3,141 to 3,131 lines (-10)
and grows the existing resource presenter from 198 to 238 lines. Runtime source
across those two files grows by 30 lines while replacing scattered sibling Lit
coordination with one tested owner boundary. Nine direct presenter cases cover
tool projection, inspector synchronization, draft clearing, page-local markup,
private-PDF presentation, canonical workspace fan-out, scroll capture, and
strict client and Workers types.

The browser application artifact changes from 830,803 B raw / 224,825 B gzip
to 831,489 B raw / 225,002 B gzip (+686 B raw / +177 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,630 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Private PDF Inspector Closure

`ContextResourcePresenter` now closes the private-PDF inspector as one Lit-side
lifecycle: it reads open drafts, clears inspector and markup-layer state, closes
the inspector and toolbar affordance, and restores toolbar focus. It returns
only whether the PDF viewer must clear its draft selection or update private
highlight selection.

This checkpoint reduces `src/client/app.ts` from 3,131 to 3,129 lines (-2) and
grows the resource presenter from 238 to 254 lines. Runtime source across those
two files grows by 14 lines while replacing coordinator reach-through into
three sibling Lit owners. Ten direct presenter cases cover inspector closure,
tool projection, draft clearing, page-local markup, private-PDF presentation,
canonical workspace fan-out, scroll capture, and strict client and Workers
types.

The browser application artifact changes from 831,489 B raw / 225,002 B gzip
to 831,997 B raw / 225,090 B gzip (+508 B raw / +88 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,631 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Private PDF Selection Projection

`ContextResourcePresenter` now coordinates highlight editing, note editing, and
saved-markup selection across the private-PDF markup layer and inspector. It
returns only the conditional text-selection, private-highlight selection, and
draft-selection cleanup effects required by the PDF viewer. `WorkspaceApp`
retains canonical Library lookups and all persistence, refresh, routing, and
notification policy.

This checkpoint reduces `src/client/app.ts` from 3,129 to 3,117 lines (-12)
and grows the resource presenter from 254 to 297 lines. Runtime source across
those two files grows by 31 lines while removing the remaining edit/selection
reach-through into sibling Lit owners and two now-redundant coordinator
wrappers. Twelve direct presenter cases cover annotation selection, inspector
closure, tool projection, draft clearing, page-local markup, private-PDF
presentation, canonical workspace fan-out, scroll capture, and strict client
and Workers types.

The browser application artifact changes from 831,997 B raw / 225,090 B gzip
to 832,867 B raw / 225,201 B gzip (+870 B raw / +111 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,633 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Private PDF Draft Composition

`ContextResourcePresenter` now composes private highlight drafts from PDF
selection captures and opens page-note drafts from markup-layer intent, keeping
inspector state and its toolbar-open projection together. `WorkspaceApp`
retains canonical active-tab and Library-artifact lookup plus persistence and
refresh policy.

This checkpoint reduces `src/client/app.ts` from 3,117 to 3,107 lines (-10)
and grows the resource presenter from 297 to 314 lines. Runtime source across
those two files grows by seven lines while deleting coordinator-owned inspector
payload assembly and open-state coordination. Thirteen direct presenter cases
cover draft composition, annotation selection, inspector closure, tool
projection, page-local markup, private-PDF presentation, canonical workspace
fan-out, scroll capture, and strict client and Workers types.

The browser application artifact changes from 832,867 B raw / 225,201 B gzip
to 833,003 B raw / 225,217 B gzip (+136 B raw / +16 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,634 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Assistant Generation Routing

A new bounded `AssistantGenerationPresenter` routes structured-table,
phrasing, reference-discovery, ideation, and clarity generation across the
existing typed task and result Lit owners. It derives only operation-local
request context and returns the next transient workflow state plus result-
specific status. `WorkspaceApp` retains the XState actor, canonical manuscript
and evidence inputs, candidate generation and persistence, provider
construction, canonical refresh, error policy, and Yjs mutation.

This checkpoint reduces `src/client/app.ts` from 3,107 to 3,052 lines (-55)
and adds a 111-line bounded generation presenter. Runtime source across those
two files grows by 56 lines while deleting five operation-specific coordinator
methods and consolidating their dispatch behind one typed owner call. Three
direct presenter cases cover all five interactive operations, singular and
empty discovery results, candidate-operation deferral, task/result ownership,
shell registration, application element collection, and strict client and
Workers types.

The browser application artifact changes from 833,003 B raw / 225,217 B gzip
to 833,115 B raw / 225,356 B gzip (+112 B raw / +139 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,637 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Assistant Candidate Routing

`AssistantGenerationPresenter` now routes revision and evidence-backed claim
generation through the existing candidate-list Lit owner as well as the five
interactive result operations. It returns the created candidate alongside the
workflow/status projection so `WorkspaceApp` retains canonical refresh and
context navigation. Candidate provider requests and persistence remain in the
candidate-list owner; the coordinator retains the XState actor, provider
construction, error policy, and Yjs mutation.

This checkpoint reduces `src/client/app.ts` from 3,052 to 3,026 lines (-26)
and grows the generation presenter from 111 to 151 lines. Runtime source across
those two files grows by 14 lines while deleting the final two operation-
specific generation methods from the coordinator. Four direct presenter cases
cover all seven registered operations, candidate projection, task-derived claim
relation, exact revision target capture, interactive status and workflow
projection, and strict client and Workers types.

The browser application artifact changes from 833,115 B raw / 225,356 B gzip
to 832,961 B raw / 225,344 B gzip (-154 B raw / -12 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,638 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Assistant Availability Projection

`AssistantGenerationPresenter` now projects canonical document stability,
target availability, workflow activity, and candidate-decision activity across
the model-settings, task, and candidate-review Lit owners. It derives selected-
evidence counts, model availability, and discovery activity directly from their
owners instead of requiring `WorkspaceApp` to coordinate four sibling
components.

This checkpoint reduces `src/client/app.ts` from 3,026 to 3,017 lines (-9) and
grows the generation presenter from 151 to 180 lines. Runtime source across
those two files grows by 20 lines while reducing availability updates to one
canonical projection call and avoiding parallel evidence or model state. Five
direct presenter cases cover all generation routes plus availability fan-out,
candidate-decision gating, task target inputs, and strict client and Workers
types.

The browser application artifact changes from 832,961 B raw / 225,344 B gzip
to 833,234 B raw / 225,412 B gzip (+273 B raw / +68 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,639 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Model Provider Derivation

`ModelProviderSettings` now constructs the OpenAI-compatible browser provider
directly from its owned, Valibot-validated connection, endpoint, model, and
reasoning preferences. `WorkspaceApp` retains provider failure presentation and
generation workflow authority but no longer reinterprets another component's
state.

This checkpoint reduces `src/client/app.ts` from 3,017 to 3,007 lines (-10)
and grows the model-settings owner from 268 to 278 lines. Runtime source across
those two files is unchanged while deleting the coordinator-only provider
factory. Existing model-settings coverage now also verifies provider
construction after normalized connection, endpoint, model, and reasoning
changes; affected contracts and strict client and Workers types pass.

The browser application artifact changes from 833,234 B raw / 225,412 B gzip
to 833,287 B raw / 225,392 B gzip (+53 B raw / -20 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,639 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Assistant Task Projection

`AssistantGenerationPresenter` now derives effective target scope from the
task owner's operation state and coordinates operation-status reset, transient-
result clearing, and target preview from canonical editor-target inputs.
`WorkspaceApp` retains Yjs-relative selection resolution and canonical source
text authority.

This checkpoint reduces `src/client/app.ts` from 3,007 to 2,994 lines (-13)
and grows the generation presenter from 180 to 202 lines. Runtime source across
those two files grows by nine lines while deleting the coordinator's duplicate
task-scope interpretation and sibling presentation fan-out. Six direct
presenter cases cover all operation routes, availability, task reset, effective
scope, selected-target presentation, and strict client and Workers types.

The browser application artifact changes from 833,287 B raw / 225,392 B gzip
to 833,593 B raw / 225,465 B gzip (+306 B raw / +73 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,640 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Assistant Control Wiring

`AssistantGenerationPresenter` now owns local subscriptions for model-settings
changes, workflow actions, task changes, and generation intent. It handles
settings opening, status propagation, operation reset, and initial task
presentation internally while delegating evidence navigation, canonical target
and availability refresh, and generation execution through four explicit
coordinator callbacks.

This checkpoint reduces `src/client/app.ts` from 2,994 to 2,972 lines (-22)
and grows the generation presenter from 202 to 240 lines. Runtime source across
those two files grows by 16 lines while deleting four event imports, four
sibling subscription blocks, and the coordinator-only task-update wrapper.
Seven direct presenter cases cover all operation routes, availability and task
projection, initial and changed control wiring, settings opening, evidence and
generation delegation, and strict client and Workers types.

The browser application artifact changes from 833,593 B raw / 225,465 B gzip
to 833,791 B raw / 225,535 B gzip (+198 B raw / +70 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,641 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Assistant Result Wiring

`AssistantGenerationPresenter` now owns transient result-action and discovered-
reference refresh subscriptions. It completes result-local save state and
projects success or refresh-failure status while receiving canonical Library
refresh as an injected coordinator callback. `WorkspaceApp` retains typed
result application, canonical Library authority, XState, and Yjs mutation.

This checkpoint reduces `src/client/app.ts` from 2,972 to 2,962 lines (-10)
and grows the generation presenter from 240 to 272 lines. Runtime source across
those two files grows by 22 lines while deleting the coordinator's result-event
imports and two sibling subscription blocks. Eight direct presenter cases cover
all operation routes, control wiring, result-action delegation, successful and
failed canonical refresh, local completion, status projection, and strict
client and Workers types.

The browser application artifact changes from 833,791 B raw / 225,535 B gzip
to 833,895 B raw / 225,650 B gzip (+104 B raw / +115 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,642 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Candidate Review Wiring

`AssistantGenerationPresenter` now owns candidate decision-start, completed-
decision, and evidence-navigation subscriptions. It resolves annotation and
claim destinations against a read-only canonical snapshot callback, opens
current annotations through an injected navigation callback, and reveals
current claims through their Lit owner. `WorkspaceApp` retains XState decision
transitions, canonical refresh, PDF navigation, and context rendering.

This checkpoint reduces `src/client/app.ts` from 2,962 to 2,948 lines (-14)
and grows the generation presenter from 272 to 307 lines. Runtime source across
those two files grows by 21 lines while deleting three event imports and three
sibling subscription blocks from the coordinator. Nine direct presenter cases
cover all operation routes, control and result wiring, candidate decision
delegation, canonical evidence resolution, annotation navigation, claim reveal,
and strict client and Workers types.

The browser application artifact changes from 833,895 B raw / 225,650 B gzip
to 834,103 B raw / 225,713 B gzip (+208 B raw / +63 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,643 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Candidate Setup

`AssistantGenerationPresenter` now configures the candidate-list and candidate-
review siblings from one API base and owns the candidate-open subscription.
`WorkspaceApp` retains canonical context activation through one typed callback.

This checkpoint reduces `src/client/app.ts` from 2,948 to 2,943 lines (-5)
and grows the generation presenter from 307 to 314 lines. Runtime source across
those two files grows by two lines while deleting two separate sibling setup
sites and the final candidate-list event import from the coordinator. The nine
direct presenter cases now also cover shared configuration and candidate-open
delegation under strict client and Workers types.

The browser application artifact changes from 834,103 B raw / 225,713 B gzip
to 834,111 B raw / 225,729 B gzip (+8 B raw / +16 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,643 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Promoted Revision Persistence

`AssistantGenerationPresenter` now adapts a researcher-promoted transient
rewrite into the typed revision-candidate request owned by `CandidateListPanel`.
`WorkspaceApp` retains assistant workflow transitions, canonical refresh, and
opening the refreshed candidate in Context.

This checkpoint reduces `src/client/app.ts` from 2,943 to 2,924 lines (-19)
and grows the generation presenter from 314 to 344 lines. Runtime source across
those two files grows by 11 lines while deleting the coordinator-only revision-
candidate input contract and persistence adapter. Ten direct presenter cases
cover promoted-revision persistence in addition to all operation, setup,
control, result, decision, and evidence routes under strict client and Workers
types.

The browser application artifact changes from 834,111 B raw / 225,729 B gzip
to 834,261 B raw / 225,724 B gzip (+150 B raw / -5 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,644 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Generation Preparation and Clarity

`AssistantGenerationPresenter` now prepares validated generation context from
the task, evidence-status, and model-settings owners plus canonical target,
snapshot, stability, and revision inputs. It also intercepts clarity-
continuation actions, trims and validates the answer against coordinator-
reported workflow state, performs the result-owned provider continuation, and
projects working, blocked, stale, success, and failure-adjacent status. XState
transitions, availability refresh, and failure policy remain explicit
coordinator callbacks.

This checkpoint reduces `src/client/app.ts` from 2,924 to 2,870 lines (-54)
and grows the generation presenter from 344 to 426 lines. Runtime source across
those two files grows by 28 lines while deleting the coordinator generation-
context interface, task/evidence/provider adapter, provider-error wrapper,
clarity event branch, provider continuation method, and related direct
component imports. Twelve direct presenter cases cover generation preparation,
empty and stale clarity answers, successful continuation, provider failure, and
the preceding operation, setup, control, result, decision, and evidence routes
under strict client and Workers types.

The browser application artifact changes from 834,261 B raw / 225,724 B gzip
to 834,611 B raw / 225,802 B gzip (+350 B raw / +78 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,646 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Assistant Evidence Selection

`AssistantGenerationPresenter` now subscribes to evidence-selection outcomes
from both the project-evidence and claim owners, updates the assistant evidence
owner, and projects evidence-focus success or empty-state guidance. The
coordinator retains Research-rail navigation, empty-evidence toast policy, and
canonical availability refresh through three narrow callbacks.

This checkpoint reduces `src/client/app.ts` from 2,870 to 2,855 lines (-15)
and grows the generation presenter from 426 to 452 lines. Runtime source across
those two files grows by 11 lines while deleting two coordinator evidence
branches, the selection adapter, the evidence-focus method, and its direct
assistant-status mutations. The twelve direct presenter cases now also cover
cross-panel evidence selection, successful focus guidance, and empty-evidence
reporting under strict client and Workers types.

The browser application artifact changes from 834,611 B raw / 225,802 B gzip
to 834,843 B raw / 225,659 B gzip (+232 B raw / -143 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,646 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Assistant Generation Orchestration

`AssistantGenerationPresenter` now owns generation busy gating, prepared-input
acquisition, workflow-start and final availability refresh timing, operation
routing, candidate-open sequencing, success status, unavailable-operation
failure, and provider-failure status. The coordinator exposes typed callbacks
for XState start, completion, and failure transitions plus canonical candidate
refresh and context opening.

This checkpoint reduces `src/client/app.ts` from 2,855 to 2,826 lines (-29)
and grows the generation presenter from 452 to 481 lines, leaving runtime source
across those two files unchanged. It deletes the coordinator generation method,
failure adapter, operation runner, direct generation-status mutations, and the
presenter-context type import. Thirteen direct presenter cases cover busy
suppression, canonical input acquisition, workflow start, candidate opening,
success completion, unavailable generation, failure status, and all preceding
assistant routes under strict client and Workers types.

The browser application artifact changes from 834,843 B raw / 225,659 B gzip
to 835,115 B raw / 225,748 B gzip (+272 B raw / +89 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,647 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Generated Table Continuation

`AssistantGenerationPresenter` now intercepts generated-table actions,
validates the captured target against reviewing state, canonical document
stability, source revision, and exact current text, derives portable surrounding
newlines, and projects stale or inserted status. `WorkspaceApp` retains only
the authorized XState completion, Yjs replacement, editor focus/caret update,
and remembered authoring selection.

This checkpoint reduces `src/client/app.ts` from 2,826 to 2,810 lines (-16)
and grows the generation presenter from 481 to 512 lines. Runtime source across
those two files grows by 15 lines while deleting the coordinator result-action
router, captured-table validation, spacing derivation, and direct status
mutations. The thirteen direct presenter cases now also cover valid table
continuation, derived insertion text, stale suppression, and existing reference-
refresh behavior under strict client and Workers types.

The browser application artifact changes from 835,115 B raw / 225,748 B gzip
to 835,283 B raw / 225,784 B gzip (+168 B raw / +36 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,647 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Promoted Revision Continuation

`AssistantGenerationPresenter` now intercepts promoted-revision actions and
owns review-state gating, typed candidate-request adaptation, persistence and
canonical-open sequencing, success/failure status, and availability refresh
timing. `WorkspaceApp` retains XState transitions plus canonical refresh and
Context opening through narrow callbacks; it no longer routes any assistant
result action or writes assistant result status directly.

This checkpoint reduces `src/client/app.ts` from 2,810 to 2,775 lines (-35)
and grows the generation presenter from 512 to 548 lines. Runtime source across
those two files grows by one line while deleting the coordinator promoted-
revision workflow method, its local input/choice contracts, the final assistant-
result type import, and all remaining direct assistant-status mutations.
Fourteen direct presenter cases cover promoted-revision review gating,
persistence, canonical opening, success, provider failure, and all preceding
assistant routes under strict client and Workers types.

The browser application artifact changes from 835,283 B raw / 225,784 B gzip
to 835,520 B raw / 225,826 B gzip (+237 B raw / +42 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,648 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Assistant Workflow Actor

`AssistantGenerationPresenter` now owns the browser-local assistant XState
actor and all generation, clarity, table, promoted-revision, and candidate-
decision transitions. It derives busy and decision availability from that actor
and marks captured transient results stale when the canonical source changes.
`WorkspaceApp` retains authorized Yjs mutation, canonical workspace and Library
refresh, navigation, editor focus, and toast policy through narrow callbacks.

This checkpoint reduces `src/client/app.ts` from 2,775 to 2,735 lines (-40)
and grows the generation presenter from 548 to 563 lines. Runtime source across
those two files falls by 25 lines while removing the coordinator-owned actor,
parallel workflow projection, and candidate-decision routing. Sixteen direct
presenter cases now cover actor-derived generation gating, clarification and
staleness, table and promoted-revision continuation, candidate decisions, and
provider failures under strict client and Workers types.

The browser application artifact changes from 835,520 B raw / 225,826 B gzip
to 835,246 B raw / 225,661 B gzip (-274 B raw / -165 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,650 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Coordinator Reduction: Deferred Deletion Lifecycle

`DeferredDeletionController` now owns the shared grace timer, duplicate-key
suppression, one-shot Undo path, delayed commit, and failed-commit restoration
used by project templates, files, folders, and images. `WorkspaceApp` supplies
only each resource's canonical hide, restore, and commit effects plus the
existing toast outlet.

This checkpoint reduces `src/client/app.ts` from 2,735 to 2,687 lines (-48).
The 65-line controller replaces coordinator-local pending state, two private
contracts, a timing constant, and three workflow methods. Four direct cases
cover expiry, one-shot Undo, failed commit recovery, and duplicate suppression
under strict client and Workers types.

The browser application artifact changes from 835,246 B raw / 225,661 B gzip
to 835,394 B raw / 225,724 B gzip (+148 B raw / +63 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,654 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project Tree Deletion Lifecycle

`ProjectTreePanel` now owns the complete empty-folder and image deletion
lifecycle: encoded transport, response validation, optimistic visibility,
six-second delayed commit, Undo restoration, failure notices, hidden-image
projection for Preview, and resource-keyed menu state. Notices wait for the
corresponding Lit update, so restored rows are stable before another action can
begin. `WorkspaceApp` retains active-file deletion, canonical snapshot
application, cross-feature rendering, image insertion, and the toast outlet.

This checkpoint reduces `src/client/app.ts` from 2,687 to 2,643 lines (-44)
and grows the project-tree owner from 278 to 350 lines. Runtime source across
those files grows by 28 lines while deleting two coordinator hidden-state sets,
two resource-specific deletion workflows, and two delete intents. Six direct
tree cases cover filtering, stable menu state, actions, delayed validated
deletion, failed restoration, and Undo under strict client and Workers types.

The browser application artifact changes from 835,394 B raw / 225,724 B gzip
to 836,212 B raw / 226,037 B gzip (+818 B raw / +313 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,654 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Template Deletion Lifecycle

`ProjectStartingPointBrowser` now owns personal-template optimistic hiding,
six-second delayed commit, Undo restoration, failure notices, encoded deletion,
and post-delete catalog refresh as one local lifecycle. It keeps its visible
template projection and selection normalized throughout. `WorkspaceApp` retains
import workflows, replacement-option synchronization, and the toast outlet.

This checkpoint reduces `src/client/app.ts` from 2,643 to 2,623 lines (-20)
and grows the starting-point owner from 517 to 543 lines. Runtime source across
those files grows by six lines while removing the coordinator's template-delete
event, workflow method, hidden-state adapter, and template-summary dependency.
Eight direct browser cases cover catalog loading, optimistic removal and Undo,
delayed encoded deletion, refresh, creation, imports, modal focus, and failure
paths under strict client and Workers types.

The browser application artifact changes from 836,212 B raw / 226,037 B gzip
to 836,397 B raw / 226,055 B gzip (+185 B raw / +18 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,654 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Private PDF Event Routing

`ContextResourcePresenter` now binds and routes the private-PDF inspector,
annotation toolbar, and markup-layer action streams. It owns local tool,
selection, draft, save, import, delete, export, status, and completion
presentation while `WorkspaceApp` supplies only canonical refresh,
cross-resource navigation, citation insertion, the shared toast outlet, and
PDF-viewer effects through a typed coordinator boundary.

This checkpoint reduces `src/client/app.ts` from 2,623 to 2,504 lines (-119)
and grows the existing resource presenter from 314 to 491 lines. Runtime source
across those files grows by 58 lines while deleting 14 coordinator workflow
methods and six direct sibling event subscriptions. Fourteen direct presenter
cases cover the routed action boundary plus draft composition, annotation
selection, inspector closure, tool projection, page-local markup, canonical
workspace fan-out, and strict client and Workers types.

The browser application artifact changes from 836,397 B raw / 226,055 B gzip
to 838,304 B raw / 226,459 B gzip (+1,907 B raw / +404 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,655 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Valibot Adoption: GitHub Commands

GitHub Import, Pull, Publish-preview, and Publish-confirmation requests now use
bounded Valibot schemas for record shape, operation ids, strings, safe conflict
indexes, resolution choices, and optional resolution arrays. Authorization,
preview freshness, complete conflict coverage, remote repository identity, and
ambiguous-publish reconciliation remain explicit orchestration policy.

This checkpoint reduces the GitHub sync API, import API, and their shared
contracts from 478 to 463 lines (-15), replacing five request predicates, the
pull-resolution array guard, and the final shared generic record predicate.
One focused Workers case exercises malformed Import, Pull, and Publish commands
alongside the existing end-to-end API coverage and strict types.

Browser application and style artifacts remain unchanged at 838,304 B raw /
226,459 B gzip and 135,411 B raw / 23,373 B gzip because this boundary is
Worker-side. Direct and unique production package counts remain 18 and 150;
Valibot was already pinned.

Full native CI passes all 1,655 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Valibot Adoption: Private PDF Mutations

The owner-library API now validates private highlight creation and comments,
imported-highlight envelopes, PDF notes, drawings and points, drawing-style and
note-position updates, and reading-state commands with composable Valibot
schemas. Imported-highlight candidate semantics still reuse the existing domain
validator; authorization and Durable Object bounds remain explicit.

This checkpoint reduces `src/api/reference-library.ts` from 1,718 to 1,649
lines (-69), replacing five parallel request interfaces and nine handwritten
structure predicates. One focused API case covers malformed highlight, import,
note, drawing, point, style, position, comment, and reading-state shapes in
addition to the existing successful mutation workflow.

Browser application and style artifacts remain unchanged at 838,304 B raw /
226,459 B gzip and 135,411 B raw / 23,373 B gzip because this boundary is
Worker-side. Direct and unique production package counts remain 18 and 150;
Valibot was already pinned.

Full native CI passes all 1,656 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Completed Lit Ownership: Project File Deletion

`ProjectFileDialog` now owns the remaining supporting-file deletion lifecycle:
encoded validated transport, optimistic hidden-file projection, six-second
delayed commit, Undo restoration, failed-commit restoration, and deletion
notices. `WorkspaceApp` supplies only canonical snapshot application, active-
file selection, rerendering, and the shared toast outlet.

This checkpoint reduces `src/client/app.ts` from 2,504 to 2,490 lines (-14)
and grows the existing project-file owner from 220 to 258 lines. Runtime source
across those files grows by 24 lines while deleting the coordinator's final
deferred-deletion controller, hidden-file set, and deletion schedule. Twelve
direct dialog cases cover create, rename, content creation, deferred deletion,
Undo, failed restoration, modal lifecycle, response validation, and strict
client and Workers types.

The browser application artifact changes from 838,304 B raw / 226,459 B gzip
to 838,842 B raw / 226,566 B gzip (+538 B raw / +107 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,657 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Valibot Adoption: Workspace Lifecycle Commands

Workspace settings, project duplication, milestone creation, and revision
seeding now validate their local request structures and scalar bounds with
composable Valibot schemas. Authorization, canonical title trimming, catalog
fan-out, revision identity, and Durable Object mutations remain explicit
workspace orchestration policy.

This checkpoint reduces `src/api/workspace.ts` from 1,749 to 1,720 lines (-29),
replacing three request interfaces, four structural predicates, two primitive
helpers, and an inline duplicate-title guard. Existing lifecycle and history
browser scenarios now also reject blank or overlong titles, empty entry-file
identities, and malformed milestone names alongside strict types and all 121
Workers-runtime tests.

Browser application and style artifacts remain unchanged at 838,842 B raw /
226,566 B gzip and 135,411 B raw / 23,373 B gzip because this boundary is
Worker-side. Direct and unique production package counts remain 18 and 150;
Valibot was already pinned.

Full native CI passes all 1,657 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Valibot Adoption: Library Metadata Review

Reviewed PDF metadata, Crossref acceptance, provider-refinement preview, and
single or batch provider acceptance now compose Valibot schemas for artifact
ids, optional bounded fields, fingerprints, provider choices, and selected
fields. Normalized-DOI, unique-provider, disjoint-field, stale-provider, and
duplicate-record invariants remain explicit orchestration policy.

This checkpoint reduces `src/api/reference-library.ts` from 1,649 to 1,636
lines (-13), replacing six nested handwritten guards with reusable schemas and
direct schema-backed narrowing at each request boundary. Ninety-four affected
API and integration tests cover empty, unknown, over-limit, duplicate-field,
mixed-work, duplicate-provider, overlapping-field, stale, and successful
metadata paths alongside strict types and all 121 Workers-runtime tests.

Browser application and style artifacts remain unchanged at 838,842 B raw /
226,566 B gzip and 135,411 B raw / 23,373 B gzip because this boundary is
Worker-side. Direct and unique production package counts remain 18 and 150;
Valibot was already pinned.

Full native CI passes all 1,657 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Reference Library Event Routing

`ReferenceLibraryWorkspace` now binds and routes the summary, personal-fields,
metadata-editor, PDF-row, research-row, citation-network, and unidentified-PDF
child outcome streams that it composes. `WorkspaceApp` supplies canonical
refresh, PDF navigation, web-capture/comparison, and notice effects through one
typed callback boundary instead of subscribing to every nested component.

This checkpoint reduces `src/client/app.ts` from 2,490 to 2,438 lines (-52)
and grows the existing composed Library owner from 100 to 184 lines. Runtime
source across those files grows by 32 lines while removing nine coordinator
subscriptions and ten child-event imports. Four direct workspace cases cover
canonical projection, filter and reveal delegation, nested lifecycle controls,
and the complete routed-outcome boundary under strict client and Workers types.

The browser application artifact changes from 838,842 B raw / 226,566 B gzip
to 839,286 B raw / 226,580 B gzip (+444 B raw / +14 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,658 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Context Tab Navigation Routing

`ContextTabStrip` now routes its fixed-tab actions and the activate/close
outcomes from its composed resource strip and overflow overview through one
typed navigation boundary. `WorkspaceApp` retains canonical tab state,
authorized Library loading, route synchronization, transitions, and content
rendering without subscribing to all three presentation streams.

This checkpoint reduces `src/client/app.ts` from 2,438 to 2,425 lines (-13)
and grows the composed context-tab owner from 267 to 303 lines. Runtime source
across those files grows by 23 lines while removing three coordinator
subscriptions and three child-event imports. Nine direct strip cases cover
fixed and resource presentation, title projection, panel control, keyboard
focus, emitted intents, and the unified navigation boundary under strict types.

The browser application artifact changes from 839,286 B raw / 226,580 B gzip
to 839,517 B raw / 226,696 B gzip (+231 B raw / +116 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,659 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Workspace Preview Navigation Routing

`WorkspacePreview` now routes rendered-source clicks, semantic citation
intents, and its nested diagnostics panel's source-range selections through one
typed navigation boundary. `WorkspaceApp` retains source-map translation,
project-file switching, publication resolution, citation navigation, and the
resulting context and editor transitions.

This checkpoint reduces `src/client/app.ts` from 2,425 to 2,416 lines (-9) and
grows the Preview owner from 276 to 301 lines. Runtime source across those files
grows by 16 lines while removing two coordinator subscriptions and two child-
event imports. Five direct Preview cases cover rendering, fallback, stale work,
heading-number mapping, and the unified navigation boundary under strict types.

The browser application artifact changes from 839,517 B raw / 226,696 B gzip
to 839,769 B raw / 226,801 B gzip (+252 B raw / +105 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,660 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Modal Workflow Routing

The project-history dialog and workspace-sharing panel now bind their sibling
entry triggers and forward local notices through typed configuration.
`WorkspaceApp` retains global toast policy without subscribing to either
workflow's trigger or outcome stream.

This checkpoint reduces `src/client/app.ts` from 2,416 to 2,411 lines (-5) and
removes four coordinator subscriptions and three event imports. The two
existing workflow owners grow by 45 lines to manage typed configuration and
listener teardown. Fourteen focused cases cover the request, presentation,
trigger, notice, and dialog lifecycles under strict client and Workers types.

The browser application artifact changes from 839,769 B raw / 226,801 B gzip
to 840,388 B raw / 226,939 B gzip (+619 B raw / +138 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,662 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project File Workflow Routing

`ProjectFileDialog` now binds and routes both file-action controls, project-tree
intents, image-upload completion, and its own save completion through one typed
workflow boundary. `WorkspaceApp` retains collaborative include-target capture,
Yjs insertion, canonical snapshot application, selection, rendering, rail
policy, and global notices.

This checkpoint reduces `src/client/app.ts` from 2,411 to 2,399 lines (-12)
and removes five runtime coordinator subscriptions and four event imports. The
existing project-file owner grows from 234 to 340 lines, including scoped
AbortController teardown; total runtime source across those files grows by 94
lines while consolidating the spatially separate workflow. Thirteen focused
cases cover file/folder operations, deletion, routing, upload and save outcomes,
and modal behavior under strict types.

The browser application artifact changes from 840,388 B raw / 226,939 B gzip
to 841,301 B raw / 227,193 B gzip (+913 B raw / +254 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,663 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Valibot Adoption: Edit Capability Mutations

The edit-link file replacement boundary now validates content and expected
revision with one Valibot schema. Bounded streaming, bearer-capability and
same-origin authorization, stale-revision enforcement, and stable response
mapping remain explicit.

This checkpoint reduces `src/api/edit-share.ts` from 140 to 134 lines (-6),
removing its local record predicate and manual field checks. The focused suite
covers malformed JSON, declared-byte overflow, missing and fractional
revisions, structural arrays, the exact content ceiling, same-origin denial,
successful mutation, revision conflict, missing file, and domain size errors
under strict types.

Browser application and style artifacts remain unchanged at 841,301 B raw /
227,193 B gzip and 135,411 B raw / 23,373 B gzip because this boundary is
Worker-side. Direct and unique production package counts remain 18 and 150;
Valibot was already pinned.

Full native CI passes all 1,663 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Preview Sync Interaction

`PreviewSyncControls` now owns source click, selection, and navigation-key
listeners, explicit button routing, and scoped listener teardown alongside its
existing source-map and viewport translation. `WorkspaceApp` retains active-file
identity, responsive availability, Preview navigation, caret placement, and
focus policy through one typed callback boundary.

This checkpoint reduces `src/client/app.ts` from 2,399 to 2,389 lines (-10),
removes four coordinator subscriptions and one event import, and grows the
existing synchronization owner from 115 to 151 lines. Runtime source across
those files grows by 26 lines while deleting the coordinator's duplicated
navigation-key policy. Focused coverage exercises explicit directions,
automatic click, selection, navigation and typing behavior, source-map
translation, viewport centering, visibility, and strict types.

The browser application artifact changes from 841,301 B raw / 227,193 B gzip
to 841,560 B raw / 227,268 B gzip (+259 B raw / +75 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,663 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Full Library Surface

`ReferenceLibraryWorkspace` now encompasses discovery, reference import, PDF
upload and status, web capture, tools, filters, results, citation network, and
the unidentified-PDF queue. It owns sibling result routing, upload/status
binding, archive visibility, capture delegation, completion acknowledgements,
and all local outcome subscriptions while `WorkspaceApp` retains canonical
refresh, comparison, cross-feature navigation, and notice effects.

This checkpoint reduces `src/client/app.ts` from 2,389 to 2,331 lines (-58),
removes eight coordinator listener sites and fifteen event/type import lines,
and removes seven entries plus their imports from the global element registry.
The existing Library owner grows from 184 to 269 lines; total runtime source
across the owner, coordinator, and registry grows by 13 lines while collapsing
the complete Library surface behind one boundary. Five direct owner cases and
the shell/registry suites cover canonical composition, all nested and sibling
outcomes, completion callbacks, navigation, archive/capture delegation, and
strict types.

The browser application artifact changes from 841,560 B raw / 227,268 B gzip
to 841,636 B raw / 227,233 B gzip (+76 B raw / -35 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,664 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Composed Claim Editor

`ClaimListPanel` now composes `ClaimDialog`, derives create/edit inputs from its
canonical claim projection, owns evidence availability, and converts successful
editor saves into its existing mutation outcome. `WorkspaceApp` retains Yjs
passage validation, canonical refresh, navigation, and notice policy without
addressing the editor separately.

This checkpoint reduces `src/client/app.ts` from 2,331 to 2,310 lines (-21),
removes two coordinator listener sites, the dialog event/type imports, one
global element-registry entry, and the coordinator's claim-opening method. The
server shell also drops 30 lines of duplicate dialog fallback markup. The
existing claim owners grow by 24 lines; focused component and shell coverage
exercises create/edit input derivation, save outcome routing, persistence,
registry composition, and strict types.

The browser application artifact changes from 841,636 B raw / 227,233 B gzip
to 841,680 B raw / 227,002 B gzip (+44 B raw / -231 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,667 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Comment Authoring Routing

`ManuscriptCommentList` now resolves its own create and re-anchor actions through
one typed authoring-passage callback. `WorkspaceApp` retains Yjs stability and
selection validation, typed passage derivation, canonical refresh, navigation,
and notice policy without translating the component's own events back into
methods on the same component.

This checkpoint reduces `src/client/app.ts` from 2,310 to 2,295 lines (-15),
removes one coordinator listener site, both create/re-anchor event variants, and
two coordinator orchestration methods. The existing comment owner grows from
195 to 216 lines. Focused coverage exercises create and re-anchor routing,
missing authoring inputs, persistence, open navigation, and strict types.

The browser application artifact changes from 841,680 B raw / 227,002 B gzip
to 841,506 B raw / 226,997 B gzip (-174 B raw / -5 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,668 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Settings Entry and Outcomes

`WorkspaceSettingsPanel` now binds its project-settings trigger, captures fresh
canonical view inputs when opening, and invokes typed catalog, template, and
GitHub callbacks after local actions. `WorkspaceApp` retains those authorities
without subscribing to or interpreting panel-local action events.

This checkpoint reduces `src/client/app.ts` from 2,295 to 2,285 lines (-10),
removes two coordinator listener sites, the settings action event and type, and
the coordinator's open/outcome methods. The existing settings owner grows from
397 to 425 lines and adds scoped trigger teardown with reconnect support.
Focused coverage exercises trigger opening, fresh inputs, optional GitHub
refresh, catalog and template outcomes, persistence, and strict types.

The browser application artifact changes from 841,506 B raw / 226,997 B gzip
to 841,890 B raw / 227,133 B gzip (+384 B raw / +136 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,669 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Composed Publication Intake

`ProjectAnnotationForm` now owns the `PublicationIntakePanel` it already renders.
It configures the nested component, projects the active project PDF, acknowledges
or rejects refresh-pending acceptance, and routes linked or accepted publication
navigation through typed callbacks. `WorkspaceApp` retains canonical refresh,
context navigation, and notices without addressing the nested intake directly.

This checkpoint reduces `src/client/app.ts` from 2,285 to 2,269 lines (-16),
removes one coordinator listener site, the intake event/type import, one global
element-registry entry, and the coordinator's acceptance-completion method.
`ContextResourcePresenter` delegates active-PDF projection through the parent
instead of globally locating the child. The existing annotation owner grows
from 366 to 432 lines. Focused coverage exercises PDF projection, linked and
accepted navigation, refresh acknowledgement and rejection, persistence,
registry composition, and strict types.

The browser application artifact changes from 841,890 B raw / 227,133 B gzip
to 842,475 B raw / 227,317 B gzip (+585 B raw / +184 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,670 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Annotation Workflow Binding

`ProjectAnnotationForm` now routes tool selection, stroke undo, page citation,
and completed note saves through one typed workflow binding. `WorkspaceApp`
retains highlight-tool synchronization, PDF mutation, manuscript linking,
canonical refresh, citation insertion, and notification policy.

This checkpoint reduces `src/client/app.ts` from 2,269 to 2,260 lines (-9),
removes two coordinator listener sites and the public annotation action and save
event protocols, and reduces the annotation owner from 432 to 431 lines.
Focused coverage exercises note-save completion, both tool choices, undo,
citation, existing intake composition, persistence, and strict types.

The browser application artifact changes from 842,475 B raw / 227,317 B gzip
to 842,282 B raw / 227,289 B gzip (-193 B raw / -28 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,670 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Publication List Binding

`PublicationListPanel` now routes context opening, Library management, and
completed DOI enrichment through one typed binding. `WorkspaceApp` retains
context navigation, authorized Library routing, canonical refresh, and
notification policy.

This checkpoint reduces `src/client/app.ts` from 2,260 to 2,259 lines (-1),
removes one coordinator listener site and the public publication-list action
protocol, and leaves the 159-line publication-list owner unchanged. Focused
coverage exercises open and manage routing, completed enrichment, retryable
failure, duplicate-submit protection, rendering, and strict types.

The browser application artifact changes from 842,282 B raw / 227,289 B gzip
to 842,086 B raw / 227,286 B gzip (-196 B raw / -3 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,670 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project Map Navigation

`ProjectMapWorkspace` now forwards child map, search, and connection selections
through one typed navigation binding. `WorkspaceApp` retains canonical resource
resolution, context navigation, editor visibility, and URL policy.

This checkpoint reduces `src/client/app.ts` from 2,259 to 2,256 lines (-3),
removes one coordinator listener site and the public project-map selection
event, and grows the map workspace from 163 to 166 lines. Runtime source across
those two files is unchanged. Focused coverage exercises authorized search,
selection forwarding, request and contract failures, composed child updates,
visibility focus, rendering, and strict types.

The browser application artifact changes from 842,086 B raw / 227,286 B gzip
to 842,045 B raw / 227,284 B gzip (-41 B raw / -2 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,670 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Shared Evidence Bindings

`ProjectEvidencePanel` and `ClaimListPanel` now route workspace mutation and
navigation outcomes through typed workspace bindings while sending grounding
choices through separate assistant-selection callbacks. `WorkspaceApp` retains
canonical refresh, PDF and manuscript coordination, navigation, and notices;
`AssistantGenerationPresenter` retains browser-local grounding selection and
availability policy.

This checkpoint reduces `src/client/app.ts` from 2,256 to 2,247 lines (-9) and
the assistant presenter from 563 to 558 lines (-5). The project-evidence owner
grows from 558 to 559 lines and the claim owner from 307 to 311 lines. Runtime
source across the four files decreases by nine lines while removing two
coordinator listeners, two assistant-presenter subscriptions, both public
action protocols, and their union imports. Focused coverage exercises all
mutation, navigation, grounding-selection, persistence, failure, rendering,
assistant-control, and strict-type paths.

The browser application artifact changes from 842,045 B raw / 227,284 B gzip
to 841,216 B raw / 227,079 B gzip (-829 B raw / -205 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,670 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Comment Workspace Binding

`ManuscriptCommentList` now uses one typed workspace binding for validated
authoring passages, passage navigation, and completed mutations. `WorkspaceApp`
retains Yjs selection stability, current-passage derivation, canonical refresh,
navigation, and notification policy.

This checkpoint reduces `src/client/app.ts` from 2,247 to 2,244 lines (-3),
removes one coordinator listener site and the public manuscript-comment action
protocol, and reduces the comment owner from 216 to 208 lines. Runtime source
across those two files decreases by eleven lines. Focused coverage exercises
open navigation, create, re-anchor, resolve, bound and missing passages,
retryable failures, duplicate resolution, rendering, and strict types.

The browser application artifact changes from 841,216 B raw / 227,079 B gzip
to 840,989 B raw / 227,031 B gzip (-227 B raw / -48 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,670 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Publication Context Binding

`PublicationContextPanel` now routes citation insertion, paper navigation, and
completed project-paper relationship mutations through one typed workspace
binding. `WorkspaceApp` retains authoring insertion, PDF and Library navigation,
canonical refresh, and notification policy.

This checkpoint leaves `src/client/app.ts` at 2,244 lines while removing one
coordinator listener site, the public publication-context action protocol, and
its union import. The 294-line publication-context owner is also unchanged.
Focused coverage exercises citation and all paper variants, link and unlink
persistence, retryable failure, duplicate mutation, projection, scrolling,
rendering, and strict types.

The browser application artifact changes from 840,989 B raw / 227,031 B gzip
to 840,806 B raw / 226,988 B gzip (-183 B raw / -43 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,670 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Authoring Control Bindings

`EditorInsertMenu`, `SourceCompletion`, and `SourceCitationControl` now route
syntax and include insertion, completion acceptance, and resolved citation
navigation through narrow typed bindings. `WorkspaceApp` retains collaborative
selection resolution, authorized Yjs edits, private-Library linking,
publication resolution, navigation, and notification policy.

This checkpoint reduces `src/client/app.ts` from 2,244 to 2,240 lines (-4),
removes three coordinator listener sites and all three public action-event
contracts, and removes the editor insert-action union. Runtime source across
the four files increases by three lines because the components expose explicit
binding methods and keep safe unbound behavior. Focused coverage exercises
syntax and relative includes, keyboard completion, editor binding, citation
presence and absence, and strict types.

The browser application artifact changes from 840,806 B raw / 226,988 B gzip
to 840,669 B raw / 226,983 B gzip (-137 B raw / -5 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,670 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Workspace View Navigation

`AuthoringModeTabs` and `WorkspaceSurfaceSwitcher` now route Write/Map and
Authoring/Context selections through narrow typed navigation bindings.
`WorkspaceApp` retains editor focus, responsive pane visibility, route
synchronization, and canonical workspace state.

This checkpoint reduces `src/client/app.ts` from 2,240 to 2,236 lines (-4),
removes two coordinator listener sites and both public change-event contracts,
and grows the two control owners by six lines total. Runtime source across the
three files increases by two lines for the explicit binding methods. Focused
coverage exercises current, missing, and changed selections, controlled
visibility, active presentation, and strict types.

The browser application artifact changes from 840,669 B raw / 226,983 B gzip
to 840,561 B raw / 227,006 B gzip (-108 B raw / +23 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,670 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project Rail Navigation

`WorkspaceRailTabs` and `ManuscriptMapPanel` now route rail selection and
validated manuscript ranges through narrow typed navigation bindings.
`WorkspaceApp` retains panel and guide presentation, route synchronization,
composed-source resolution, and file-qualified editor focus.

This checkpoint reduces `src/client/app.ts` from 2,236 to 2,231 lines (-5),
removes two coordinator listener sites and both public selection-event
contracts, and leaves runtime source across the two component owners unchanged.
Runtime source across all three files decreases by five lines. Focused coverage
exercises current, missing, and changed rail selections, controlled panels,
valid and invalid manuscript ranges, editing passes, presentation, and strict
types.

The browser application artifact changes from 840,561 B raw / 227,006 B gzip
to 840,451 B raw / 226,994 B gzip (-110 B raw / -12 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,670 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Writing Workflow Bindings

`ResearchDiarySummary` and the reused `WritingWorkflowPanel` now route diary
opening plus research-question and reviewer-response opening, source selection,
and notices through typed bindings. `WorkspaceApp` retains workflow-template
choice, content-bearing file creation, source navigation, and toast policy.

This checkpoint reduces `src/client/app.ts` from 2,231 to 2,217 lines (-14),
removes two coordinator listener sites, three runtime subscriptions, both public
events, the writing-workflow action union, and its coordinator dispatcher. The
two component owners shrink from 265 to 250 lines (-15), reducing runtime source
across all three files by 29 lines. Focused coverage exercises diary summaries,
open actions, reviewer-letter download and notice, bounded source selection,
workflow projections, presentation, and strict types.

The browser application artifact changes from 840,451 B raw / 226,994 B gzip
to 840,110 B raw / 226,976 B gzip (-341 B raw / -18 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,670 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Shell Control Bindings

`ApplicationVersionControl`, `WorkspaceLayoutControl`,
`ProjectTemplateSaveDialog`, and `ProjectStartingPointBrowser` now route copy
notices, layout changes, validated template saves, and import choices through
narrow typed bindings. `WorkspaceApp` retains global toast policy, responsive
layout application, catalog refresh, and import workflow coordination.

This checkpoint reduces `src/client/app.ts` from 2,217 to 2,209 lines (-8),
removes four coordinator listener sites and all four public event contracts.
The four component owners grow from 957 to 964 lines (+7), reducing runtime
source across the five files by one line. Focused coverage exercises clipboard
success and fallback, normalized persisted layouts, create and replacement
saves, import handoff, project creation, presentation, and strict types.

The browser application artifact changes from 840,110 B raw / 226,976 B gzip
to 839,858 B raw / 226,943 B gzip (-252 B raw / -33 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,670 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Library Mutation Routing

`ReferenceLibraryWorkspace` and `LibraryPdfInspector` now intercept nested
project-reference and research mutation outcomes and route them through typed
coordinator callbacks. The child events remain internal composite transport;
`WorkspaceApp` retains canonical snapshot application, Library rerendering, and
toast policy.

This checkpoint reduces `src/client/app.ts` from 2,209 to 2,199 lines (-10) and
removes two coordinator listener sites representing four runtime subscriptions.
The two composite owners grow from 557 to 583 lines (+26), increasing runtime
source across the three files by 16 lines while making the application boundary
independent of nested child event protocols. Focused coverage exercises both
mutation families through both composites, existing Library outcome routing,
PDF projection, and strict types.

The browser application artifact changes from 839,858 B raw / 226,943 B gzip
to 840,174 B raw / 227,035 B gzip (+316 B raw / +92 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,671 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Collaborator Overlay Refresh

`CollaboratorSelectionList` now reports remote-selection changes through one
typed callback. `WorkspaceApp` no longer imports or subscribes to the
component's internal custom-event name and retains local-author presence,
collaboration transport, revision authority, and editor highlight placement.

This checkpoint reduces `src/client/app.ts` from 2,199 to 2,198 lines (-1) and
grows the collaborator-selection owner from 96 to 99 lines (+3). Runtime source
across the two files increases by two lines while deleting the public event
protocol and its coordinator listener. Focused coverage exercises replacement,
departure, clearing, stale-revision pruning, callback delivery, and strict
types.

The browser application artifact changes from 840,174 B raw / 227,035 B gzip
to 840,220 B raw / 227,049 B gzip (+46 B raw / +14 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

## Continued Lit Ownership: Project Dialog Entry

`WorkspaceCatalogPanel` now binds its server-rendered Projects trigger.
`ProjectStartingPointBrowser` binds its New project trigger and owns loading-
state entry, post-load focus, and local load-failure presentation around the
coordinator's canonical catalog refresh. `WorkspaceApp` no longer binds either
raw button or wraps the starting-point lifecycle in a separate method.

This checkpoint reduces `src/client/app.ts` from 2,198 to 2,186 lines (-12) and
removes its final two server-rendered button listeners. The two Lit owners grow
from 657 to 703 lines (+46), increasing runtime source across the three files
by 34 lines while localizing complete dialog-entry lifecycles. Focused coverage
exercises both triggers, loading completion, modal entry, filter reset, existing
starting-point behavior, application contracts, and strict types.

The browser application artifact changes from 840,220 B raw / 227,049 B gzip
to 840,651 B raw / 227,173 B gzip (+431 B raw / +124 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,673 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Evidence-Map Resource Routing

`ProjectMapWorkspace` now parses kind-qualified resource keys and routes every
supported resource kind through one exhaustive typed binding. `WorkspaceApp`
supplies canonical lookups and cross-feature navigation effects once; it no
longer parses opaque keys or constructs a fresh generic handler record for each
selection.

This checkpoint reduces `src/client/app.ts` from 2,186 to 2,174 lines (-12) and
grows the project-map workspace from 159 to 182 lines (+23). Runtime source
across the two files increases by 11 lines while replacing string-indexed
routing with an exhaustive domain-kind contract and reusing the domain's
existing resource-kind guard. Focused coverage exercises search, each existing
navigation path, valid key routing, malformed and unknown keys, child
projection, and strict types.

The browser application artifact changes from 840,651 B raw / 227,173 B gzip
to 840,665 B raw / 227,258 B gzip (+14 B raw / +85 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,674 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Private-Highlight Citation

`ContextResourcePresenter` now owns private-highlight citation readiness
feedback, Library-record resolution, collision-safe project-alias selection,
and validated project-reference link transport. `WorkspaceApp` retains caret
authority, canonical snapshot acceptance, Library reprojection, and the actual
Yjs citation insertion behind typed callbacks.

This checkpoint reduces `src/client/app.ts` from 2,174 to 2,152 lines (-22) and
grows the context-resource presenter from 490 to 526 lines (+36). Runtime source
across the two files increases by 14 lines while moving the complete cite action
into its existing private-PDF workflow owner. Focused coverage exercises
existing links, collision-safe creation, canonical mutation completion, missing
caret and source feedback, existing private-PDF routing, and strict types.

The browser application artifact changes from 840,665 B raw / 227,258 B gzip
to 840,921 B raw / 227,437 B gzip (+256 B raw / +179 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,676 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Library Refresh Completion

`ReferenceLibraryWorkspace` now owns child mutation refresh completion,
success/failure notice selection, alternate metadata refresh, and local request
finalizers. Private-PDF markup completion converges through the same composite
boundary. `WorkspaceApp` retains canonical Library loading and the shared toast
outlet behind typed callbacks.

This checkpoint reduces `src/client/app.ts` from 2,152 to 2,129 lines (-23) and
grows the reference-Library workspace from 280 to 288 lines (+8). Runtime source
across the two files decreases by 15 lines while deleting the coordinator's
over-general completion options and separate markup wrapper. Focused coverage
exercises every child outcome family, metadata-specific refresh, success,
failure, finalizer settlement, private-PDF routing, and strict types.

The browser application artifact shrinks from 840,921 B raw / 227,437 B gzip
to 840,846 B raw / 227,415 B gzip (-75 B raw / -22 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,677 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project Image Projection

`ProjectFileDialog` now owns the project tree's image-insertion projection:
active-file-relative paths, safe angle-bracket targets, normalized alt text,
and the completion message. `WorkspaceApp` retains canonical active-file
authority, collaborative Yjs insertion, caret and focus restoration, and the
shared toast outlet.

This checkpoint reduces `src/client/app.ts` from 2,129 to 2,113 lines (-16) and
grows the project-file dialog from 334 to 362 lines (+28). Runtime source across
the two files increases by 12 lines while moving Markdown image-format policy
into the existing Lit owner of the tree insertion action. Focused coverage
exercises nested paths, whitespace and parentheses, alt-text normalization,
existing action routing, application contracts, and strict types.

The browser application artifact shrinks from 840,846 B raw / 227,415 B gzip
to 840,834 B raw / 227,389 B gzip (-12 B raw / -26 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,678 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project File Presentation

`ProjectFileDialog` now fans a canonical project snapshot into the project
tree, Insert menu, source-completion list, and file-action menu through one
typed presentation binding. It filters the component-owned hidden-file
projection once and derives the active file and entry-file action state there.
`WorkspaceApp` retains canonical snapshot and active-file authority, Yjs
editing, and cross-feature authoring presentation.

This checkpoint reduces `src/client/app.ts` from 2,113 to 2,102 lines (-11) and
grows the project-file dialog from 362 to 394 lines (+32). Runtime source across
the two files increases by 21 lines while replacing four coordinator-owned
presentation calls and their duplicate visible-file lookup with one composite
contract. Focused coverage exercises canonical tree data, active and entry
state, sibling presentation inputs, existing project-file workflow behavior,
application contracts, and strict types.

The browser application artifact changes from 840,834 B raw / 227,389 B gzip
to 840,982 B raw / 227,456 B gzip (+148 B raw / +67 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,679 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project Mutation Outcomes

`ProjectFileDialog` now configures project-tree mutation callbacks and completes
image uploads through the same typed snapshot, preview-change, selection, and
notice binding already used for supporting-file deletion. `WorkspaceApp` keeps
canonical snapshot application, cross-feature rendering, and the shared toast
outlet, but no longer binds the tree separately or owns an image-upload
completion method.

This checkpoint reduces `src/client/app.ts` from 2,102 to 2,086 lines (-16) and
grows the project-file dialog from 394 to 410 lines (+16). Runtime source across
the two files is unchanged while consolidating two duplicated child mutation
paths. Focused coverage exercises binding-order independence, upload snapshot
and notice completion, tree callback configuration, existing deletion and
workflow behavior, application contracts, and strict types.

The browser application artifact changes from 840,982 B raw / 227,456 B gzip
to 841,162 B raw / 227,485 B gzip (+180 B raw / +29 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,679 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Research Resource Authorization

`ContextResourcePresenter` now derives authorized publication, project-PDF,
private-or-linked PDF, and candidate identity sets from canonical project,
Library, and linked-reference inputs. `WorkspaceApp` retains context-state
reconciliation, authorized loading, history, routing, and navigation
transitions.

This checkpoint reduces `src/client/app.ts` from 2,086 to 2,075 lines (-11) and
grows the context-resource presenter from 526 to 540 lines (+14). Runtime source
across the two files increases by three lines while removing the coordinator's
four-kind resource-catalog mapper. Focused coverage exercises complete and empty
catalogs, private and linked PDF unioning, existing context presentation,
application contracts, and strict types.

The browser application artifact changes from 841,162 B raw / 227,485 B gzip
to 841,313 B raw / 227,538 B gzip (+151 B raw / +53 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,680 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Offline Restoration Authority

The offline workspace module now owns record loading, canonical snapshot and
workspace validation, acknowledged server-vector decoding, Yjs update
application, anchor reprojection, and corrupt-record eviction behind one typed
restoration result. `WorkspaceApp` retains collaboration queue recovery,
revision and availability state, and UI projection.

This checkpoint reduces `src/client/app.ts` from 2,075 to 2,065 lines (-10) and
grows the offline workspace authority from 203 to 243 lines (+40). Runtime
source across the two files increases by 30 lines while removing persistence
and corruption policy from the application coordinator. Focused coverage
exercises valid restoration, workspace mismatch, malformed Yjs updates,
malformed server vectors, eviction, existing persistence behavior, application
contracts, and strict types.

The browser application artifact changes from 841,313 B raw / 227,538 B gzip
to 841,471 B raw / 227,586 B gzip (+158 B raw / +48 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,681 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Workspace Catalog Loading

`WorkspaceCatalogPanel` now owns authorized catalog fetch and response
validation, retains the single browser catalog projection, and synchronizes the
compact workspace switcher from that state. Settings, templates, and offline
fallback consume or seed the same component-owned catalog. `WorkspaceApp`
retains canonical route navigation.

This checkpoint reduces `src/client/app.ts` from 2,065 to 2,049 lines (-16) and
grows the workspace-catalog owner from 132 to 159 lines (+27). Runtime source
across the two files increases by 11 lines while deleting two coordinator
methods and its duplicate catalog field. Focused coverage exercises successful,
invalid, and failed loads, switcher synchronization, read-only catalog access,
existing filtering and modal behavior, application contracts, and strict
types.

The browser application artifact changes from 841,471 B raw / 227,586 B gzip
to 841,805 B raw / 227,609 B gzip (+334 B raw / +23 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,682 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Context Route Restoration

`ContextResourcePresenter` now resolves a supplied resource route against the
canonical publication, project-PDF, private-Library PDF, shared-reference PDF,
and candidate catalogs, then emits the matching typed open effect.
`WorkspaceApp` retains Library refresh, PDF loading, viewer effects, history
mutation, navigation transitions, and fallback error policy.

This checkpoint reduces `src/client/app.ts` from 2,049 to 2,026 lines (-23) and
grows the context-resource presenter from 540 to 583 lines (+43). Runtime source
across those two files increases by 20 lines while deleting the coordinator's
duplicated resource-kind route lookup methods. Focused coverage exercises every
resource kind, lazy private-Library refresh, page and annotation forwarding,
missing resources, existing context presentation, application contracts, and
strict types.

The browser application artifact changes from 841,805 B raw / 227,609 B gzip
to 842,345 B raw / 227,736 B gzip (+540 B raw / +127 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,683 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Canonical Context Projection

`ContextResourcePresenter` now composes the canonical context-tab projection,
derives the active publication, candidate, project-PDF, private-Library PDF, or
shared-reference PDF tab, and presents that resource through the same bounded
Lit authority. `WorkspaceApp` retains canonical context transitions, layout
restoration, PDF loading, viewer projection, and citation availability.

This checkpoint reduces `src/client/app.ts` from 2,026 to 2,014 lines (-12) and
grows the context-resource presenter from 583 to 618 lines (+35). Runtime source
across those two files increases by 23 lines while deleting the coordinator's
separate tab-strip assembly and resource-presentation path. Focused coverage
exercises canonical tab delegation, active-resource derivation, existing
resource presentation, application contracts, and strict types.

The browser application artifact changes from 842,345 B raw / 227,736 B gzip
to 842,587 B raw / 227,858 B gzip (+242 B raw / +122 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,684 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Workspace Snapshot Transport Boundary

A small typed workspace-snapshot client now owns access-revocation status
handling, response parsing, canonical domain validation, and optional Yjs
anchor reprojection. The same parser validates mutation snapshots without
introducing a second schema. `WorkspaceApp` retains online/offline fallback,
snapshot application, UI bootstrap, collaboration transitions, and error
presentation.

This checkpoint reduces `src/client/app.ts` from 2,014 to 2,004 lines (-10) and
adds a 27-line transport boundary. Runtime source across those two files
increases by 17 lines while isolating fetch and validation policy behind one
tested function. Focused coverage exercises all access-revocation statuses,
generic transport failure, invalid payloads, canonical snapshots, affected
application contracts, and strict types.

The browser application artifact changes from 842,587 B raw / 227,858 B gzip
to 842,648 B raw / 227,878 B gzip (+61 B raw / +20 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,689 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Linked Reference Catalog

`ContextResourcePresenter` now owns linked-reference PDF catalog loading,
response validation, storage, and authorization projection. Route lookup,
context labels, active-PDF selection, and shared-reference presentation consume
the same presenter-owned catalog. `WorkspaceApp` retains refresh timing,
context reconciliation, PDF loading, and downstream rendering consequences.

This checkpoint reduces `src/client/app.ts` from 2,004 to 1,994 lines (-10) and
grows the context-resource presenter from 618 to 637 lines (+19). Runtime source
across those two files increases by nine lines while deleting the coordinator's
duplicate catalog field and request/validation policy. Focused coverage
exercises successful, invalid, and absent-project catalog loading, existing
authorization and resource presentation, application contracts, and strict
types.

The browser application artifact changes from 842,648 B raw / 227,878 B gzip
to 842,968 B raw / 227,865 B gzip (+320 B raw / -13 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,690 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Canonical Library Loading

`ReferenceLibraryWorkspace` now owns archive-aware canonical Library fetch,
response validation, and the single browser Library snapshot projection used
by its child components and cross-feature consumers. `WorkspaceApp` retains
refresh timing, context reconciliation, linked-PDF refresh, viewer effects,
routing, and notification policy through a derived read-only snapshot accessor.

This checkpoint reduces `src/client/app.ts` from 1,994 to 1,986 lines (-8) and
grows the composed Library workspace from 286 to 310 lines (+24). Runtime source
across those two files increases by 16 lines while deleting the coordinator's
duplicate Library field and request/validation policy. Focused coverage
exercises default and archive-aware loads, invalid responses, snapshot
projection from both loading and presentation, existing composition,
application contracts, and strict types.

The browser application artifact changes from 842,968 B raw / 227,865 B gzip
to 843,175 B raw / 227,879 B gzip (+207 B raw / +14 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,691 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Context Presentation Capture

`ContextResourcePresenter` now captures fixed-tab or resource-panel scroll and,
for the rendered PDF, supplied viewer page and focused-annotation state into the
canonical research context. `WorkspaceApp` retains capture timing, viewer
authority, canonical context transitions, routing, and persistence.

This checkpoint reduces `src/client/app.ts` from 1,986 to 1,975 lines (-11) and
grows the context-resource presenter from 637 to 659 lines (+22). Runtime source
across those two files increases by 11 lines while deleting the coordinator's
presentation-owned tab and panel inspection policy. Focused coverage exercises
fixed-tab scroll, resource scroll, PDF page and focused annotation capture,
existing presentation, application contracts, and strict types.

The browser application artifact changes from 843,175 B raw / 227,879 B gzip
to 843,313 B raw / 227,968 B gzip (+138 B raw / +89 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,692 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Standalone Library Routes

`ReferenceLibraryWorkspace` now restores standalone Library routes through its
owned canonical snapshot, focused-reference workflow, and artifact lookup. Its
typed effects request Library activation, canonical URL repair, missing-PDF
notice presentation, or private-PDF opening. `WorkspaceApp` retains context
transitions, history mutation, viewer navigation, and global toast policy.

This checkpoint reduces `src/client/app.ts` from 1,975 to 1,964 lines (-11) and
grows the composed Library workspace from 310 to 328 lines (+18). Runtime source
across those two files increases by seven lines while deleting the coordinator's
Library-specific reference and artifact lookup branches. Focused coverage
exercises reference restoration, PDF restoration with page forwarding, missing
references and artifacts, existing Library composition, application contracts,
and strict types.

The browser application artifact changes from 843,313 B raw / 227,968 B gzip
to 843,512 B raw / 228,072 B gzip (+199 B raw / +104 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,693 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Library Entry Focus

`ReferenceLibraryWorkspace` now owns direct-entry availability checks,
archive-visibility recovery, canonical refresh requests, focused-reference
navigation, and missing-reference feedback. `WorkspaceApp` retains Library
activation and pushes a canonical direct-entry URL only after successful focus.

This checkpoint reduces `src/client/app.ts` from 1,964 to 1,950 lines (-14) and
grows the composed Library workspace from 328 to 337 lines (+9). Runtime source
across those two files decreases by five lines while deleting the coordinator's
Library snapshot inspection, archive recovery, focus, and feedback branches.
Focused coverage exercises archived recovery, successful focus, missing-source
feedback, existing Library composition, application contracts, and strict
types.

The browser application artifact changes from 843,512 B raw / 228,072 B gzip
to 843,577 B raw / 228,067 B gzip (+65 B raw / -5 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,411 B raw / 23,373 B
gzip, 18, and 150.

Full native CI passes all 1,694 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Preview Input Composition

`WorkspacePreview` now derives publication composition, active-file preview,
rendered fallback source, and source-map inputs from canonical project files,
snapshot pins, and active-file identity before invoking its existing Markdown
renderer. `WorkspaceApp` retains canonical Yjs/file authority, manuscript-map
and export projection, knowledge-graph refresh, and navigation consequences.

This checkpoint reduces `src/client/app.ts` from 1,950 to 1,924 lines (-26) and
grows the workspace Preview from 301 to 354 lines (+53). Runtime source across
those two files increases by 27 lines while deleting the coordinator's preview
input type, composition method, and preparation method. Focused coverage
exercises canonical publication composition, active-file preview derivation,
live file content, existing rendering, application contracts, and strict types.

The browser application artifact changes from 843,577 B raw / 228,067 B gzip
to 843,753 B raw / 228,130 B gzip (+176 B raw / +63 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,695 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Preview Sibling Projection

`WorkspacePreview` now synchronizes its file-mode label, diagnostics or
unavailable summary, and active source map into the bounded Preview status and
source-sync siblings from the same render outcome. `WorkspaceApp` retains source
navigation binding, export statistics, manuscript-map projection, knowledge-
graph refresh, and cross-feature transitions.

This checkpoint reduces `src/client/app.ts` from 1,924 to 1,918 lines (-6) and
grows the workspace Preview from 354 to 375 lines (+21). Runtime source across
those two files increases by 15 lines while deleting four coordinator-side
Preview presentation effects and their unavailable branch. Focused coverage
exercises successful outcome delegation, existing rendering and failure paths,
application contracts, and strict types.

The browser application artifact changes from 843,753 B raw / 228,130 B gzip
to 843,889 B raw / 228,170 B gzip (+136 B raw / +40 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,695 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Active Project File Identity

`ProjectFileDialog` now owns active-file identity, entry-file fallback,
hidden-file selection eligibility, duplicate-selection rejection, and the
existing tree/menu/completion projection. `WorkspaceApp` reads that identity
and retains active Y.Text binding, editor selection, presence, Preview, routing,
model availability, and canonical snapshot authority.

This checkpoint reduces `src/client/app.ts` from 1,918 to 1,914 lines (-4) and
grows the project-file dialog from 410 to 432 lines (+22). Runtime source across
those two files increases by 18 lines while deleting the coordinator's mutable
active-file ID field and duplicated fallback and eligibility branches. Focused
coverage exercises entry fallback, valid selection, duplicate rejection,
removed-file recovery, existing file projection, application contracts, and
strict types.

The browser application artifact changes from 843,889 B raw / 228,170 B gzip
to 844,198 B raw / 228,245 B gzip (+309 B raw / +75 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,696 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Active Project File Actions

`ProjectFileDialog` now resolves its canonical active file and requested folder
for create/rename dialogs, relative image insertion, and supporting-file
deletion. It rejects entry-file deletion locally. `WorkspaceApp` retains only
the pre-dialog collaborative include-target capture plus canonical snapshot
application, active Y.Text/editor binding, Preview, routing, and notifications.

This checkpoint reduces `src/client/app.ts` from 1,914 to 1,898 lines (-16) and
grows the project-file dialog from 432 to 453 lines (+21). Runtime source across
those two files increases by five lines while removing three coordinator
callbacks and its active-resource dialog and deletion lookup methods. Focused
coverage exercises entry-file deletion rejection, component-owned dialog
routing, active-file image projection, existing workflow routing, application
contracts, and strict types.

The browser application artifact changes from 844,198 B raw / 228,245 B gzip
to 844,268 B raw / 229,026 B gzip (+70 B raw / +781 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,696 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Writing Guide Project Projection

`ManuscriptMapPanel` now derives the Writing Guide's composed source plus its
research-diary, research-question, and reviewer-response sibling projections
from one canonical snapshot and visible project-file set. `WorkspaceApp`
retains workflow navigation and file creation, Preview outcomes, rail and URL
coordination, and file-qualified editor focus.

This checkpoint reduces `src/client/app.ts` from 1,898 to 1,890 lines (-8) and
grows the manuscript-map owner from 154 to 188 lines (+34). Runtime source
across those two files increases by 26 lines while deleting the coordinator's
guide-specific composition fallback, three file lookups, and workflow-data
adaptation imports. Focused coverage exercises canonical composition and all
three sibling projections, existing map rendering and navigation, application
contracts, and strict types.

The browser application artifact changes from 844,268 B raw / 229,026 B gzip
to 844,510 B raw / 229,023 B gzip (+242 B raw / -3 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,697 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Writing Guide Range Translation

`ManuscriptMapPanel` now retains the composition source map it already derives
for the Writing Guide and translates selected composed ranges into
file-qualified authored ranges. `WorkspaceApp` receives that typed navigation
target and retains only file selection, editor focus, and caret application.

This checkpoint reduces `src/client/app.ts` from 1,890 to 1,870 lines (-20) and
grows the manuscript-map owner from 188 to 200 lines (+12). Runtime source
across those two files decreases by eight lines while deleting a second
`composeProject` call, its source-span translation branches, and two coordinator
imports. Focused coverage exercises mapped and unmapped selection, existing map
projection and navigation, application contracts, and strict types.

The browser application artifact changes from 844,510 B raw / 229,023 B gzip
to 844,519 B raw / 228,984 B gzip (+9 B raw / -39 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,697 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Valibot Adoption: Offline Workspace Records

The offline persistence authority now infers its stored-record type from one
Valibot schema that validates the exact schema version, required fields,
ArrayBuffer state payloads, and existing 16 MiB bounds. Identity and workspace
matching, workspace snapshot validation, Yjs decoding, anchor reprojection, and
corrupt-record eviction remain explicit policy.

This checkpoint reduces `src/client/offline-workspace.ts` from 243 to 230 lines
(-13). It deletes the parallel record interface and 20-condition structural
predicate while preserving all existing malformed, mismatched, boundary-size,
copy-isolation, restoration, and IndexedDB cases. Affected coverage passes 16
tests alongside strict types.

The browser application artifact changes from 844,519 B raw / 228,984 B gzip
to 844,553 B raw / 229,024 B gzip (+34 B raw / +40 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150; Valibot was already pinned and shipped in the
browser application.

Full native CI passes all 1,697 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Evidence Graph Derivation

`ProjectMapWorkspace` now derives its knowledge graph from the resolved
canonical workspace, current composed manuscript, and bibliography before
projecting it to its existing map and typed-connection children. `WorkspaceApp`
retains Yjs anchor resolution, canonical snapshot authority, and resource
navigation effects.

This checkpoint reduces `src/client/app.ts` from 1,870 to 1,863 lines (-7) and
grows the project-map workspace from 182 to 188 lines (+6). Runtime source
across those files decreases by one line while removing the coordinator's
knowledge-domain import and graph-construction object. Focused coverage
exercises canonical graph derivation, existing graph fan-out, search,
navigation, application contracts, and strict types.

The browser application artifact changes from 844,553 B raw / 229,024 B gzip
to 844,605 B raw / 229,036 B gzip (+52 B raw / +12 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,698 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Responsive Preview Sync

`PreviewSyncControls` now derives whether explicit or automatic source-to-
Preview synchronization is available and chooses the centered versus selected
source offset before resolving it through the current composition map.
`WorkspaceApp` supplies active-file, Preview-context, and layout inputs and
retains the resulting Preview DOM navigation.

This checkpoint reduces `src/client/app.ts` from 1,863 to 1,856 lines (-7) and
grows the Preview synchronization owner from 151 to 157 lines (+6). Runtime
source across those files decreases by one line while deleting the
coordinator's media-query eligibility helper and source-offset branch. Focused
coverage exercises explicit, wide split automatic, inactive-context, compact-
layout, centered, selected, existing source-map, listener, application-contract,
and strict-type behavior.

The browser application artifact changes from 844,605 B raw / 229,036 B gzip
to 844,654 B raw / 229,069 B gzip (+49 B raw / +33 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,698 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Active Context Resource

`ContextResourcePresenter` now retains the active resource tab it already
derives while composing each canonical context presentation. Layout, citation,
PDF, and assistant coordinator effects read that bounded presentation result
instead of searching the canonical tab collection independently at twelve call
sites.

This checkpoint reduces `src/client/app.ts` from 1,856 to 1,849 lines (-7) and
grows the context-resource presenter from 659 to 665 lines (+6). Runtime source
across those files decreases by one line while deleting the coordinator's
resource-tab type import and repeated derived-state helper. Focused coverage
exercises fixed and resource active states, existing context composition,
application contracts, and strict types.

The browser application artifact changes from 844,654 B raw / 229,069 B gzip
to 844,976 B raw / 229,062 B gzip (+322 B raw / -7 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,698 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Coordinator Pass-Through Removal

`WorkspaceApp` now calls the existing connection-status, project-history,
context-tab, workspace-layout, and LaTeX-import owners directly and reads the
collaboration session's stable state directly. Six one-purpose coordinator
methods that added neither policy nor adaptation are removed.

This checkpoint reduces `src/client/app.ts` from 1,849 to 1,825 lines (-24)
without adding runtime source elsewhere. Full affected coverage passes all
1,698 unit tests alongside formatting, lint, application contracts, and strict
types. The first sandboxed coverage attempt reached one unrelated loopback
`listen EPERM`; the normal loopback-enabled rerun passed.

The browser application artifact changes from 844,976 B raw / 229,062 B gzip
to 845,115 B raw / 229,025 B gzip (+139 B raw / -37 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,698 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Active Private PDF Identity

`ContextResourcePresenter` now retains the active private-Library PDF artifact
it already resolves while composing canonical resource presentation. Page-route
updates, PDF selection capture, and page-local saved-markup projection reuse
that bounded result instead of making `WorkspaceApp` search the Library catalog
again.

This checkpoint reduces `src/client/app.ts` from 1,825 to 1,816 lines (-9) and
grows the context-resource presenter from 665 to 671 lines (+6). Runtime source
across those files decreases by three lines while deleting the coordinator's
active-artifact lookup helper and duplicate selection lookup. Focused coverage
exercises private, project, and shared-reference identity retention plus
page-local markup projection, existing context presentation, application
contracts, and strict types.

The browser application artifact changes from 845,115 B raw / 229,025 B gzip
to 845,135 B raw / 229,027 B gzip (+20 B raw / +2 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,698 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Coordinator Pass-Through Removal: Editors and Completion

`WorkspaceApp` now projects collaboration editability directly to its two
editor controls, passes refreshed template options directly to the save dialog,
and applies selected include completions through the existing canonical source
mutation. Three one-purpose methods that added neither policy nor adaptation
are removed.

This checkpoint reduces `src/client/app.ts` from 1,816 to 1,805 lines (-11)
without adding runtime source elsewhere. Affected checks pass formatting, lint,
application contracts, strict types, and all 1,698 unit/coverage tests.

The browser application artifact changes from 845,135 B raw / 229,027 B gzip
to 845,228 B raw / 229,021 B gzip (+93 B raw / -6 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,698 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Shared PDF Rectangle Overlap

Project evidence erasure now reuses the existing reference-library rectangle-
set overlap helper instead of carrying a second equivalent pairwise geometry
implementation in `WorkspaceApp`. The shared domain helper already has focused
coverage for overlap, separation, and touching-edge behavior.

This checkpoint reduces `src/client/app.ts` from 1,805 to 1,799 lines (-6)
without adding runtime source elsewhere and removes the coordinator's direct
selection-rectangle type dependency. The focused reference-library suite passes
all 21 cases; affected checks pass formatting, lint, application contracts,
strict types, and all 1,698 unit/coverage tests.

The browser application artifact changes from 845,228 B raw / 229,021 B gzip
to 845,113 B raw / 228,968 B gzip (-115 B raw / -53 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,698 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Live Project Files

`ProjectFileDialog` now materializes its already-owned visible file collection
with either canonical snapshot content or coordinator-resolved live Yjs content.
Preview, manuscript-map, and collaborator-selection consumers reuse that one
projection, including the optimistic hidden-file set, while `WorkspaceApp`
retains the Yjs document and collaboration-readiness authority.

This checkpoint reduces `src/client/app.ts` from 1,799 to 1,792 lines (-7) and
grows the project-file owner from 452 to 468 lines (+16). Runtime source across
those files increases by nine lines while deleting the coordinator's duplicate
hidden-file filters and live-file mapper. Focused coverage passes all 17
project-file cases, including snapshot/live content, retained canonical input,
and optimistic hidden-file projection, alongside application contracts and
strict types.

The browser application artifact changes from 845,113 B raw / 228,968 B gzip
to 845,211 B raw / 229,012 B gzip (+98 B raw / +44 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,699 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Erasure Overlaps

`ProjectAnnotationForm` now filters canonical saved annotation strokes to the
active PDF and captured page and classifies their rectangle-set overlap. The
coordinator supplies the capture and retains viewer clearing, persistence,
canonical refresh, and notification effects.

This checkpoint reduces `src/client/app.ts` from 1,792 to 1,774 lines (-18) and
grows the project-annotation owner from 431 to 447 lines (+16). Runtime source
across those files decreases by two lines while removing the coordinator's
overlap result type, geometry import, and annotation/fragment traversal.
Focused coverage passes all nine project-annotation cases, including matching
and unrelated PDF, page, and rectangle states, alongside application contracts
and strict types.

The browser application artifact changes from 845,211 B raw / 229,012 B gzip
to 845,269 B raw / 229,015 B gzip (+58 B raw / +3 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,700 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Erasure Workflow

`ProjectAnnotationForm` now owns empty-erasure and completed-erasure status,
orders the matched stroke removals, and stops on the first rejected mutation.
The typed workflow binding delegates each actual fragment mutation to the
coordinator, which retains canonical refresh, viewer draft clearing, and global
notification effects.

This checkpoint reduces `src/client/app.ts` from 1,774 to 1,767 lines (-7) and
grows the project-annotation owner from 447 to 462 lines (+15). Runtime source
across those files increases by eight lines while replacing the coordinator's
erasure branches, loop, and pluralization with one typed result. Focused
coverage passes all nine project-annotation cases, including empty, unbound,
and successful erasure outcomes, alongside application contracts and strict
types.

The browser application artifact changes from 845,269 B raw / 229,015 B gzip
to 845,392 B raw / 229,060 B gzip (+123 B raw / +45 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,700 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Active PDF Loading

`ContextResourcePresenter` now derives authorized project, private-Library, and
linked-reference PDF loads from its retained canonical presentation inputs and
applies them through a narrow `PdfEvidenceViewer` binding. It synchronizes
annotations and private highlights, selects the project annotation form, rejects
stale completions, retains rendered context and project-PDF identity, restores
resource scroll, and presents active-resource failures. `WorkspaceApp` retains
load timing, canonical context and snapshot authority, routing, page gestures,
selection persistence, and global notification effects.

This checkpoint reduces `src/client/app.ts` from 1,767 to 1,713 lines (-54) and
grows the context-resource presenter from 671 to 748 lines (+77). Runtime source
across those files increases by 23 lines while deleting two coordinator loading
methods, two rendered-PDF state fields, the active-load imports, repeated viewer
projection, and the private-highlight return protocol. Focused context and pure
load-projection coverage passes 27 cases, including project loading, cached
reuse, bound context capture, rendered identity, and active-resource failure,
alongside application contracts and strict types.

The browser application artifact changes from 845,392 B raw / 229,060 B gzip
to 846,181 B raw / 229,178 B gzip (+789 B raw / +118 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,702 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Selection Routing

`ContextResourcePresenter` now routes viewer selection captures from its
retained active and rendered PDF identities. Private-Library selections open
the private-highlight composer; project-PDF selections synchronize the project
annotation form and delegate persistence through the existing narrow viewer
binding. `WorkspaceApp` retains the actual project mutation, refresh, viewer
draft clearing, and notification effects.

This checkpoint reduces `src/client/app.ts` from 1,713 to 1,698 lines (-15) and
grows the context-resource presenter from 748 to 763 lines (+15). Runtime source
across those files is unchanged while deleting the coordinator's active-tab,
artifact, rendered-id, and form-routing branches. Focused context coverage
passes all 23 cases, including private and project selection routing, alongside
application contracts and strict types.

The browser application artifact changes from 846,181 B raw / 229,178 B gzip
to 846,264 B raw / 229,215 B gzip (+83 B raw / +37 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,702 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Page Changes

`ContextResourcePresenter` now projects each viewer page change into page-local
private markup, canonical PDF context, and the retained private-artifact route
identity. `WorkspaceApp` retains canonical state assignment plus workspace-route
and standalone browser-history mutation.

This checkpoint reduces `src/client/app.ts` from 1,698 to 1,694 lines (-4) and
grows the context-resource presenter from 763 to 776 lines (+13). Runtime source
across those files increases by nine lines while replacing the coordinator's
active-tab, Library-snapshot, viewer-page, and artifact inspection with one
typed presentation result and closing the obsolete public artifact and page-
rendering seams. Focused coverage passes all 24 presenter cases,
including canonical page projection, private route identity, page-local markup,
and inactive-resource behavior, alongside application contracts and strict
types.

The browser application artifact changes from 846,264 B raw / 229,215 B gzip
to 846,294 B raw / 228,523 B gzip (+30 B raw / -692 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,703 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project Highlight Capture

`ProjectAnnotationForm` now owns the full paint-versus-erase capture workflow:
same-PDF/page overlap classification, ordered erase routing, highlight creation
or extension, and no-match and completion presentation. Its typed workflow
binding returns only viewer-draft clearing, canonical refresh, and notification
effects. `ContextResourcePresenter` supplies its retained canonical annotations
and rendered project-PDF identity; `WorkspaceApp` retains those returned global
effects.

This checkpoint reduces `src/client/app.ts` from 1,694 to 1,675 lines (-19),
reduces the context-resource presenter from 776 to 772 lines (-4), and grows the
project-annotation owner from 462 to 485 lines (+23). Runtime source across the
three files is unchanged while deleting the coordinator's duplicate selection,
overlap, save, and erase workflow plus the presenter's callback and rendered-id
getter. Focused coverage passes all 10 project-annotation cases and 24 context-
resource cases, including empty and matched erasure plus paint extension and
typed completion effects, alongside application contracts and strict types.

The browser application artifact changes from 846,294 B raw / 228,523 B gzip
to 846,261 B raw / 228,550 B gzip (-33 B raw / +27 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,704 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project Highlight Interaction

`ProjectAnnotationForm` now commits toolbar tool changes locally, resolves
viewer-highlight activation to edit/reveal or erase behavior, and completes
undo state and status after delegated removal. `ContextResourcePresenter`
routes viewer activation with its retained canonical annotations. `WorkspaceApp`
retains viewer tool projection, evidence reveal, fragment mutation, canonical
refresh, and notification effects through the existing typed binding.

This checkpoint reduces `src/client/app.ts` from 1,675 to 1,653 lines (-22),
grows the context-resource presenter from 772 to 777 lines (+5), and grows the
project-annotation owner from 485 to 504 lines (+19). Runtime source across the
three files increases by two lines while deleting the coordinator's tool-state,
highlight-activation, and undo methods plus the form's obsolete public selected-
tool getter. Focused coverage passes all 11 project-annotation cases and 24
context-resource cases, including paint reveal, tap erase, toolbar state, and
completed undo effects, alongside application contracts and strict types.

The browser application artifact changes from 846,261 B raw / 228,550 B gzip
to 846,550 B raw / 228,571 B gzip (+289 B raw / +21 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,705 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Citation Resource Resolution

`ContextResourcePresenter` now resolves citation keys case-insensitively against
its canonical project catalog, chooses a sole linked project PDF for supported
page locators, falls back to publication context, and returns grouped or missing
feedback. `WorkspaceApp` retains toast presentation and the typed navigation
effects already delegated through the presenter.

This checkpoint reduces `src/client/app.ts` from 1,653 to 1,635 lines (-18) and
grows the context-resource presenter from 777 to 792 lines (+15). Runtime source
across those files decreases by three lines while deleting the coordinator's
citation catalog search, locator parsing, link cardinality, and navigation
branches. Focused coverage passes all 24 context-resource cases, including
case-insensitive lookup, grouped and missing feedback, sole-linked-PDF page
routing, publication fallback, application contracts, and strict types.

The browser application artifact changes from 846,550 B raw / 228,571 B gzip
to 846,659 B raw / 228,688 B gzip (+109 B raw / +117 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,705 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Evidence Fragment Deletion

`ProjectEvidencePanel` now completes its already-owned highlight-fragment
deletion workflow, including annotation-deleted projection and optional notice
intent. `WorkspaceApp` retains canonical refresh, annotation-composer cleanup,
and toast effects through one typed completion callback; the annotation form
delegates removals directly to the evidence owner.

This checkpoint reduces `src/client/app.ts` from 1,635 to 1,631 lines (-4) and
grows the project-evidence owner from 559 to 566 lines (+7). Runtime source
across those files increases by three lines while deleting the coordinator's
fragment-removal method and the panel's remove-intent pass-through. Focused
coverage passes all 18 project-evidence cases and 60 related tests, including
card removal, annotation-deleted completion, mutation sequencing, application
contracts, and strict types.

The browser application artifact changes from 846,659 B raw / 228,688 B gzip
to 846,678 B raw / 228,674 B gzip (+19 B raw / -14 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,705 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project Resource Routing

`ContextResourcePresenter` now resolves project-map publication, candidate, and
PDF navigation through its existing canonical route lookup. It also resolves
annotation edit/open intents to the retained canonical annotation and owning
project PDF, synchronizing the annotation form only for explicit edit intents.
`WorkspaceApp` retains canonical context transitions and the typed open effects.

This checkpoint reduces `src/client/app.ts` from 1,631 to 1,607 lines (-24) and
grows the context-resource presenter from 792 to 802 lines (+10). Runtime source
across those files decreases by 14 lines while deleting four coordinator catalog
search branches and both annotation-navigation methods. Focused coverage passes
all 24 context-resource cases and 26 related tests, including publication,
candidate, PDF, annotation-open, annotation-edit, application contracts, and
strict types.

The browser application artifact changes from 846,678 B raw / 228,674 B gzip
to 846,829 B raw / 228,652 B gzip (+151 B raw / -22 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,705 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Simplification: Context Transitions

`WorkspaceApp` now presents fixed-tab, publication, candidate, and prepared-PDF
context transitions through one coordinator-local helper. Canonical context
state, surface visibility, focused-tab behavior, PDF loading policy, and route
history remain under the same coordinator authority without introducing a new
component contract.

This checkpoint reduces `src/client/app.ts` from 1,607 to 1,603 lines (-4),
which is also a four-line runtime-source reduction. The native quality gate
continues to cover the fixed-resource and PDF navigation paths through all
1,705 unit/coverage tests, 121 Workers-runtime tests, and 74 browser tests.

The browser application artifact changes from 846,829 B raw / 228,652 B gzip
to 846,614 B raw / 228,680 B gzip (-215 B raw / +28 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

## Continued Lit Ownership: Publication Paper Routing

`ContextResourcePresenter` now dispatches the publication panel's typed
project-PDF, private-Library, and shared-reference paper choices through its
existing canonical route coordinator. `WorkspaceApp` retains tab reconciliation,
context transitions, history mutation, load timing, and the one panel binding.

This checkpoint reduces `src/client/app.ts` from 1,603 to 1,590 lines (-13) and
grows the context-resource presenter from 802 to 810 lines (+8). Runtime source
across those files decreases by five lines while deleting the coordinator's
three-way paper dispatch. Focused coverage passes all 24 context-resource cases,
including every paper scope, existing resource restoration, annotations,
citations, application contracts, and strict types.

The browser application artifact changes from 846,614 B raw / 228,680 B gzip
to 846,738 B raw / 228,691 B gzip (+124 B raw / +11 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,705 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Saved Highlight Navigation

`ContextResourcePresenter` now resolves saved private highlights to their
canonical Library artifact, awaits the existing PDF-open effect, and completes
the presenter-owned inspector status. This removes the dedicated highlight-open
callback and coordinator method while preserving history, load, and canonical
Library authority outside the component.

This checkpoint reduces `src/client/app.ts` from 1,590 to 1,582 lines (-8) and
grows the context-resource presenter from 810 to 817 lines (+7). Runtime source
across those files decreases by one line while replacing the callback round trip
with one presenter-owned workflow. Focused coverage passes all 24
context-resource cases, including artifact lookup, awaited PDF navigation,
inspector status, sibling events, application contracts, and strict types.

The browser application artifact changes from 846,738 B raw / 228,691 B gzip
to 846,812 B raw / 228,687 B gzip (+74 B raw / -4 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,411 B raw / 23,373 B
gzip, 18, and 150.

Full native CI passes all 1,705 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Template Save Handoff

`WorkspaceSettingsPanel` now dismisses itself and hands its current project
title directly to `ProjectTemplateSaveDialog`. The save dialog owns the supplied
catalog-loader's loading-to-ready lifecycle and retryable load-error
presentation. `WorkspaceApp` retains canonical catalog refresh, replacement
option synchronization, completion refresh, and global notices.

This checkpoint reduces `src/client/app.ts` from 1,582 to 1,571 lines (-11),
grows the template-save dialog from 221 to 231 lines (+10), and grows workspace
settings from 423 to 427 lines (+4). Runtime source across those files increases
by three lines while deleting the coordinator's modal, title, and error
choreography. Focused coverage passes all 30 template-save, workspace-settings,
and application-contract cases, including successful loading, retryable errors,
dismissal, title handoff, lifecycle requests, and strict types.

The browser application artifact changes from 846,812 B raw / 228,687 B gzip
to 846,726 B raw / 228,675 B gzip (-86 B raw / -12 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,706 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: GitHub Import Open

`GitHubImportPanel.open()` now starts its already-owned connection refresh after
resetting preview state, opening the modal, and focusing the title. Both the New
project import choice and OAuth return path call that complete lifecycle
directly. `WorkspaceApp` retains URL-result recognition and history cleanup.

This checkpoint reduces `src/client/app.ts` from 1,571 to 1,566 lines (-5) and
grows the GitHub import owner from 544 to 545 lines (+1). Runtime source across
those files decreases by four lines while deleting the coordinator's paired
open-and-refresh shim. Focused coverage passes all 24 GitHub-import and
application-contract cases, including modal lifecycle, automatic connection
refresh, OAuth return entry, existing requests, and strict types.

The browser application artifact changes from 846,726 B raw / 228,675 B gzip
to 846,713 B raw / 228,661 B gzip (-13 B raw / -14 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,706 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Duplicate PDF Reveal

`ReferenceLibraryWorkspace` now completes duplicate-PDF upload reveal itself:
it enables archived visibility when needed, requests the canonical Library
refresh through its existing callback, reuses its owned filter/list focus, and
presents missing-source feedback. `WorkspaceApp` retains canonical Library load
timing and the global notice outlet without a reveal callback or bounce method.

This checkpoint reduces `src/client/app.ts` from 1,566 to 1,557 lines (-9) and
grows the composed Library workspace from 334 to 342 lines (+8). Runtime source
across those files decreases by one line while deleting the coordinator round
trip. Focused coverage passes all 25 Library-workspace and application-contract
cases, including archived recovery, canonical refresh, focused reveal,
missing-source feedback, sibling outcomes, and strict types.

The browser application artifact changes from 846,713 B raw / 228,661 B gzip
to 846,643 B raw / 228,625 B gzip (-70 B raw / -36 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,706 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Simplification: Passage Linking

`WorkspaceApp` now routes claim and annotation passage linking through one typed
coordinator method. The shared path owns the collaboration-stability gate,
current Yjs-backed authoring selection, resource-specific feedback, revision
payload, and final dispatch while preserving the existing claim and evidence
Lit owners' mutation workflows.

This checkpoint reduces `src/client/app.ts` from 1,557 to 1,536 lines (-21),
which is also a 21-line runtime-source reduction. Focused coverage passes all 46
application-contract, claim-list, and project-evidence cases; the browser suite
continues to cover both passage-link workflows and strict types remain green.

The browser application artifact changes from 846,643 B raw / 228,625 B gzip
to 846,443 B raw / 228,615 B gzip (-200 B raw / -10 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,706 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project Note Routing

`ContextResourcePresenter` now resolves project-map note selections against
active canonical project research shares, compacts bounded notice text, and
emits it through the existing application notice outlet. This completes the
presenter's project-map catalog boundary alongside publication, PDF, candidate,
and annotation routing.

This checkpoint reduces `src/client/app.ts` from 1,536 to 1,527 lines (-9) and
grows the context-resource presenter from 817 to 831 lines (+14). Runtime source
across those files increases by five lines while deleting the coordinator's
note catalog search and formatting helper. Focused coverage passes all 40
context-resource and application-contract cases, including active-share lookup,
whitespace compaction, truncation, missing notes, routing, and strict types.

The browser application artifact changes from 846,443 B raw / 228,615 B gzip
to 846,580 B raw / 228,607 B gzip (+137 B raw / -8 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,706 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Active Citation Projection

`ContextResourcePresenter` now derives publication citation readiness and maps
explicit active-publication or sole-linked project-PDF citation intents to the
canonical citation key and optional page locator. `WorkspaceApp` retains the
remembered Yjs-relative authoring target, syntax creation, document transaction,
focus, and completion notice behind one typed insertion effect.

This checkpoint reduces `src/client/app.ts` from 1,527 to 1,504 lines (-23) and
grows the context-resource presenter from 831 to 854 lines (+23), leaving runtime
source across those files unchanged. Focused coverage passes all 58
context-resource, publication-context, annotation-form, and application-contract
cases, including readiness, publication insertion, sole-linked PDF page
locators, canonical routing, and strict types.

The browser application artifact changes from 846,580 B raw / 228,607 B gzip
to 846,821 B raw / 228,573 B gzip (+241 B raw / -34 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,706 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Simplification: Assistant Passages

`WorkspaceApp` now derives raw insertion targets and scope-expanded assistant
passages through one parameterized projection over the active file and resolved
Yjs-relative authoring target. Availability, target preview, and generation
input no longer repeat active-file, selection, source, and excerpt assembly.

This checkpoint reduces `src/client/app.ts` from 1,504 to 1,496 lines (-8),
which is also an eight-line runtime-source reduction. Focused coverage passes
all 45 assistant-presenter, assistant-operation, and application-contract cases;
the full browser workflow continues to exercise selection and scope-expanded
generation targets, and strict types remain green.

The browser application artifact changes from 846,821 B raw / 228,573 B gzip
to 846,806 B raw / 228,595 B gzip (-15 B raw / +22 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,706 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Template Save Notices

`ProjectTemplateSaveDialog` now derives the create-or-replace success notice
from its validated saved summary and local replacement choice. Its completion
binding supplies that ready-to-display message instead of exporting a result
shape solely for `WorkspaceApp` to reconstruct dialog-owned wording.

This checkpoint reduces `src/client/app.ts` from 1,496 to 1,492 lines (-4) and
the template-save dialog from 231 to 230 lines (-1), for a five-line runtime
source reduction. Focused coverage passes all 23 template-save and application-
contract cases, including create and replacement notices, and strict types
remain green.

The browser application artifact changes from 846,806 B raw / 228,595 B gzip
to 846,743 B raw / 228,541 B gzip (-63 B raw / -54 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,706 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Annotation Completion Effects

`ProjectAnnotationForm` now projects both captured-stroke and saved-note
follow-up through one typed completion effect. A note save requests canonical
resource refresh plus either a notice or manuscript link directly, removing the
exported save-result shape and `WorkspaceApp` mapper while leaving refresh,
viewer, Yjs link, and toast execution in the coordinator.

This checkpoint reduces `src/client/app.ts` from 1,492 to 1,485 lines (-7) and
the project-annotation form from 504 to 500 lines (-4), for an eleven-line
runtime source reduction. Focused coverage passes all 45 annotation-form,
project-evidence, and application-contract cases, including plain saves, linked
saves, capture effects, refresh sequencing, and strict types.

The browser application artifact changes from 846,743 B raw / 228,541 B gzip
to 846,734 B raw / 228,537 B gzip (-9 B raw / -4 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,411 B raw / 23,373 B
gzip, 18, and 150.

Full native CI passes all 1,706 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Simplification: Revision Completion

`WorkspaceApp` now completes collaboration revisions directly at the socket
binding and relies on `#setRevision` for its existing offline-save scheduling.
This removes a one-use forwarding method and a second schedule call for the
same completed revision while retaining revision, editor-status, history,
selection, and candidate refresh behavior.

This checkpoint reduces `src/client/app.ts` from 1,485 to 1,482 lines (-3).
Focused coverage passes all 24 collaboration-socket, collaboration-session,
editor-status, and application-contract cases, and strict types remain green.

The browser application artifact changes from 846,734 B raw / 228,537 B gzip
to 846,705 B raw / 228,519 B gzip (-29 B raw / -18 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,706 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project File Save Commit

`ProjectFileDialog` now applies validated save snapshots through the same
canonical mutation binding already used by uploads, tree mutations, and delayed
deletions. Its save workflow supplies only the submitted mode and path, outcome
notice, and derived stable file identity to `WorkspaceApp`; the dialog also
routes that outcome directly instead of dispatching and catching a private
self-event. Yjs include insertion and active editor selection remain in the
coordinator.

This checkpoint reduces `src/client/app.ts` from 1,482 to 1,476 lines (-6) and
the project-file dialog from 468 to 463 lines (-5), for an eleven-line runtime
source reduction. Focused coverage passes all 41 project-file dialog, action,
tree, and application-contract cases, including canonical snapshot commit,
stable saved-file identity, direct workflow routing, and strict types.

The browser application artifact changes from 846,705 B raw / 228,519 B gzip
to 846,537 B raw / 228,465 B gzip (-168 B raw / -54 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,706 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Simplification: Project File Include State

`WorkspaceApp` now captures and clears the project-file dialog's remembered
Yjs include context directly at its `prepareDialog` and `saved` lifecycle
bindings. Relative-position resolution and collaborative insertion remain in
the dedicated helper, while two one-use state-forwarding methods are removed.

This checkpoint reduces `src/client/app.ts` from 1,476 to 1,471 lines (-5).
Focused coverage passes all 41 project-file dialog, action, source-completion,
and application-contract cases, and strict types remain green. The browser
workflow continues to cover create-and-include behavior.

The browser application artifact changes from 846,537 B raw / 228,465 B gzip
to 846,484 B raw / 228,458 B gzip (-53 B raw / -7 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,706 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Bound PDF Viewer Effects

`ContextResourcePresenter` now applies private-PDF draft clearing, text-
selection mode, and private-markup selection directly through its existing
bounded PDF-viewer capability. This removes two coordinator effects and the
`WorkspaceApp` presentation mapper that only forwarded those local effects to
the same viewer. Canonical context, loading, route history, snapshot, refresh,
and toast authority remain outside the presenter.

This checkpoint reduces `src/client/app.ts` from 1,471 to 1,461 lines (-10)
while growing the context-resource presenter from 854 to 855 lines (+1), for a
nine-line runtime source reduction. Focused coverage passes all 46 context-
resource, PDF-viewer, inspector, and application-contract cases, including
tool choice, private selection, draft cleanup, loading, and strict types.

The browser application artifact changes from 846,484 B raw / 228,458 B gzip
to 846,335 B raw / 228,409 B gzip (-149 B raw / -49 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,706 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Simplification: Bound PDF Page State

`ContextResourcePresenter` now reads the current PDF page directly from its
existing bounded viewer capability. This removes the last page-state callback
from `LibraryPdfCoordinator`; `WorkspaceApp` no longer reflects viewer-local
state back into the Lit owner that already holds the viewer.

This checkpoint reduces `src/client/app.ts` from 1,461 to 1,460 lines (-1) and
the context-resource presenter from 855 to 855 lines, for a one-line runtime
source reduction. Focused coverage passes all 40 context-resource, PDF-viewer,
and application-contract cases, and strict types remain green.

The browser application artifact changes from 846,335 B raw / 228,409 B gzip
to 846,258 B raw / 228,403 B gzip (-77 B raw / -6 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,706 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Simplification: One-Use App Projections

`WorkspaceApp` now keeps PDF page routing at the viewer binding, editor-
presence projection at the editor binding, and preview workspace projection at
the preview outcome that consumes it. This removes three one-use private
methods while retaining route-history, collaborative presence, resolved anchor,
and project-map behavior at their existing authority boundary.

This checkpoint reduces `src/client/app.ts` from 1,460 to 1,452 lines (-8).
Focused coverage passes all 42 application-contract, context-resource, editor-
adapter, and preview-sync cases.

The browser application artifact changes from 846,258 B raw / 228,403 B gzip
to 846,212 B raw / 228,400 B gzip (-46 B raw / -3 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,706 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Resolved Workspace Projection

`ContextResourcePresenter` now projects resolved evidence links, claim links,
comments, and project-map inputs across the Lit owners it already composes.
`WorkspaceApp` retains Yjs anchor resolution, Preview availability and render
timing, bibliography state, and composed manuscript output.

This checkpoint reduces `src/client/app.ts` from 1,452 to 1,449 lines (-3) and
grows the context-resource presenter from 855 to 867 lines (+12). Focused
coverage passes all 46 context-resource, project-map, and application-contract
cases, including resolved passage, comment-count, graph-input, canonical
workspace, and strict-type behavior.

The browser application artifact changes from 846,212 B raw / 228,400 B gzip
to 846,324 B raw / 228,377 B gzip (+112 B raw / -23 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,706 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project Annotation Effects

`ContextResourcePresenter` now binds the project-annotation form's workflow and
applies tool changes and draft clearing through its bounded PDF viewer. It also
routes page citation plus highlight removal and reveal intents to the citation
and evidence owners it already composes. `WorkspaceApp` receives only canonical
refresh, manuscript-link, and notification outcomes.

This checkpoint reduces `src/client/app.ts` from 1,449 to 1,441 lines (-8) and
grows the context-resource presenter from 867 to 885 lines (+18). Focused
coverage passes all 70 context-resource, project-annotation, evidence-panel,
and application-contract cases, including viewer cleanup, tool routing,
citation routing, sibling evidence effects, and strict types.

The browser application artifact changes from 846,324 B raw / 228,377 B gzip
to 846,483 B raw / 228,415 B gzip (+159 B raw / +38 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,707 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project Annotation Intake

`ContextResourcePresenter` now supplies project-annotation intake API
configuration, canonical publication lookup, publication navigation, and notice
routing through its existing viewer and route bindings. `WorkspaceApp` supplies
only the canonical project-resource refresh authority.

This checkpoint reduces `src/client/app.ts` from 1,441 to 1,435 lines (-6) and
grows the context-resource presenter from 885 to 896 lines (+11). Focused
coverage passes all 52 context-resource, project-annotation, and application-
contract cases, including configuration, publication lookup, navigation,
notice, refresh, and strict-type behavior.

The browser application artifact changes from 846,483 B raw / 228,415 B gzip
to 846,690 B raw / 228,444 B gzip (+207 B raw / +29 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,707 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Contract: Canonical PDF Routes

`ContextResourcePresenter` now receives canonical project and Library
snapshots, citation insertion, Library refresh, and notices only through its
route binding. The renamed `LibraryPdfMutationCoordinator` retains only
snapshot acceptance, caret readiness, markup completion, artifact opening, and
API scope, removing five duplicate application bindings.

This checkpoint reduces `src/client/app.ts` from 1,435 to 1,430 lines (-5) and
the context-resource presenter from 896 to 891 lines (-5), for a ten-line
runtime source reduction. Focused coverage passes all 60 context-resource,
private-PDF inspector, annotation-form, and application-contract cases,
including canonical refresh, notice, citation, navigation, mutation, and strict-
type behavior.

The browser application artifact changes from 846,690 B raw / 228,444 B gzip
to 846,609 B raw / 228,429 B gzip (-81 B raw / -15 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,707 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project Map Routes

`ContextResourcePresenter` now configures the project-map workspace and binds
annotation, claim, candidate, note, PDF, and publication routes across the Lit
owners it already composes. `WorkspaceApp` retains only document, project,
people, and Preview-section navigation.

This checkpoint reduces `src/client/app.ts` from 1,430 to 1,423 lines (-7) and
grows the context-resource presenter from 891 to 906 lines (+15). Focused
coverage passes all 53 context-resource, project-map workspace, project-map
presentation, and application-contract cases, including local resource routes,
retained coordinator routes, configuration, and strict types.

The browser application artifact changes from 846,609 B raw / 228,429 B gzip
to 846,566 B raw / 228,474 B gzip (-43 B raw / +45 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,708 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project Evidence Routes

`ContextResourcePresenter` now configures the project-evidence panel and owns
its annotation-form cleanup and selection, annotation edit and PDF routes,
fragment-removal refresh sequencing, and notice dispatch across the Lit owners
it already composes. `WorkspaceApp` retains mutation completion policy,
canonical refresh transport, passage linking, and passage navigation.

This checkpoint reduces `src/client/app.ts` from 1,423 to 1,407 lines (-16) and
grows the context-resource presenter from 906 to 938 lines (+32). Focused
coverage passes all 45 context-resource and project-evidence cases, including
configuration, sibling effects, retained coordinator callbacks, refresh order,
notice dispatch, application contracts, and strict types.

The browser application artifact changes from 846,566 B raw / 228,474 B gzip
to 846,916 B raw / 228,562 B gzip (+350 B raw / +88 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,709 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Claim and Publication Routes

`ContextResourcePresenter` now configures the claim list and publication
list/context panels. It routes claim annotations to project evidence,
publication opening to canonical context, and citation and paper intents among
the Lit owners it already composes. `WorkspaceApp` retains claim/publication
mutation consequences, manuscript-passage effects, Library entry management,
and refresh policy.

This checkpoint reduces `src/client/app.ts` from 1,407 to 1,400 lines (-7) and
grows the context-resource presenter from 938 to 969 lines (+31). Focused
coverage passes all 52 context-resource, claim-list, publication-list, and
publication-context cases, including configuration, sibling routes, retained
coordinator callbacks, application contracts, and strict types.

The browser application artifact changes from 846,916 B raw / 228,562 B gzip
to 847,153 B raw / 228,597 B gzip (+237 B raw / +35 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,710 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Assistant Resource Routes

`AssistantGenerationPresenter` now binds once to canonical candidate,
project-PDF, project snapshot, Library-refresh, assistant-tab, and no-evidence
notice routes supplied by `ContextResourcePresenter`. Its task, result, and
candidate workflow bindings no longer repeat those resource callbacks.
`WorkspaceApp` retains generation consequences, authorized Yjs mutation,
editor selection, model availability, and refresh policy.

This checkpoint reduces `src/client/app.ts` from 1,400 to 1,395 lines (-5),
grows the assistant-generation presenter from 558 to 571 lines (+13), and grows
the context-resource presenter from 969 to 982 lines (+13). Focused coverage
passes all 45 assistant-generation and context-resource cases, including
candidate, PDF, project, Library refresh, tab-focus, notice, application-
contract, and strict-type behavior.

The browser application artifact changes from 847,153 B raw / 228,597 B gzip
to 847,725 B raw / 228,684 B gzip (+572 B raw / +87 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,711 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Assistant Workflow Binding

`AssistantGenerationPresenter` now receives application-owned generation
inputs and consequences through one workflow coordinator. Its candidate,
result, and control wiring no longer maintain separate callback contracts, and
generated-candidate opening plus model-availability refresh each have one
definition in `WorkspaceApp`.

This checkpoint reduces `src/client/app.ts` from 1,395 to 1,392 lines (-3) and
grows the assistant-generation presenter from 571 to 576 lines (+5), for a two-
line runtime source increase while replacing three callback concepts with one.
Focused coverage passes all 45 assistant-generation and context-resource cases,
including candidate decisions, generated candidates, results, controls,
resource routes, application contracts, and strict types.

The browser application artifact changes from 847,725 B raw / 228,684 B gzip
to 847,955 B raw / 228,727 B gzip (+230 B raw / +43 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,711 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Assistant Authoring Sources

`AssistantGenerationPresenter` now binds manuscript text, scoped and insertion
passage resolution, source revision, and collaboration stability once. It
derives generation input, availability, and target presentation internally,
including snapshot readiness from its existing canonical project route.
`WorkspaceApp` no longer owns three assistant-only derivation methods.

This checkpoint reduces `src/client/app.ts` from 1,392 to 1,368 lines (-24) and
grows the assistant-generation presenter from 576 to 616 lines (+40), for a 16-
line runtime source increase while moving the complete reactive authoring
projection into its Lit owner. Focused coverage passes all 46 assistant-
generation and context-resource cases, including manuscript, passage, revision,
stability, snapshot, generation, availability, target, application-contract,
and strict-type behavior.

The browser application artifact changes from 847,955 B raw / 228,727 B gzip
to 848,674 B raw / 228,759 B gzip (+719 B raw / +32 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,712 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Comment Authoring State

`ManuscriptCommentList` now reads one canonical authoring snapshot and owns
collaboration-stability gating, missing-selection gating, action-specific
feedback, and source-revision stamping for create and re-anchor requests.
`WorkspaceApp` retains Yjs selection resolution, revision and collaboration
authority, canonical refresh, passage navigation, and toast presentation.

This checkpoint reduces `src/client/app.ts` from 1,368 to 1,354 lines (-14) and
grows the manuscript-comment owner from 208 to 237 lines (+29), for a 15-line
runtime source increase while deleting the coordinator's two validation and
feedback branches. Focused and affected coverage passes all 41 related cases;
the comment suite now directly covers synchronized, unstable, and missing-
selection authoring inputs, create and re-anchor source revisions, application
contracts, and strict types.

The browser application artifact changes from 848,674 B raw / 228,759 B gzip
to 848,851 B raw / 228,822 B gzip (+177 B raw / +63 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,713 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Canonical Resource Routes

`ContextResourcePresenter` now configures the manuscript-comment, project-
evidence, claim-list, and publication list/context owners and routes their
project refresh, passage linking, passage navigation, mutation feedback, and
notice effects through one canonical application boundary. Child-specific
failure copy stays with the composed resource workflow; `WorkspaceApp` retains
Yjs passage derivation, refresh transport, cross-feature effects, and toast
presentation.

This checkpoint reduces `src/client/app.ts` from 1,354 to 1,338 lines (-16),
removes the manuscript-comment owner from the global element registry, reduces
that registry from 137 to 135 lines and 70 to 69 required elements, and grows
the context-resource presenter from 982 to 1,004 lines (+22). Runtime source
across those three files increases by four lines while deleting four per-panel
mutation callbacks and three repeated passage routes. Focused coverage passes
all 47 context-resource, element-registry, and application-contract cases;
affected guardrails and strict types pass.

The browser application artifact changes from 848,851 B raw / 228,822 B gzip
to 849,239 B raw / 228,823 B gzip (+388 B raw / +1 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,713 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Pending File Includes

`ProjectFileDialog` now retains the one-shot create-and-include continuation
across open, retry, successful save, and cancellation. It invokes that
continuation only after applying the validated workspace snapshot and returns a
derived included flag instead of mode and path. `WorkspaceApp` retains
Yjs-relative caret capture, continuation construction, canonical insertion,
snapshot application, selection, and notification effects.

This checkpoint reduces `src/client/app.ts` from 1,338 to 1,327 lines (-11),
grows the project-file dialog from 463 to 465 lines (+2), and reduces combined
runtime source by nine lines. It deletes two coordinator fields, the post-save
include helper, and the redundant saved mode/path protocol. Focused and affected
coverage passes all 33 dialog and application-contract cases, including
validated-snapshot-before-insertion ordering, create-and-include routing,
ordinary file selection, retry, and strict types.

The browser application artifact changes from 849,239 B raw / 228,823 B gzip
to 849,185 B raw / 228,794 B gzip (-54 B raw / -29 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,713 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Workflow File Resolution

`ProjectFileDialog` now resolves workflow files by canonical path, selects and
focuses an existing file, and evaluates missing-file content lazily before
creating it. `WorkspaceApp` retains workflow-template choice and navigation to a
newly created file while consuming the dialog's existing-or-created result.

This checkpoint reduces `src/client/app.ts` from 1,327 to 1,318 lines (-9),
grows the project-file dialog from 465 to 475 lines (+10), and grows combined
runtime source by one line while deleting the coordinator's duplicate lookup,
selection, focus, and creation helper. Focused and affected coverage passes all
34 dialog and application-contract cases, including existing-file routing,
lazy content evaluation, missing-file creation, and strict types.

The browser application artifact changes from 849,185 B raw / 228,794 B gzip
to 849,259 B raw / 228,820 B gzip (+74 B raw / +26 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,714 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Coordinator Extraction: Relative Selection Resolution

`source-editor-adapter` now resolves captured Yjs-relative selections through
one same-text validation path and returns normalized numeric ranges. Editor
selection restoration, remembered authoring targets, and selected-passage
actions consume that shared result. `WorkspaceApp` retains document identity,
active-text authority, passage semantics, and navigation effects.

This checkpoint reduces `src/client/app.ts` from 1,318 to 1,307 lines (-11),
grows the source-editor adapter from 195 to 207 lines (+12), and grows combined
runtime source by one line while deleting three copies of relative-position
resolution and the coordinator-only active-range predicate. Focused coverage
passes all 20 adapter and application-contract cases, and affected guardrails
pass 12 related and four direct cases, including anchor movement after a Yjs
edit and rejection against an unrelated document.

The browser application artifact changes from 849,259 B raw / 228,820 B gzip
to 849,079 B raw / 228,827 B gzip (-180 B raw / +7 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,715 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Coordinator Extraction: Atomic Text Range Splices

`source-editor-adapter` now owns one attributed Yjs range-splice primitive.
Native textarea synchronization, source completion, scholarly syntax insertion,
and generated-table application share that atomic delete-and-insert path while
their owning workflows retain range choice, caret, focus, and notification
policy.

This checkpoint reduces `src/client/app.ts` from 1,307 to 1,304 lines (-3),
grows the source-editor adapter from 207 to 211 lines (+4), and grows combined
runtime source by one line while deleting four copies of transaction and splice
mechanics. Focused coverage passes all 21 adapter and application-contract
cases, and affected guardrails pass 13 related and five direct cases, including
replacement content and transaction-origin attribution.

The browser application artifact changes from 849,079 B raw / 228,827 B gzip
to 848,948 B raw / 228,801 B gzip (-131 B raw / -26 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,716 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Active File Selection

`ProjectFileDialog` now validates and routes tree, workflow, save, deletion,
Undo, URL-restoration, and cross-feature file choices through one canonical
selection method. The method owns active-file identity and hidden-file
eligibility, then supplies the selected file and snapshot through one activation
callback. `WorkspaceApp` retains canonical snapshot and Yjs document authority,
active-text/editor binding, cross-feature rendering, focus, and route effects.

This checkpoint reduces `src/client/app.ts` from 1,304 to 1,296 lines (-8),
grows the project-file dialog from 475 to 482 lines (+7), and reduces combined
runtime source by one line. It deletes duplicate selection callbacks from the
mutation and workflow protocols, removes stable file identity from save
completion, and makes ordinary create selection a component-owned consequence.
Focused coverage passes all 34 dialog and application-contract cases, and
affected guardrails pass 20 related and 18 direct cases.

The browser application artifact changes from 848,948 B raw / 228,801 B gzip
to 848,959 B raw / 228,788 B gzip (+11 B raw / -13 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,716 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Live Project Files

`ProjectFileDialog` now retains the coordinator-supplied collaborative-content
readiness predicate beside its live-content resolver. Preview, manuscript-map,
and collaborator-selection consumers request one derived file collection
without repeating collaboration state. `WorkspaceApp` retains Yjs document and
collaboration authority and supplies both functions once.

This checkpoint reduces `src/client/app.ts` from 1,296 to 1,290 lines (-6),
grows the project-file dialog from 482 to 484 lines (+2), and reduces combined
runtime source by four lines while deleting the coordinator's derived-file
wrapper. Focused coverage passes all 35 dialog and application-contract cases,
and affected guardrails pass 21 related and 19 direct cases, including readiness
transitions between snapshot and live collaborative content.

The browser application artifact changes from 848,959 B raw / 228,788 B gzip
to 849,040 B raw / 228,808 B gzip (+81 B raw / +20 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,717 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Preview Companions

`WorkspacePreview` now projects manuscript-map content and live export
statistics from the exact project render outcome it already owns. This keeps
Preview status, source-map navigation, Guide content, and export counts on one
publication composition. `WorkspaceApp` retains canonical Yjs/project inputs,
resolved-anchor resource projection, publication navigation, and transition
effects.

This checkpoint reduces `src/client/app.ts` from 1,290 to 1,278 lines (-12),
grows the workspace Preview from 375 to 397 lines (+22), and grows combined
runtime source by ten lines while deleting the coordinator's manuscript-map
wrapper, guide refresh hook, publication-statistics import, and companion
fan-out. Focused coverage passes 28 Preview, application-contract,
manuscript-map, and export-dialog cases. Affected guardrails pass 14 related and
seven direct cases, including synchronized map source and canonical export
statistics.

The browser application artifact changes from 849,040 B raw / 228,808 B gzip
to 849,147 B raw / 228,827 B gzip (+107 B raw / +19 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,718 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Resolved Preview Workspace

`WorkspacePreview` now presents a request-supplied anchor-resolved workspace to
research companions only when the matching project render outcome is available.
`WorkspaceApp` retains Yjs document and anchor-resolution authority and supplies
the resolved snapshot with the other canonical Preview inputs instead of
performing post-render companion fan-out.

This checkpoint reduces `src/client/app.ts` from 1,278 to 1,272 lines (-6),
grows the workspace Preview from 397 to 403 lines (+6), and leaves combined
runtime source unchanged while deleting the coordinator's outcome guards,
snapshot recapture, and direct resource-presenter call. Focused coverage passes
all 52 Preview, application-contract, and context-resource cases, including
available-outcome gating and synchronized bibliography/composed-source inputs.

The browser application artifact changes from 849,147 B raw / 228,827 B gzip
to 849,243 B raw / 228,834 B gzip (+96 B raw / +7 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,718 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Workflow File Navigation

`ProjectFileDialog` now owns the complete content-bearing workflow-file path:
select and focus an existing canonical file without evaluating lazy content, or
create the missing file and navigate its stable identity into the Guide rail
while preserving unrelated URL state. `WorkspaceApp` retains workflow-template
choice, source-range navigation, and global toast policy.

This checkpoint reduces `src/client/app.ts` from 1,272 to 1,266 lines (-6),
grows the project-file dialog from 484 to 488 lines (+4), and reduces combined
runtime source by two lines while deleting the coordinator's created-file
navigation helper and return-value protocol. Focused coverage passes all 35
dialog and application-contract cases, including lazy evaluation, existing-file
focus, stable created-file routing, and URL-state preservation.

The browser application artifact changes from 849,243 B raw / 228,834 B gzip
to 849,224 B raw / 228,854 B gzip (-19 B raw / +20 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,718 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Active File Presentation

`ProjectFileDialog` now completes canonical snapshot presentation by supplying
the active file and snapshot through one typed callback after projecting the
tree, Insert menu, completion list, and file actions. `WorkspaceApp` retains
active Y.Text/editor binding and authoring-target rendering without receiving a
component return value or maintaining a separate project-file render wrapper.

This checkpoint reduces `src/client/app.ts` from 1,266 to 1,263 lines (-3),
grows the project-file dialog from 488 to 491 lines (+3), and leaves combined
runtime source unchanged while deleting the active-file return protocol and
coordinator wrapper. Focused coverage passes all 35 dialog and
application-contract cases, including entry fallback, repeated presentation,
selection activation, and canonical active-file callbacks.

The browser application artifact changes from 849,224 B raw / 228,854 B gzip
to 849,498 B raw / 228,878 B gzip (+274 B raw / +24 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,718 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Rail Navigation

`WorkspaceRailTabs` now applies internal clicks and workflow-driven rail
navigation through one component-owned transition before reporting the selected
mode for URL synchronization. `WorkspaceApp` retains responsive layout,
collapse, route persistence, and guide rendering without a rail-selection
wrapper or the `WorkspaceRail` type dependency.

This checkpoint reduces `src/client/app.ts` from 1,263 to 1,257 lines (-6),
grows the rail-tabs owner from 100 to 105 lines (+5), and reduces combined
runtime source by one line while eliminating the coordinator round trip for tab
selection. Focused and affected coverage passes all 46 related cases, including
unchanged clicks, internal selection, controlled-panel projection, external
workflow navigation, application contracts, and strict types.

The browser application artifact changes from 849,498 B raw / 228,878 B gzip
to 849,575 B raw / 228,872 B gzip (+77 B raw / -6 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,719 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Authoring Mode Navigation

`AuthoringModeTabs` now applies internal clicks and workflow-driven Write/Map
navigation through one component-owned transition before reporting the selected
mode for editor-focus policy and URL synchronization. `WorkspaceApp` retains
those two policies without an authoring-mode selection wrapper or the
`AuthoringMode` type dependency.

This checkpoint reduces `src/client/app.ts` from 1,257 to 1,247 lines (-10),
grows the authoring-mode-tabs owner from 79 to 85 lines (+6), and reduces
combined runtime source by four lines while eliminating the coordinator round
trip for mode selection. Direct component coverage passes all four cases;
affected application coverage passes all six related cases alongside strict
types.

The browser application artifact changes from 849,575 B raw / 228,872 B gzip
to 849,696 B raw / 228,863 B gzip (+121 B raw / -9 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,720 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Template Refresh Outcomes

`ProjectStartingPointBrowser` now reports its derived visible-template view
after every successful catalog refresh through the existing typed change
binding. Initial loads, post-promotion loads, post-save loads, and committed
deletions therefore synchronize the save-template replacement dialog from the
catalog owner instead of relying on a second `WorkspaceApp` step.

This checkpoint reduces `src/client/app.ts` from 1,247 to 1,246 lines (-1),
reduces the starting-point owner from 569 to 567 lines (-2), and reduces
combined runtime source by three lines while deleting the deletion path's
duplicate notification. Direct component coverage passes all nine cases;
affected application coverage passes all 11 related cases alongside strict
types.

The browser application artifact changes from 849,696 B raw / 228,863 B gzip
to 849,595 B raw / 228,845 B gzip (-101 B raw / -18 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,720 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Coordinator Simplification: Resource Context Navigation

`WorkspaceApp` now routes publication and candidate tabs through one existing
`ResearchResourceTarget` transition instead of maintaining feature-specific
wrappers. Candidate creation also uses the accepted candidate's stable id
directly after canonical refresh rather than searching the refreshed collection
only to recover that same id.

This checkpoint reduces `src/client/app.ts` from 1,246 to 1,234 lines (-12),
removing one feature-specific domain import, two duplicated transition methods,
and the redundant candidate lookup. The affected gate passes all 1,720 unit and
coverage cases alongside formatting, lint, and strict types.

The browser application artifact changes from 849,595 B raw / 228,845 B gzip
to 849,515 B raw / 228,816 B gzip (-80 B raw / -29 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,720 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Workspace Surface Navigation

`WorkspaceSurfaceSwitcher` now applies internal and workflow-driven
Authoring/Context navigation to its own selection state and its direct parent
workspace's visibility-driving data attribute before reporting the selected
surface. `WorkspaceApp` retains URL synchronization without a surface wrapper
or the `WorkspaceSurface` type dependency; deliberate context transitions can
suppress only the navigation outcome while still applying presentation.

This checkpoint reduces `src/client/app.ts` from 1,234 to 1,228 lines (-6),
grows the surface-switcher owner from 74 to 76 lines (+2), and reduces combined
runtime source by four lines. Focused and affected coverage passes all three
related cases, including changed selection, parent projection, suppressed route
notification, and application contracts alongside strict types.

The browser application artifact changes from 849,515 B raw / 228,816 B gzip
to 849,687 B raw / 228,815 B gzip (+172 B raw / -1 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

Full native CI passes all 1,720 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Coordinator Simplification: Authoring Focus

`WorkspaceApp` now relies on the authoring-mode Lit navigation outcome to apply
Write-mode editor focus instead of repeating `source.focus()` in project-map,
range, citation, and linked-passage navigation. Linked-passage navigation
activates its project file before selecting Write mode so the component-owned
focus remains the final focus transition.

This checkpoint reduces `src/client/app.ts` from 1,228 to 1,224 lines (-4)
without adding runtime code. The affected gate and full native CI pass all
1,720 unit/coverage tests, 121 Workers-runtime tests, and 74 browser tests
alongside formatting, lint, and strict types.

The browser application artifact changes from 849,687 B raw / 228,815 B gzip
to 849,595 B raw / 228,815 B gzip (-92 B raw / unchanged gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

## Coordinator Simplification: Write Surface Policy

`WorkspaceApp` now applies the Authoring surface without a separate navigation
outcome whenever the authoring-mode Lit binding reports Write, then focuses the
editor and replaces the route once. Project-map, preview-range, citation, and
linked-passage workflows rely on that shared outcome instead of each performing
an explicit surface transition and an additional route synchronization.

This checkpoint reduces `src/client/app.ts` from 1,224 to 1,223 lines (-1) while
removing four duplicated cross-surface transitions. The affected gate and full
native CI pass all 1,720 unit/coverage tests, 121 Workers-runtime tests, and 74
browser tests alongside formatting, lint, and strict types.

The browser application artifact changes from 849,595 B raw / 228,815 B gzip
to 849,435 B raw / 228,810 B gzip (-160 B raw / -5 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

## Coordinator Simplification: Linked Passage Range

Linked-passage navigation now reuses the existing project-range transition for
file activation, Write-mode selection, editor range selection, and authoring
selection capture. Its stale-anchor and exact-versus-changed passage policies
remain local to the linked-passage outcome.

This checkpoint reduces `src/client/app.ts` from 1,223 to 1,220 lines (-3)
without adding runtime code or changing an ownership boundary. The affected
gate and full native CI pass all 1,720 unit/coverage tests, 121 Workers-runtime
tests, and 74 browser tests alongside formatting, lint, and strict types.

The browser application artifact changes from 849,435 B raw / 228,810 B gzip
to 849,318 B raw / 228,805 B gzip (-117 B raw / -5 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

## Coordinator Simplification: Promise Callback Forwarding

Sixteen coordinator bindings now return their existing promise-producing
operation directly instead of allocating redundant `async`/`await` forwarding
layers. The arrow boundaries still retain application context and the same
promise contracts for offline persistence, workspace/template refresh,
settings, Library and PDF navigation, project mutations, and assistant
candidate workflows.

This checkpoint leaves `src/client/app.ts` at 1,220 lines while removing
repeated asynchronous syntax and its generated runtime overhead. The affected
gate and full native CI pass all 1,720 unit/coverage tests, 121 Workers-runtime
tests, and 74 browser tests alongside formatting, lint, and strict types.

The browser application artifact changes from 849,318 B raw / 228,805 B gzip
to 849,139 B raw / 228,781 B gzip (-179 B raw / -24 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

## Coordinator Simplification: Authoring Range Capture

Six manuscript-editing and navigation workflows now share one bounded helper
for applying an editor range and recapturing its Yjs-relative authoring
selection. Focus remains explicit in mutation workflows and continues to come
from the Write-mode navigation policy for range and citation transitions.

This checkpoint reduces `src/client/app.ts` from 1,220 to 1,219 lines (-1) and
removes five repeated selection-capture sequences. The affected gate and full
native CI pass all 1,720 unit/coverage tests, 121 Workers-runtime tests, and 74
browser tests alongside formatting, lint, and strict types.

The browser application artifact changes from 849,139 B raw / 228,781 B gzip
to 848,978 B raw / 228,772 B gzip (-161 B raw / -9 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

## Route Ownership: Workspace Selection Projection

The pure workspace route adapter now owns default entry-file elision and active
PDF page and workspace-annotation projection alongside query parsing and
serialization. `WorkspaceApp` supplies authorized canonical selections and
retains push-versus-replace history policy without maintaining two local route
helpers.

This checkpoint reduces `src/client/app.ts` from 1,219 to 1,207 lines (-12).
Focused route coverage grows to 28 cases and the full native CI passes all 1,721
unit/coverage tests, 121 Workers-runtime tests, and 74 browser tests alongside
formatting, lint, and strict types.

The browser application artifact changes from 848,978 B raw / 228,772 B gzip
to 848,968 B raw / 228,767 B gzip (-10 B raw / -5 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

## Continued Lit Ownership: Workspace Layout Navigation

`WorkspaceLayoutControl` now routes internal, restored, and route-driven
selection through one navigation method that normalizes and persists the value,
projects it to the workspace's visibility-driving layout attribute, and emits a
resize notification before its typed outcome. `WorkspaceApp` retains PDF
availability and URL policy without its layout-application wrapper.

This checkpoint reduces `src/client/app.ts` from 1,207 to 1,202 lines (-5) and
grows the layout control from 111 to 118 lines (+7), a combined two-line runtime
increase. Focused and affected coverage passes normalized persisted navigation,
workspace projection, resize notification, storage failure, and application
contracts. Full native CI passes all 1,721 unit/coverage tests, 121
Workers-runtime tests, and 74 browser tests.

The browser application artifact changes from 848,968 B raw / 228,767 B gzip
to 848,995 B raw / 228,775 B gzip (+27 B raw / +8 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,411 B raw / 23,373 B
gzip, 18, and 150.

## Continued Lit Ownership: Preview-to-Source Navigation

`PreviewSyncControls` now captures the centered Preview offset for its explicit
backward action, resolves that offset through its retained composition map,
routes one file-qualified focus intent, and centers the bound source viewport.
Preview clicks reuse the same public transition. `WorkspaceApp` retains
source-to-Preview eligibility and DOM navigation plus file, mode, caret, and
focus policy without two Preview-to-source wrappers.

This checkpoint reduces `src/client/app.ts` from 1,202 to 1,190 lines (-12) and
grows the synchronization control from 157 to 172 lines (+15), a combined
three-line runtime increase. Focused and affected coverage passes explicit
directions, click, selection, navigation-key and typing behavior, file-qualified
mapping, viewport centering, responsive availability, and application
contracts. Full native CI passes all 1,721 unit/coverage tests, 121
Workers-runtime tests, and 74 browser tests.

The browser application artifact changes from 848,995 B raw / 228,775 B gzip
to 849,035 B raw / 228,786 B gzip (+40 B raw / +11 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

## Continued Lit Ownership: Assistant Passage Derivation

`AssistantGenerationPresenter` now derives insertion and scoped passages from
canonical file identity, manuscript text, and target-range providers plus its
owned task scope. `WorkspaceApp` no longer asks the presenter for scope, derives
assistant-only passage objects, and returns them to that same presenter; it
retains Yjs target resolution and canonical authoring authority.

This checkpoint reduces `src/client/app.ts` from 1,190 to 1,177 lines (-13) and
grows the assistant-generation presenter from 616 to 630 lines (+14), a
combined one-line runtime increase. Focused and affected coverage passes all 17
presenter cases and 19 related cases, including insertion and scoped targets,
generation input, availability, target presentation, workflow routing, and
application contracts. Full native CI passes all 1,721 unit/coverage tests, 121
Workers-runtime tests, and 74 browser tests.

The browser application artifact changes from 849,035 B raw / 228,786 B gzip
to 849,089 B raw / 228,796 B gzip (+54 B raw / +10 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150.

## Continued Lit Ownership: Citation Routing Notices

`ContextResourcePresenter` now owns the complete source and Preview citation
outcome: it resolves a single key against its bound canonical project, routes a
unique linked PDF and locator page or publication, and dispatches grouped and
missing-citation notices through its existing workspace binding. `WorkspaceApp`
no longer receives notice strings only to return them through that same route.

This checkpoint reduces `src/client/app.ts` from 1,177 to 1,172 lines (-5) and
grows the context-resource presenter from 1,004 to 1,010 lines (+6), a combined
one-line runtime increase. Focused and affected coverage passes 29 presenter
cases and 43 related cases, including case-insensitive keys, locator pages,
linked and unlinked publications, grouped and missing citations, both caller
surfaces, and application contracts. Full native CI passes all 1,721
unit/coverage tests, 121 Workers-runtime tests, and 74 browser tests.

The browser application artifact changes from 849,089 B raw / 228,796 B gzip
to 849,083 B raw / 228,788 B gzip (-6 B raw / -8 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,411 B raw / 23,373 B
gzip, 18, and 150.

## Continued Lit Ownership: Context Tab Titles

`ContextTabStrip` now derives fixed and resource titles from canonical tab,
publication, project-PDF, private-Library, shared-reference, and candidate
inputs before delegating the same projection to its resource strip and overflow
overview. `WorkspaceApp` retains canonical context state, authorization,
loading, content rendering, routing, closure, and transitions.

This checkpoint reduces `src/client/app.ts` from 4,432 to 4,406 lines (-26) and
grows the composed context-tab owner from 209 to 243 lines. Runtime source
across those two files increases by eight lines while deleting five coordinator-
only title helpers. Focused coverage passes all fixed labels, publication,
project PDF, private-Library PDF, shared-reference PDF, candidate fallback,
existing delegation and panel behavior, application contracts, and strict types.

The browser application artifact changes from 824,369 B raw / 222,551 B gzip
to 824,561 B raw / 222,605 B gzip (+192 B raw / +54 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,573 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Valibot Adoption: Bibliographic Record Contract

The shared bibliographic-record boundary now derives its TypeScript field type
and runtime predicate from one Valibot schema. The schema replaces the parallel
handwritten interface and ten-field structural guard while retaining the
existing rule that provenance must be a non-null, non-array object.

This checkpoint reduces `src/domain/bibliographic-record-contract.ts` from 32
to 20 lines (-12). Focused bibliographic, citation-contract, and Reference
Library coverage passes all 23 tests alongside strict types.

The browser application artifact changes from 849,083 B raw / 228,788 B gzip
to 848,903 B raw / 228,835 B gzip (-180 B raw / +47 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150; Valibot was already pinned.

Full native CI passes all 1,721 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Valibot Adoption: Citation Expansion Results

The Crossref citation-expansion boundary now expresses its provider constants,
identifier and timestamp contracts, bounded strings and arrays, nested
assertions, unmatched candidates, and requester bounds as one composable
Valibot schema. DOI and citation-assertion domain predicates remain the
authoritative semantic checks.

This checkpoint reduces `src/domain/citation-expansion.ts` from 45 to 30 lines
(-15), replacing the result and candidate guard trees. Focused expansion and
acceptance coverage passes all 6 tests alongside strict types.

The browser application artifact changes from 848,903 B raw / 228,835 B gzip
to 848,867 B raw / 228,892 B gzip (-36 B raw / +57 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150; Valibot was already pinned.

Full native CI passes all 1,721 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Valibot Adoption: Citation Assertion Contracts

Citation assertion creation, review, network-node, network-edge, nested review,
and assertion-view validation now share composable Valibot primitives for
identifiers, timestamps, evidence states, source kinds, confidence, and bounds.
The cross-reference inequality remains an explicit schema refinement, and
network derivation policy remains in the domain functions.

This checkpoint reduces `src/domain/citation-assertions.ts` from 282 to 232
lines (-50), replacing seven handwritten guard trees and primitive predicates.
Focused assertion, expansion, and acceptance coverage passes all 11 tests
alongside strict types.

The browser application artifact changes from 848,867 B raw / 228,892 B gzip
to 848,275 B raw / 228,825 B gzip (-592 B raw / -67 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150; Valibot was already pinned.

Full native CI passes all 1,721 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Valibot Adoption: Knowledge Graph Responses

Knowledge search results and workspace graph responses now share Valibot
schemas for resource kinds, relationship kinds, non-empty identities, nodes,
edges, and arrays. Search ranking, identity construction, graph derivation, and
navigation policy remain explicit domain behavior.

This checkpoint reduces `src/domain/knowledge.ts` from 471 to 460 lines (-11),
replacing four handwritten response guards and their primitive helpers. Focused
knowledge-domain and project-map coverage passes all 14 tests alongside strict
types.

The browser application artifact changes from 848,275 B raw / 228,825 B gzip
to 848,300 B raw / 228,857 B gzip (+25 B raw / +32 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150; Valibot was already pinned.

Full native CI passes all 1,721 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Valibot Adoption: Collaboration Protocol

Client selections and every server collaboration control message now use
strict Valibot schemas for exact keys, protocol literals, bounded identifiers,
safe non-negative integers, and ordered selection ranges. JSON-size policy,
encoding failures, Yjs update validation, and update-application semantics stay
explicit.

This checkpoint reduces `src/domain/collaboration.ts` from 134 to 112 lines
(-22), replacing the client guard, server switch, exact-key helper, and
primitive predicates. Focused collaboration coverage passes all 22 tests
alongside strict types.

The browser application artifact changes from 848,300 B raw / 228,857 B gzip
to 849,520 B raw / 228,966 B gzip (+1,220 B raw / +109 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150; the increase is the cost of adding strict-object
and tagged-union validation to an already pinned dependency.

Full native CI passes all 1,721 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Valibot Adoption: Manuscript Anchors

Version 1 manuscript-anchor selectors and `resolved`/`stale` results now share
strict Valibot schemas for exact keys, bounded strings, encoded relative
positions, safe indices, ordered ranges, and resolved-text length. Yjs relative
position encoding, decoding, source-type authority, and stale-resolution policy
remain explicit domain behavior.

This checkpoint reduces `src/domain/manuscript-anchor.ts` from 240 to 209 lines
(-31), replacing both public guards and four primitive helpers. Focused anchor
coverage passes all 6 tests alongside strict types.

The browser application artifact changes from 849,520 B raw / 228,966 B gzip
to 848,752 B raw / 228,946 B gzip (-768 B raw / -20 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150; Valibot was already pinned.

Full native CI passes all 1,721 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Library Project Projection

`ReferenceLibraryWorkspace` now derives its project-reference and
research-share presentation inputs from the canonical project snapshot and its
owned Library snapshot. `WorkspaceApp` retains canonical project snapshot
application, Library refresh timing, PDF/context navigation, history, and
notification policy.

This checkpoint reduces `src/client/app.ts` from 1,172 to 1,161 lines (-11)
and grows the composed Library owner from 342 to 352 lines. Runtime source
across those files decreases by one line while deleting the coordinator-only
Library presentation mapper. Focused Library-workspace and application-contract
coverage passes all 26 tests alongside strict types.

The browser application artifact changes from 848,752 B raw / 228,946 B gzip
to 848,938 B raw / 228,961 B gzip (+186 B raw / +15 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,721 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Candidate Completion

`AssistantGenerationPresenter` now owns generated-candidate
refresh-before-open and completed candidate-decision refresh, recovery, notice
selection, XState completion, and assistant-focus sequencing. `WorkspaceApp`
supplies only canonical refresh execution, assistant-context activation, and
notice presentation through the existing typed workflow binding.

This checkpoint reduces `src/client/app.ts` from 1,161 to 1,139 lines (-22)
and grows the assistant presenter from 630 to 649 lines. Runtime source across
those files decreases by three lines while deleting both coordinator-only
candidate completion adapters. Focused presenter and application-contract
coverage passes all 35 tests, including provider-reported and refresh failure
recovery, alongside strict types.

The browser application artifact changes from 848,938 B raw / 228,961 B gzip
to 849,004 B raw / 228,944 B gzip (+66 B raw / -17 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,721 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Context Mutation Completion

`ContextResourcePresenter` now owns child project-mutation refresh sequencing,
success/fallback notice selection, and failure propagation for claims,
comments, evidence, paper links, and publication enrichment. `WorkspaceApp`
supplies only canonical resource-refresh execution and toast presentation
through the existing route binding.

This checkpoint reduces `src/client/app.ts` from 1,139 to 1,129 lines (-10)
and grows the context presenter from 1,010 to 1,013 lines. Runtime source across
those files decreases by seven lines while deleting the coordinator-only
completion adapter and shortening seven child routes. Focused presenter and
application-contract coverage passes all 46 tests, including success, fallback,
and propagated failure behavior, alongside strict types.

The browser application artifact changes from 849,004 B raw / 228,944 B gzip
to 848,943 B raw / 228,941 B gzip (-61 B raw / -3 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,721 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Direct Library Reference Navigation

`ReferenceLibraryWorkspace` now owns the activate, canonical-refresh,
archive-aware focus, missing-feedback, and successful-route sequence used when
publication management opens a Library reference. `WorkspaceApp` retains the
canonical refresh implementation and browser-history mutation behind typed
callbacks.

This checkpoint reduces `src/client/app.ts` from 1,129 to 1,125 lines (-4) and
grows the composed Library owner from 352 to 359 lines. Runtime source across
those files grows by three lines in exchange for deleting the coordinator-only
round trip. Focused Library-workspace and application-contract coverage passes
all 27 tests alongside strict types.

The browser application artifact changes from 848,943 B raw / 228,941 B gzip
to 849,090 B raw / 228,953 B gzip (+147 B raw / +12 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,721 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Annotation Workflow Completion

`ContextResourcePresenter` now binds project-annotation intake and completed
workflow outcomes directly to its existing canonical resource routes. It owns
intake refresh plus ordered draft clearing, refresh, optional passage linking,
and notice sequencing; `WorkspaceApp` retains refresh execution, Yjs passage
validation and mutation, and toast presentation.

This checkpoint reduces `src/client/app.ts` from 1,125 to 1,121 lines (-4) and
grows the context presenter from 1,013 to 1,014 lines. Runtime source across
those files decreases by three lines while deleting the coordinator callback
type and completion adapter. Focused presenter and application-contract coverage
passes all 46 tests alongside strict types.

The browser application artifact changes from 849,090 B raw / 228,953 B gzip
to 849,199 B raw / 228,994 B gzip (+109 B raw / +41 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,721 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Library Project Mutation Completion

`ReferenceLibraryWorkspace` now owns the common canonical-apply, Library-
project, and optional-notice sequence for reference links, research shares, and
private-PDF project-use mutations. `WorkspaceApp` retains canonical project
snapshot validation and application behind the existing typed callback.

This checkpoint reduces `src/client/app.ts` from 1,121 to 1,112 lines (-9) and
grows the composed Library owner from 359 to 365 lines. Runtime source across
those files decreases by three lines while deleting the coordinator-only
mutation-completion adapter and unifying three mutation sources. Focused
Library-workspace, context-presenter, and application-contract coverage passes
all 57 tests alongside strict types.

The browser application artifact changes from 849,199 B raw / 228,994 B gzip
to 849,201 B raw / 229,011 B gzip (+2 B raw / +17 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,726 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Maintained Surface Reduction: Internal-Only Symbols

Five symbols used only within their defining modules are no longer exported:
the GitHub sync check event, client-selection guard, candidate-review data,
Library metadata value, and unidentified-PDF reference types. Runtime behavior
and source line counts are unchanged, while Fallow's dead-export metric drops
from 0.9% to 0.0% and the public module surface no longer promises unused
contracts.

Affected guardrails pass 189 related unit tests and all 121 Workers-runtime
tests alongside strict types. Browser application, lazy runtime, style, and
production-package measurements remain unchanged at 849,201 B raw / 229,011 B
gzip, 204,779 B / 62,386 B, 481,994 B / 146,135 B, 135,411 B / 23,373 B, and
18 direct / 150 unique package-version nodes.

Full native CI passes all 1,726 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Shared PDF Overlay Positioning

The PDF viewer now uses one local typed helper to position project, private,
and draft highlight overlays. This removes two source lines, reduces Fallow's
clone groups from 29 to 27, and eliminates its three-group `pdf-viewer.ts`
clone family without creating a cross-module abstraction.

Focused PDF gesture coverage passes all 10 tests alongside strict types. The
browser application artifact changes from 849,201 B raw / 229,011 B gzip to
849,004 B raw / 228,979 B gzip (-197 B raw / -32 B gzip). Lazy runtimes,
styles, and direct and unique production package counts remain unchanged at
204,779 B / 62,386 B, 481,994 B / 146,135 B, 135,411 B / 23,373 B, and 18 and 150.

Full native CI passes all 1,726 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Canonical Research Context

`ContextResourcePresenter` now owns browser-local canonical research-context
state, including activate, open, close, authorization reconciliation, captured
scroll/viewer state, PDF location preparation, and page updates. `WorkspaceApp`
retains browser-history mutation, cross-surface navigation effects, authorized
loading, and content-render timing.

This checkpoint reduces `src/client/app.ts` from 1,112 to 1,083 lines (-29)
and grows the composed context owner from 1,014 to 1,062 lines. Runtime source
across those files grows by nineteen lines while replacing split state
authority and removing ten context-state operation imports from the application
coordinator. Focused presenter and application-contract coverage passes all 47
tests alongside strict types.

The browser application artifact changes from 849,004 B raw / 228,979 B gzip
to 849,961 B raw / 229,041 B gzip (+957 B raw / +62 B gzip). Lazy runtimes,
styles, and direct and unique production package counts remain unchanged at
204,779 B / 62,386 B, 481,994 B / 146,135 B, 135,411 B / 23,373 B, and 18 and 150.

Full native CI passes all 1,727 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Research Context Navigation

`ContextResourcePresenter` now binds the context tab strip and owns activate,
resource-open, close, presentation, pane-restoration, surface-activation, tab-
focus, route-effect, and active-PDF load sequencing. Publication and candidate
navigation stays within the same owner instead of round-tripping through
`WorkspaceApp`; the coordinator supplies canonical source getters, browser-
history mutation, and underlying surface/layout effects.

This checkpoint reduces `src/client/app.ts` from 1,083 to 1,036 lines (-47)
and grows the composed context owner from 1,062 to 1,125 lines. Runtime source
across those files grows by sixteen lines while deleting five coordinator
navigation/presentation methods and two self-routing callbacks. Focused
presenter and application-contract coverage passes all 48 tests alongside
strict types.

The browser application artifact changes from 849,961 B raw / 229,041 B gzip
to 850,856 B raw / 229,192 B gzip (+895 B raw / +151 B gzip). Lazy runtimes,
styles, and direct and unique production package counts remain unchanged at
204,779 B / 62,386 B, 481,994 B / 146,135 B, 135,411 B / 23,373 B, and 18 and 150.

Full native CI passes all 1,728 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Research Context Restoration

`ContextResourcePresenter` now owns routed context restoration from a safe
Preview baseline, including fixed-context dispatch, canonical resource lookup,
Library restoration without new history, and Preview-plus-notice failure
fallback. `WorkspaceApp` retains URL parsing, browser-history mutation, and the
surrounding rail, authoring-mode, file, layout, and surface restoration order.

This checkpoint reduces `src/client/app.ts` from 1,036 to 1,019 lines (-17)
and grows the composed context owner from 1,125 to 1,141 lines. Runtime source
across those files decreases by one line while deleting both coordinator-only
context-restore helpers. Focused presenter and route coverage passes all 61
tests; affected runtime coverage passes all 47 tests alongside strict types.

The browser application artifact changes from 850,856 B raw / 229,192 B gzip
to 850,792 B raw / 229,264 B gzip (-64 B raw / +72 B gzip). Lazy runtimes,
styles, and direct and unique production package counts remain unchanged at
204,779 B / 62,386 B, 481,994 B / 146,135 B, 135,411 B / 23,373 B, and 18 and 150.

Full native CI passes all 1,729 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF-Only Resource Selection

`ContextResourcePresenter` now owns the PDF-only layout's resource policy: it
preserves an active project, private-Library, or shared-reference PDF, otherwise
opens the first authorized project PDF and then the first private-Library PDF,
and presents the empty-state notice when neither exists. `WorkspaceApp` retains
layout state, change sequencing, and browser-history synchronization.

This checkpoint reduces `src/client/app.ts` from 1,019 to 1,009 lines (-10)
and grows the composed context owner from 1,141 to 1,154 lines. Runtime source
across those files grows by three lines while deleting the coordinator-only
PDF-layout selection method. Focused presenter coverage passes all 34 tests;
affected runtime coverage passes all 48 tests alongside strict types.

The browser application artifact changes from 850,792 B raw / 229,264 B gzip
to 850,932 B raw / 229,276 B gzip (+140 B raw / +12 B gzip). Lazy runtimes,
styles, and direct and unique production package counts remain unchanged at
204,779 B / 62,386 B, 481,994 B / 146,135 B, 135,411 B / 23,373 B, and 18 and 150.

Full native CI passes all 1,730 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Navigation Lifecycle

`ContextResourcePresenter` now owns project, private-Library, and linked-
reference PDF context preparation, requested page and focused-annotation state,
workspace versus standalone-Library route-effect sequencing, and active-viewer
load timing. Internal annotation, citation, publication-paper, assistant,
restoration, and layout routes invoke those methods directly instead of leaving
the presenter through three application callbacks and immediately re-entering
it. `WorkspaceApp` supplies only the concrete standalone Library URL mutation.

This checkpoint reduces `src/client/app.ts` from 1,009 to 979 lines (-30) and
grows the composed context owner from 1,154 to 1,183 lines. Runtime source
across those files decreases by one line while deleting all three coordinator
PDF-navigation methods and their route-binding callbacks. Focused presenter
coverage passes all 35 tests; affected runtime coverage passes all 49 tests
alongside strict types.

The browser application artifact changes from 850,932 B raw / 229,276 B gzip
to 850,916 B raw / 229,287 B gzip (-16 B raw / +11 B gzip). Lazy runtimes,
styles, and direct and unique production package counts remain unchanged at
204,779 B / 62,386 B, 481,994 B / 146,135 B, 135,411 B / 23,373 B, and 18 and 150.

Full native CI passes all 1,731 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Authoring Target Lifecycle

`EditorStatus` now owns the browser-local Yjs-relative authoring target, active
file context, range selection, resolved target and caret, non-empty passage
projection, and the existing file/line/range wording. `WorkspaceApp` consumes
those typed projections and retains canonical Yjs mutation, editor highlighting,
assistant reactions, collaboration policy, and offline persistence.

This checkpoint reduces `src/client/app.ts` from 979 to 938 lines (-41) and
grows the editor-status owner from 70 to 145 lines. Runtime source across those
files grows by 34 lines while deleting the coordinator's parallel selection
field, target type, and six target/caret/passage/range helpers. Focused editor,
assistant, and context coverage passes all 56 tests; affected coverage passes
all four tests alongside strict types.

The browser application artifact changes from 850,916 B raw / 229,287 B gzip
to 852,176 B raw / 229,635 B gzip (+1,260 B raw / +348 B gzip). Lazy runtimes,
styles, and direct and unique production package counts remain unchanged at
204,779 B / 62,386 B, 481,994 B / 146,135 B, 135,411 B / 23,373 B, and 18 and 150.

Full native CI passes all 1,732 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Starting-Point Workspace Source

`ProjectStartingPointBrowser` now binds the canonical read-only workspace
catalog once and derives it for entry-trigger, settings, save-template
completion, and internal template-mutation refreshes. `WorkspaceApp` no longer
re-supplies the same catalog through a pass-through helper at three call sites.

This checkpoint reduces `src/client/app.ts` from 938 to 935 lines (-3) and
grows the starting-point owner from 567 to 572 lines. Runtime source across
those files grows by two lines while removing one repeated coordinator concept.
Focused coverage passes all nine tests; affected coverage passes all eleven
tests alongside strict types.

The browser application artifact changes from 852,176 B raw / 229,635 B gzip
to 852,348 B raw / 229,666 B gzip (+172 B raw / +31 B gzip). Lazy runtimes,
styles, and direct and unique production package counts remain unchanged at
204,779 B / 62,386 B, 481,994 B / 146,135 B, 135,411 B / 23,373 B, and 18 and 150.

Full native CI passes all 1,732 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Library Entry Lifecycle

`ReferenceLibraryWorkspace` now owns general Library entry sequencing across
context activation, optional standalone route entry, and canonical refresh.
`WorkspaceApp` supplies concrete history mutation and the existing cross-feature
refresh callback instead of routing the lifecycle through a private helper.

This checkpoint reduces `src/client/app.ts` from 935 to 932 lines (-3) and
grows the composed Library owner from 365 to 372 lines. Runtime source across
those files grows by four lines while deleting the coordinator's Library-open
method. Focused Library and context coverage passes all 47 tests; affected
coverage passes all 14 tests alongside strict types.

The browser application artifact changes from 852,348 B raw / 229,666 B gzip
to 852,473 B raw / 229,680 B gzip (+125 B raw / +14 B gzip). Lazy runtimes,
styles, and direct and unique production package counts remain unchanged at
204,779 B / 62,386 B, 481,994 B / 146,135 B, 135,411 B / 23,373 B, and 18 and 150.

Full native CI passes all 1,733 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Library PDF Project Use Projection

`LibraryPdfProjectUse` now resolves the active bibliographic record and matching
project citation alias from coordinator-supplied canonical artifact, Library,
and workspace inputs. `WorkspaceApp` retains canonical snapshot application,
project-PDF refreshes, workspace outcomes, and notification policy.

This checkpoint reduces `src/client/app.ts` from 4,330 to 4,323 lines (-7) and
grows the project-use owner from 79 to 94 lines. Runtime source across those two
files increases by eight lines while deleting the coordinator-only lookup
method. Focused coverage passes unidentified, unavailable, unlinked, linked,
successful mutation, retryable failure, application contracts, and strict
types.

The browser application artifact changes from 824,481 B raw / 222,688 B gzip
to 824,581 B raw / 222,702 B gzip (+100 B raw / +14 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,574 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Shared Workspace Anchor Projection

`resolveWorkspaceSnapshotAnchors` now hydrates passage links, claim links,
comments, and revision-candidate targets through one pure projection.
`WorkspaceApp` reuses it for synchronized refresh, offline restore, and live
preview instead of maintaining two resource-specific resolution paths.

This checkpoint reduces `src/client/app.ts` from 4,323 to 4,283 lines (-40)
and adds a 32-line shared projection. Runtime source across those two files
decreases by eight lines while consolidating all manuscript-backed snapshot
resources behind one tested rule. Focused coverage passes every projected
resource family, draft-claim identity preservation, immutability, application
contracts, strict types, and all 120 Workers-runtime tests.

The browser application artifact changes from 824,581 B raw / 222,702 B gzip
to 824,410 B raw / 222,707 B gzip (-171 B raw / +5 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,575 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Preview Project-Image Lookup Ownership

`PreviewDocument` now parses rendered Markdown image targets, resolves relative
paths through canonical source maps, filters optimistic hidden assets, and
updates matching Preview image nodes. `WorkspaceApp` supplies authorized
canonical inputs and retains snapshot, deletion, and rendering policy.

This checkpoint reduces `src/client/app.ts` from 4,283 to 4,251 lines (-32)
and grows the Preview DOM adapter from 96 to 125 lines. Runtime source across
those two files decreases by three lines while removing four coordinator-only
image helpers. Focused coverage passes relative local images, external images,
optimistically hidden assets, existing Preview mechanics, application
contracts, and strict types.

The browser application artifact changes from 824,410 B raw / 222,707 B gzip
to 824,456 B raw / 222,788 B gzip (+46 B raw / +81 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,576 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Assistant Generation Requirements

`AssistantWorkflowStatus` now validates synchronization readiness and each
operation's manuscript-target, table-insertion-target, and evidence requirements
while owning the corresponding guidance. `WorkspaceApp` retains canonical
target and stability derivation, provider construction, generation dispatch,
and result-specific statuses.

This checkpoint reduces `src/client/app.ts` from 4,251 to 4,231 lines (-20) and
grows the workflow-status owner from 172 to 200 lines. Runtime source across
those two files increases by eight lines while deleting two coordinator-only
policy helpers and their duplicated wording branch. Focused coverage passes
unsynchronized, missing-target, required-evidence, annotation-only claim,
table-target, successful, existing evidence-projection, application-contract,
and strict-type cases.

The browser application artifact changes from 824,456 B raw / 222,788 B gzip
to 824,645 B raw / 222,950 B gzip (+189 B raw / +162 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,577 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Typed Assistant Task Inputs

`AssistantTaskPanel` now normalizes claim relations, resolves reviewed phrasing
purposes, parses structured table requirements, and exposes non-throwing table
readiness from the raw fields it owns. `WorkspaceApp` consumes these typed
projections during availability and generation orchestration.

This checkpoint reduces `src/client/app.ts` from 4,231 to 4,204 lines (-27) and
grows the task owner from 287 to 313 lines. Runtime source across those two
files decreases by one line while deleting three coordinator adapters and one
free normalization helper. Focused coverage passes valid and fallback claim
relations, valid and fallback phrasing purposes, valid and invalid table
requirements, existing task presentation and intents, application contracts,
and strict types.

The browser application artifact changes from 824,645 B raw / 222,950 B gzip
to 824,825 B raw / 222,976 B gzip (+180 B raw / +26 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,578 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Assistant Generation Readiness

`AssistantTaskPanel` now combines canonical document stability, evidence
counts, selected-evidence limits, target availability, provider availability,
and discovery and workflow activity with its owned operation, instruction, and
table state. `WorkspaceApp` supplies those canonical inputs but no longer
duplicates task-specific evidence, target, or generation-gating policy.

This checkpoint reduces `src/client/app.ts` from 4,204 to 4,176 lines (-28) and
grows the task owner from 313 to 345 lines. Runtime source across those two
files grows by four lines while deleting five coordinator helpers and the
panel's imperative enable/disable escape hatch. Focused coverage passes every
shared availability constraint plus draft-claim and structured-table target
rules, existing task presentation and intents, application contracts, and
strict types.

The browser application artifact changes from 824,825 B raw / 222,976 B gzip
to 824,899 B raw / 223,034 B gzip (+74 B raw / +58 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,579 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Markup Pointer Routing

`LibraryPdfMarkupLayer` now binds and routes its own host pointer-down, move,
up, and cancellation events through the note-press, note-drag, and drawing state
it already owns. It emits typed saved-markup selection, completed
note-placement, touch-drawing warning, note-move, and drawing-save outcomes.
`WorkspaceApp` retains inspector and annotation-form policy, canonical
refreshes, and notices, but no longer replays the layer's local gesture
lifecycle across four methods.

This checkpoint reduces `src/client/app.ts` from 4,176 to 4,125 lines (-51) and
grows the markup-layer owner from 651 to 692 lines. Runtime source across those
two files decreases by ten lines while removing four raw event bindings, four
coordinator gesture methods, and eight externally visible low-level component
members from the readability audit. Focused coverage passes host note
placement, saved-markup selection, touch handling, drawing continuation and
persistence, cancellation, existing gesture primitives, application contracts,
and strict types.

The browser application artifact changes from 824,899 B raw / 223,034 B gzip
to 824,834 B raw / 222,999 B gzip (-65 B raw / -35 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,580 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Coordinator Simplification: Resource Refresh Notices

`WorkspaceApp` now routes seven mutation-completion paths through one canonical
coalesced resource-refresh and success-or-failure notice helper. Comment,
project-evidence, highlight, publication, claim, claim-dialog, and linked-paper
outcomes keep their feature-specific wording without maintaining parallel
promise chains.

This checkpoint reduces `src/client/app.ts` from 4,125 to 4,110 lines (-15),
deleting 32 coordinator lines while adding 17. The affected gate passes strict
types and all 1,580 unit/coverage tests; its first sandboxed run reached the
same suite but the real loopback model-companion boundary was denied local
`listen` permission, then passed under the native test permission profile.

The browser application artifact changes from 824,834 B raw / 222,999 B gzip
to 824,567 B raw / 223,011 B gzip (-267 B raw / +12 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,580 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Coordinator Simplification: Source Completion Mutation

Citation and project-include completion now share one Yjs replacement, editor
refocus, caret placement, and authoring-selection refresh boundary. The Library
citation path still preserves its relative positions across the awaited project
reference mutation before applying the shared replacement.

This checkpoint reduces `src/client/app.ts` from 4,110 to 4,106 lines (-4),
deleting 12 coordinator lines while adding eight. The affected gate passes
strict types and all 1,580 unit/coverage tests.

The browser application artifact changes from 824,567 B raw / 223,011 B gzip
to 824,393 B raw / 222,985 B gzip (-174 B raw / -26 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,580 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Source Completion Context

`SourceCompletion` now detects active `::include[...]` and citation-key contexts
from its bound editor, selects the corresponding canonical candidates, and owns
the no-context, inactive-editor, and non-workspace hiding paths. `WorkspaceApp`
retains project-relative include candidate projection, canonical project and
Library citation candidates, bounded Library loading, private-reference
linking, Yjs replacement, and caret restoration.

This checkpoint reduces `src/client/app.ts` from 4,106 to 4,074 lines (-32) and
grows the source-completion owner from 221 to 258 lines. Runtime source across
those two files grows by five lines while deleting two coordinator presentation
methods and removing completion-context imports from the coordinator. Focused
coverage passes include, citation, Library-scope, inactive-editor,
non-workspace, no-context, existing presentation and interaction, application
contracts, and strict types.

The browser application artifact changes from 824,393 B raw / 222,985 B gzip
to 824,216 B raw / 223,003 B gzip (-177 B raw / +18 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150. The readability audit reports one fewer externally
visible low-level component member.

Full native CI passes all 1,581 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Preview Source Viewport

`PreviewSyncControls` now binds the native source viewport and inert highlight
lines, derives the source offset nearest the viewport center, and centers the
editor on a requested source offset. `WorkspaceApp` retains active-file
identity, automatic-versus-explicit synchronization policy, Preview DOM
navigation, caret placement, and focus policy.

This checkpoint reduces `src/client/app.ts` from 4,074 to 4,045 lines (-29) and
grows the preview-sync owner from 78 to 115 lines. Runtime source across those
two files grows by eight lines while deleting both coordinator viewport
algorithms. Focused coverage passes unbound, centered-offset, reverse-centering,
existing source-map translation and directional interaction behavior; affected
coverage passes four tests alongside strict types.

The browser application artifact changes from 824,216 B raw / 223,003 B gzip
to 824,363 B raw / 223,076 B gzip (+147 B raw / +73 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150. The readability audit reports three additional
externally visible component members for binding and bidirectional viewport
translation while the coordinator loses both private viewport algorithms.

Full native CI passes all 1,582 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Source Completion Candidates

`SourceCompletion` now derives project and available unlinked Library citation
candidates plus project-relative include candidates from canonical reference,
file, and active-file inputs. `WorkspaceApp` retains private-Library loading and
linking, Yjs replacement, and caret restoration without importing or building
completion candidates.

This checkpoint reduces `src/client/app.ts` from 4,045 to 4,037 lines (-8) and
grows the source-completion owner from 258 to 272 lines. Runtime source across
those two files grows by six lines while removing completion-specific candidate
construction and its citation adapter import from the coordinator. All six
focused and eight affected tests pass alongside strict types.

The browser application artifact changes from 824,363 B raw / 223,076 B gzip
to 824,419 B raw / 223,107 B gzip (+56 B raw / +31 B gzip). Styles, direct and
unique production package counts, and the readability audit remain unchanged at
135,411 B raw / 23,373 B gzip, 18, 150, and 256 externally visible low-level
component members.

Full native CI passes all 1,582 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Assistant Evidence Reconciliation

`AssistantWorkflowStatus` now derives valid annotation and claim evidence keys
from the canonical collections while reconciling the browser-local selection it
already owns. `WorkspaceApp` supplies those collections without importing the
evidence-key adapter or constructing a temporary parallel set.

This checkpoint reduces `src/client/app.ts` from 4,037 to 4,032 lines (-5) and
grows the assistant workflow-status owner from 200 to 205 lines. Runtime source
across those two files is unchanged while removing one coordinator-only
projection and import. All five focused and seven affected tests pass alongside
strict types.

The browser application artifact changes from 824,419 B raw / 223,107 B gzip
to 824,415 B raw / 223,055 B gzip (-4 B raw / -52 B gzip). Styles, direct and
unique production package counts, and the readability audit remain unchanged at
135,411 B raw / 23,373 B gzip, 18, 150, and 256 externally visible low-level
component members.

Full native CI passes all 1,582 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Reference Library Projection

`ReferenceLibraryFilterPanel` now derives dynamic type choices, filtered and
sorted references, and visible-versus-total counts from the canonical Library
snapshot, its local filter state, and project-linked reference ids.
`WorkspaceApp` retains Library loading, linked-id projection, result-card
composition, navigation, mutations, and refresh policy without importing the
reference filter domain adapter.

This checkpoint reduces `src/client/app.ts` from 4,032 to 4,027 lines (-5)
while the reference filter owner remains 202 lines. Runtime source across those
two files decreases by five lines and two narrow public setters collapse into
one complete filtering boundary. Nine focused domain and component tests plus
all four affected tests pass alongside strict types.

The browser application artifact changes from 824,415 B raw / 223,055 B gzip
to 824,356 B raw / 222,964 B gzip (-59 B raw / -91 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150. The readability audit reports one fewer externally
visible low-level component member.

Full native CI passes all 1,582 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit and Valibot Ownership: Model Preferences

`ModelProviderSettings` now restores and persists its browser-local connection,
endpoint, model, and reasoning-effort values within its own lifecycle. A bounded
Valibot schema preserves per-field fallbacks for missing, malformed, or
oversized stored values; unavailable browser storage leaves the current-page
preferences usable. `WorkspaceApp` retains discovery availability, assistant
status mirroring, and model generation without owning preference storage.

This checkpoint reduces `src/client/app.ts` from 4,027 to 4,006 lines (-21) and
grows the model-provider settings owner from 247 to 268 lines. Runtime source
across those two files is unchanged while deleting the coordinator storage key,
restore/save methods, record guard, initialization call, and change-listener
persistence call. Seven focused and nine affected tests pass alongside strict
types.

The browser application artifact changes from 824,356 B raw / 222,964 B gzip
to 824,675 B raw / 223,048 B gzip (+319 B raw / +84 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150. The readability audit reports one fewer externally
visible low-level component member after removing the separate restore API.

Full native CI passes all 1,583 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Claim Snapshot Projection

`ClaimListPanel` now projects its claim, annotation, evidence-link, and passage-
link collections directly from the canonical workspace snapshot plus the
browser-local evidence selection. `WorkspaceApp` retains selection mutation,
dialogs, navigation, canonical refresh, and notification policy without its
claim-projection wrapper or `ClaimPassageLink` import.

This checkpoint reduces `src/client/app.ts` from 4,006 to 3,994 lines (-12) and
grows the claim-list owner from 264 to 274 lines. Runtime source across those
two files decreases by two lines while replacing the intermediate five-field
data object with one canonical snapshot boundary. Eight focused and ten
affected tests pass alongside strict types.

The browser application artifact changes from 824,675 B raw / 223,048 B gzip
to 824,635 B raw / 223,088 B gzip (-40 B raw / +40 B gzip). Styles, direct and
unique production package counts, and the readability audit remain unchanged at
135,411 B raw / 23,373 B gzip, 18, 150, and 254 externally visible low-level
component members.

Full native CI passes all 1,583 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project Evidence Snapshot Projection

`ProjectEvidencePanel` now projects its PDFs, annotations, claim-evidence links,
passage links, and publication-PDF links directly from the canonical workspace
snapshot plus browser-local evidence selection. `WorkspaceApp` retains PDF-form
coordination, selection mutation, navigation, canonical refresh, and
notification policy without its project-evidence projection wrapper.

This checkpoint reduces `src/client/app.ts` from 3,994 to 3,981 lines (-13) and
grows the project-evidence owner from 544 to 549 lines. Runtime source across
those two files decreases by eight lines while replacing a coordinator-owned
six-field projection with one canonical snapshot boundary. Seventeen focused
and 19 affected tests pass alongside strict types.

The browser application artifact changes from 824,635 B raw / 223,088 B gzip
to 824,593 B raw / 223,088 B gzip (-42 B raw / unchanged gzip). Styles, direct
and unique production package counts, and the readability audit remain
unchanged at 135,411 B raw / 23,373 B gzip, 18, 150, and 254 externally visible
low-level component members.

Full native CI passes all 1,583 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Assistant Evidence Lifecycle

`AssistantWorkflowStatus` now retains the canonical annotation and claim
collections supplied while reconciling its browser-local evidence selection.
Its evidence projection no longer requires `WorkspaceApp` to re-supply the same
collections or maintain an empty-snapshot fallback wrapper.

This checkpoint reduces `src/client/app.ts` from 3,981 to 3,975 lines (-6) and
grows the workflow-status owner from 205 to 209 lines. Runtime and focused test
source across the three changed files decreases by three lines. Five focused
and seven affected tests pass alongside strict types.

The browser application artifact changes from 824,593 B raw / 223,088 B gzip
to 824,576 B raw / 223,087 B gzip (-17 B raw / -1 B gzip). Styles, direct and
unique production package counts, and the readability audit remain unchanged
at 135,411 B raw / 23,373 B gzip, 18, 150, and 254 externally visible low-level
component members.

Full native CI passes all 1,583 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Import Dialog Dismissal

`GitHubImportPanel` and `LatexImportPanel` now close their own native dialogs
when Cancel is activated. `WorkspaceApp` listens only for successful navigation;
the GitHub cancel event is removed, and LaTeX import replaces its cancel-or-
complete union with a completion-only href event.

This checkpoint reduces `src/client/app.ts` from 3,975 to 3,972 lines (-3).
Runtime source across the app and two Lit owners decreases by six lines, while
focused test source remains unchanged. Thirteen focused and 15 affected tests
pass alongside strict types.

The browser application artifact changes from 824,576 B raw / 223,087 B gzip
to 824,333 B raw / 223,058 B gzip (-243 B raw / -29 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150. The readability audit reports two fewer externally
visible low-level component members after dialog closing becomes internal.

Full native CI passes all 1,583 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Starting-Point Dismissal

`ProjectStartingPointBrowser` now closes its own modal for Cancel and before
handing either import choice to `WorkspaceApp`. Its external action contract
contains only the two import choices instead of wrapping them with a redundant
action field or exposing local cancellation.

This checkpoint reduces `src/client/app.ts` from 3,972 to 3,969 lines (-3).
Runtime and focused test source across the three changed files decreases by
nine lines. Eight focused and ten affected tests pass alongside strict types.

The browser application artifact changes from 824,333 B raw / 223,058 B gzip
to 823,963 B raw / 223,031 B gzip (-370 B raw / -27 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150. The readability audit reports one fewer externally
visible low-level component member after starting-point closing becomes
internal.

Full native CI passes all 1,583 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Library Archive Visibility

`LibraryToolsMenu` now applies its own archived-reference visibility toggle and
emits only a canonical-refresh request. Its programmatic visibility setter
reports whether state changed, removing duplicated read-then-write branches
when `WorkspaceApp` reveals archived search or upload results.

This checkpoint reduces `src/client/app.ts` from 3,969 to 3,962 lines (-7).
Runtime and focused test source across the three changed files decreases by ten
lines. Four focused and six affected tests pass alongside strict types.

The browser application artifact changes from 823,963 B raw / 223,031 B gzip
to 823,835 B raw / 223,024 B gzip (-128 B raw / -7 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150. The readability audit reports one fewer externally
visible low-level component member.

Full native CI passes all 1,583 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Source Completion Dismissal

`SourceCompletion` now hides itself on Escape and bound-editor blur instead of
emitting a dismissal action solely for `WorkspaceApp` to call `hide()` back on
the same component. Its external action contract now contains only accepted
candidates and citation-scope changes.

This checkpoint reduces `src/client/app.ts` from 3,962 to 3,957 lines (-5).
Runtime and focused test source across the three changed files decreases by six
lines. Six focused and eight affected tests pass alongside strict types.

The browser application artifact changes from 823,835 B raw / 223,024 B gzip
to 823,738 B raw / 222,983 B gzip (-97 B raw / -41 B gzip). Styles, direct and
unique production package counts, and the readability audit remain unchanged
at 135,411 B raw / 23,373 B gzip, 18, 150, and 250 externally visible low-level
component members.

Full native CI passes all 1,583 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Workspace Preview Actions

`workspace-preview` now classifies its rendered DOM clicks, excludes links and
form controls, parses semantic-citation datasets, extracts safe source offsets,
applies transient source emphasis, and emits typed citation or source intents.
Centered Preview synchronization also returns a source offset instead of
exposing an internal rendered element. `WorkspaceApp` retains source-map and
project-file routing plus publication resolution and citation navigation.

This checkpoint reduces `src/client/app.ts` from 3,605 to 3,592 lines (-13) and
grows `src/client/workspace-preview.ts` from 235 to 276 lines. Client runtime
source grows by 28 lines overall while removing the coordinator's Preview DOM
contract. The browser application artifact changes from 823,979 B raw /
223,092 B gzip to 824,268 B raw / 223,159 B gzip (+289 B raw / +67 B gzip).
Styles and direct and unique production package counts remain unchanged at
135,411 B raw / 23,373 B gzip, 18, and 150. The readability audit remains at
261 externally visible low-level component members.

Focused Preview, citation, and registry coverage passes 17 tests. The affected
guardrails pass formatting, lint, strict types, 11 related tests, and nine
directly affected tests. Three browser scenarios cover direct Preview clicks,
viewport-centered synchronization, and citation navigation.

Full native CI passes all 1,593 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Valibot Adoption: GitHub Sync Status

The GitHub synchronization status boundary now derives its TypeScript payload
type from one Valibot schema. That schema replaces the parallel serialized
status interface, relationship array and membership predicate, record helper,
and repeated safe non-negative integer checks; relationship-specific UI policy
remains explicit.

This checkpoint reduces `src/client/github-sync-status.ts` from 118 to 87 lines
(-31). The browser application artifact changes from 824,276 B raw / 223,155 B
gzip to 823,979 B raw / 223,092 B gzip (-297 B raw / -63 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip, 18, and 150 because Valibot was already pinned and shipped in
the browser application.

The affected guardrails pass formatting, lint, strict types, and eight status,
menu, and review tests across three directly related test files.

Full native CI passes all 1,592 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Library PDF Inspector Children

`library-pdf-inspector` now owns the annotation forms, imported-highlight
review, saved annotation list, and project-use components that it already
composes. It projects one canonical artifact context into those children and
resets their local presentation state when the active artifact changes.
`WorkspaceApp` retains canonical Library refresh, PDF viewer state, navigation,
mutations, and notification policy.

This checkpoint reduces `src/client/app.ts` from 3,662 to 3,605 lines (-57) and
removes four global registry entries. The inspector grows from 105 to 288 lines,
so client runtime source grows by 118 lines overall while concentrating the
child-component lifecycle at its existing owner. The browser application
artifact changes from 823,387 B raw / 222,874 B gzip to 824,276 B raw /
223,155 B gzip (+889 B raw / +281 B gzip). Styles and direct and unique
production package counts remain unchanged at 135,411 B raw / 23,373 B gzip,
18, and 150. The readability audit reports 261 externally visible low-level
component members, six more than the prior checkpoint for the typed ownership
boundary.

Focused inspector, forms, import, list, project-use, and registry coverage
passes 57 tests, including explicit owned-child registration and bubbled action
contracts. The affected guardrails pass formatting, lint, strict types, and 20
tests across three directly related test files. Three private-PDF browser
scenarios cover PDF rendering, links, annotation persistence, and project
sharing after the ownership move.

Full native CI passes all 1,592 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Workspace Preview

`workspace-preview` now owns the light-DOM preview article and diagnostic
surface, lazy Markdown-runtime loading, stale-render rejection, sanitized HTML
or escaped-source presentation, renderer diagnostics, isolated-file heading
numbers, authorized local-image resolution, and viewport-relative source
navigation. The former manual `PreviewDocument` adapter is deleted.
`WorkspaceApp` retains project composition, Yjs source authority, source-map
translation, cross-panel projections, citations, and routing.

This checkpoint reduces `src/client/app.ts` from 3,715 to 3,662 lines (-53) and
replaces the 125-line manual adapter with a 235-line typed Lit owner. Including
the one-line element-registry change, client runtime source grows by 58 lines;
the server-rendered fallback wrapper adds two lines. The browser application
artifact changes from 821,877 B raw / 222,556 B gzip to 823,387 B raw /
222,874 B gzip (+1,510 B raw / +318 B gzip). Styles and direct and unique
production package counts remain unchanged at 135,411 B raw / 23,373 B gzip,
18, and 150. The readability audit reports 255 externally visible low-level
component members, six more than the prior checkpoint for the typed render and
navigation boundary.

Focused preview, presentation, registry, and shell coverage passes 21 tests.
The affected guardrails pass formatting, lint, strict types, 84 related tests,
16 directly affected tests, and all 120 Workers-runtime tests. Full unit
coverage passes all 1,588 tests at 90.71% statements and 92.79% lines.

Full native CI passes all 1,588 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Active PDF Load-Path Consolidation

The active PDF load path now keeps resource resolution, URL selection, viewer
focus, viewer mode, and stale-error suppression beside the two operations that
consume those decisions. Five single-use helpers and the private
`ActivePdfResources` transfer shape are gone. The resolution order and viewer
behavior remain unchanged, while the coordinator exposes fewer incidental
concepts.

This checkpoint reduces `src/client/app.ts` from 3,761 to 3,715 lines (-46). The
browser application artifact changes from 822,140 B raw / 222,636 B gzip to
821,877 B raw / 222,556 B gzip (-263 B raw / -80 B gzip). Styles, direct and
unique production package counts, and the readability audit remain unchanged at
135,411 B raw / 23,373 B gzip, 18, 150, and 249 externally visible low-level
component members.

The affected guardrails pass formatting, lint, strict types, and all 1,584
unit/coverage tests.

Full native CI passes all 1,584 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Active PDF One-Use Derivations

`WorkspaceApp` now derives the active workspace annotations and private library
highlights directly while assembling the PDF load context. The removed helpers
each had one caller and no independent behavior or contract, so keeping the
filters at their use site reduces coordinator concepts without moving incidental
logic into another module.

This checkpoint reduces `src/client/app.ts` from 3,769 to 3,761 lines (-8). The
browser application artifact changes from 822,192 B raw / 222,638 B gzip to
822,140 B raw / 222,636 B gzip (-52 B raw / -2 B gzip). Styles, direct and unique
production package counts, and the readability audit remain unchanged at
135,411 B raw / 23,373 B gzip, 18, 150, and 249 externally visible low-level
component members.

The affected guardrails pass formatting, lint, strict types, and all 1,584
unit/coverage tests.

Full native CI passes all 1,584 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Open Comment Count

`ManuscriptCommentList` now derives and returns the open-comment count while
accepting its canonical collection. `WorkspaceApp` routes that count to the
rail in both snapshot projections without retaining a separate filter-and-fanout
helper. The rail remains the presentation owner for the badge.

This checkpoint reduces `src/client/app.ts` from 3,775 to 3,769 lines (-6) and
grows the comment-list owner from 202 to 203 lines (+1), for a five-line runtime
source reduction. Its focused test grows from 199 to 201 lines to cover mixed
open and resolved comments. Eight focused and ten related tests pass through the
affected guardrails alongside formatting, lint, and strict types.

The browser application artifact changes from 822,123 B raw / 222,645 B gzip
to 822,192 B raw / 222,638 B gzip (+69 B raw / -7 B gzip). Styles, direct and
unique production package counts, and the readability audit remain unchanged
at 135,411 B raw / 23,373 B gzip, 18, 150, and 249 externally visible low-level
component members.

Full native CI passes all 1,584 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Source Completion Refresh

`SourceCompletion` now owns the five bound-editor events that refresh citation
and include suggestions. Canonical project inputs arrive when project files
render, and one callback reports editor changes for coordinator-owned authoring
selection, presence, and model-availability consequences. `WorkspaceApp` no
longer owns a parallel source-event subscription or a completion-refresh method;
it retains private-Library linking, Yjs edits, caret restoration, and the three
cross-feature consequences.

This checkpoint reduces `src/client/app.ts` from 3,788 to 3,775 lines (-13) and
grows the source-completion owner from 285 to 303 lines (+18), for five added
runtime lines while establishing one editor-event owner. Its focused test grows
from 215 to 237 lines to cover project-input refresh, bound input refresh, and
the coordinator callback. Six focused and eight related tests pass through the
affected guardrails alongside formatting, lint, and strict types.

The browser application artifact changes from 821,919 B raw / 222,544 B gzip
to 822,123 B raw / 222,645 B gzip (+204 B raw / +101 B gzip). Styles, direct and
unique production package counts, and the readability audit remain unchanged
at 135,411 B raw / 23,373 B gzip, 18, 150, and 249 externally visible low-level
component members.

Full native CI passes all 1,584 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Candidate Decision Outcomes

`CandidateReviewPanel` now derives revision-versus-claim completion wording and
emits it with its typed decision outcome. The outcome also drops the candidate
identifier that no completion consumer needed. `WorkspaceApp` retains canonical
refresh, assistant workflow transitions, tab movement, failure recovery, and
toast presentation policy.

This checkpoint reduces `src/client/app.ts` from 3,794 to 3,788 lines (-6) and
grows the candidate-review owner from 312 to 322 lines (+10), for four added
runtime lines while deleting the coordinator-only candidate lookup and decision
message helper. Its focused test grows from 225 to 240 lines to cover revision
and claim apply/reject wording through the transport outcome. Seven focused and
nine related tests pass through the affected guardrails alongside formatting,
lint, and strict types.

The browser application artifact changes from 821,960 B raw / 222,577 B gzip
to 821,919 B raw / 222,544 B gzip (-41 B raw / -33 B gzip). Styles, direct and
unique production package counts, and the readability audit remain unchanged
at 135,411 B raw / 23,373 B gzip, 18, 150, and 249 externally visible low-level
component members.

Full native CI passes all 1,584 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project Highlight Tool Guidance

`ProjectAnnotationForm` now derives Paint and Erase guidance when its local tool
changes. `WorkspaceApp` retains viewer-tool synchronization, PDF gesture and
overlap handling, persistence, canonical refreshes, and notification policy.

This checkpoint reduces `src/client/app.ts` from 3,799 to 3,794 lines (-5) and
grows the project annotation form from 362 to 366 lines (+4), for a one-line
runtime source reduction. Its focused test grows from 212 to 215 lines to cover
both guidance branches. Seven focused and nine related tests pass through the
affected guardrails alongside formatting, lint, and strict types.

The browser application artifact changes from 821,989 B raw / 222,563 B gzip
to 821,960 B raw / 222,577 B gzip (-29 B raw / +14 B gzip). Styles, direct and
unique production package counts, and the readability audit remain unchanged
at 135,411 B raw / 23,373 B gzip, 18, 150, and 249 externally visible low-level
component members.

Full native CI passes all 1,584 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Markup Guidance

`LibraryPdfMarkupLayer` now owns touch-versus-drawing and recognized-shape
guidance and emits both through its existing typed action stream. `WorkspaceApp`
retains inspector status routing, canonical refreshes, saved-selection handling,
note composition, and completion notification policy.

This checkpoint reduces `src/client/app.ts` from 3,810 to 3,799 lines (-11) and
the markup owner from 692 to 683 lines (-9), for a 20-line runtime source
reduction. Its focused test decreases from 478 to 475 lines while asserting the
status-bearing action contract. Eight focused and ten related tests pass through
the affected guardrails alongside formatting, lint, and strict types.

The browser application artifact changes from 822,140 B raw / 222,608 B gzip
to 821,989 B raw / 222,563 B gzip (-151 B raw / -45 B gzip). Styles, direct and
unique production package counts, and the readability audit remain unchanged
at 135,411 B raw / 23,373 B gzip, 18, 150, and 249 externally visible low-level
component members.

Full native CI passes all 1,584 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Editor Syntax Templates

`EditorInsertMenu` now owns the scholarly syntax templates it displays and
emits each template with its typed syntax choice. `WorkspaceApp` retains only
passage-aware link adaptation, collaborative selection resolution, and the Yjs
edit and focus consequences.

This checkpoint reduces `src/client/app.ts` from 3,828 to 3,810 lines (-18) and
grows the editor Insert menu from 100 to 105 lines (+5), for a 13-line runtime
source reduction. Its focused test grows from 58 to 64 lines (+6) to assert the
template-bearing event contract, leaving the full runtime and focused-test
boundary seven lines smaller. Two focused and four related tests pass through
the affected guardrails alongside formatting, lint, and strict types.

The browser application artifact changes from 822,241 B raw / 222,667 B gzip
to 822,140 B raw / 222,608 B gzip (-101 B raw / -59 B gzip). Styles, direct and
unique production package counts, and the readability audit remain unchanged
at 135,411 B raw / 23,373 B gzip, 18, 150, and 249 externally visible low-level
component members.

Full native CI passes all 1,584 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Shared Workflow File Opening

`WorkspaceApp` now uses one lazy workflow-file opener for the research diary,
research questions, and reviewer-response ledger. Existing files still select
and focus directly, while missing files defer template construction until the
shared project-file creation and navigation path needs it.

This checkpoint reduces `src/client/app.ts` from 3,844 to 3,828 lines (-16)
without changing another source or test module. The affected guardrails pass
formatting, lint, strict types, and all 1,584 unit/coverage tests.

The browser application artifact changes from 822,468 B raw / 222,699 B gzip
to 822,241 B raw / 222,667 B gzip (-227 B raw / -32 B gzip). Styles, direct and
unique production package counts, and the readability audit remain unchanged
at 135,411 B raw / 23,373 B gzip, 18, 150, and 249 externally visible low-level
component members.

Full native CI passes all 1,584 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Workspace Coordinator One-Use Derivations

`WorkspaceApp` now keeps four bounded expressions at their only call sites:
automatic preview-sync availability, private-Library reference routing,
project-reference PDF visibility, and active-PDF resource availability. This
removes one-use class methods without changing component ownership or
cross-feature coordination.

This checkpoint reduces `src/client/app.ts` from 3,864 to 3,844 lines (-20)
without changing another source or test module. The affected guardrails pass
formatting, lint, strict types, and all 1,584 unit/coverage tests.

The browser application artifact changes from 822,603 B raw / 222,746 B gzip
to 822,468 B raw / 222,699 B gzip (-135 B raw / -47 B gzip). Styles, direct and
unique production package counts, and the readability audit remain unchanged
at 135,411 B raw / 23,373 B gzip, 18, 150, and 249 externally visible low-level
component members.

Full native CI passes all 1,584 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project File Dialog Targets

`ProjectFileDialog` now derives rename availability, initial paths, and stable
file or folder targets from its operation and canonical resource inputs.
`WorkspaceApp` retains collaborative include-target capture and the canonical
snapshot, selection, rendering, deletion-grace, and toast consequences.

This checkpoint reduces `src/client/app.ts` from 3,891 to 3,864 lines (-27) and
grows the project-file dialog from 214 to 220 lines (+6), for a 21-line runtime
source reduction. Its focused test grows from 197 to 213 lines (+16) to cover
file, folder, creating, and unavailable-resource derivation, leaving the full
runtime and focused-test boundary five lines smaller. Eleven focused and 13
related tests pass through the affected guardrails alongside formatting, lint,
and strict types.

The browser application artifact changes from 822,705 B raw / 222,768 B gzip
to 822,603 B raw / 222,746 B gzip (-102 B raw / -22 B gzip). Styles, direct and
unique production package counts, and the readability audit remain unchanged
at 135,411 B raw / 23,373 B gzip, 18, 150, and 249 externally visible low-level
component members.

Full native CI passes all 1,584 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project History Browser Effects

`ProjectHistoryDialog` now owns canonical successful branch navigation and
post-restore reload after its existing request validation and local state
updates. It emits only user-facing notices for `WorkspaceApp` to present as
global toasts, and its internal close lifecycle no longer dispatches an unused
external event.

This checkpoint reduces `src/client/app.ts` from 3,897 to 3,891 lines (-6), the
project-history dialog from 221 to 215 lines (-6), and its focused test from 216
to 206 lines (-10). Runtime and focused test source across the three changed
files decreases by 22 lines. Five focused and seven related tests pass through
the affected guardrails alongside formatting, lint, and strict types.

The browser application artifact changes from 823,042 B raw / 222,819 B gzip
to 822,705 B raw / 222,768 B gzip (-337 B raw / -51 B gzip). Styles, direct and
unique production package counts, and the readability audit remain unchanged
at 135,411 B raw / 23,373 B gzip, 18, 150, and 249 externally visible low-level
component members.

Full native CI passes all 1,583 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Reviewer-Response Export

`WritingWorkflowPanel` now derives the response-to-reviewers letter from its
supplied canonical matrix and owns the browser-local Markdown download behind
its own Export control. It emits only the resulting notice; `WorkspaceApp`
retains workflow-file creation, source navigation, and toast policy.

This checkpoint reduces `src/client/app.ts` from 3,913 to 3,897 lines (-16).
Production source across the app and component decreases by five lines. The
focused test grows from 110 to 118 lines (+8) to assert the new download boundary,
for a three-line increase across all three files. Three focused and five affected
tests pass alongside strict types.

The browser application artifact changes from 823,008 B raw / 222,848 B gzip
to 823,042 B raw / 222,819 B gzip (+34 B raw / -29 B gzip). Styles, direct and
unique production package counts, and the readability audit remain unchanged
at 135,411 B raw / 23,373 B gzip, 18, 150, and 249 externally visible low-level
component members.

Full native CI passes all 1,583 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Source Completion Library Loading

`SourceCompletion` now owns its private-Library request, response validation,
duplicate-load guard, and successful-result cache when the browser-local Library
scope is active. Scope changes rerender locally, so the component emits only the
selected citation or include intent; `WorkspaceApp` retains private-Library
linking, collaborative Yjs edits, caret restoration, and canonical project
inputs.

This checkpoint reduces `src/client/app.ts` from 3,936 to 3,913 lines (-23).
Production source across the app and component decreases by nine lines. The
focused test grows from 196 to 215 lines (+19) to cover the newly owned fetch,
validation, and cache lifecycle, for a ten-line increase across all three files.
Six focused and eight affected tests pass alongside strict types.

The browser application artifact changes from 823,017 B raw / 222,877 B gzip
to 823,008 B raw / 222,848 B gzip (-9 B raw / -29 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,411 B raw / 23,373 B
gzip, 18, and 150. The readability audit improves from 250 to 249 externally
visible low-level component members after the scope-change event contract is
removed.

Full native CI passes all 1,583 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Workspace Settings Navigation

`WorkspaceSettingsPanel` now owns navigation after its settings-save,
duplication, and permanent-deletion requests. Its typed outcome union retains
only save-as-template and catalog-refresh work that genuinely crosses component
boundaries, removing the coordinator's navigation branch.

This checkpoint reduces `src/client/app.ts` from 3,937 to 3,936 lines (-1), the
workspace settings panel from 356 to 353 lines (-3), and its focused test from
239 to 235 lines (-4). Runtime and focused test source across the three changed
files decreases by eight lines. Five focused and seven affected tests pass
alongside strict types.

The browser application artifact changes from 823,127 B raw / 222,905 B gzip
to 823,017 B raw / 222,877 B gzip (-110 B raw / -28 B gzip). Styles, direct and
unique production package counts, and the readability audit remain unchanged
at 135,411 B raw / 23,373 B gzip, 18, 150, and 250 externally visible low-level
component members.

Full native CI passes all 1,583 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Starting-Point Navigation

`ProjectStartingPointBrowser` now navigates directly to the validated project-
creation response's canonical workspace href. The completion event and
`WorkspaceApp` listener are removed; import handoff, deferred deletion and Undo,
and cross-feature policy remain coordinated outside the component.

This checkpoint reduces `src/client/app.ts` from 3,945 to 3,937 lines (-8), the
starting-point browser from 518 to 517 lines (-1), and its focused test from 328
to 323 lines (-5). Runtime and focused test source across the three changed
files decreases by fourteen lines. Eight focused and ten affected tests pass
alongside strict types.

The browser application artifact changes from 823,275 B raw / 222,921 B gzip
to 823,127 B raw / 222,905 B gzip (-148 B raw / -16 B gzip). Styles, direct and
unique production package counts, and the readability audit remain unchanged
at 135,411 B raw / 23,373 B gzip, 18, 150, and 250 externally visible low-level
component members.

Full native CI passes all 1,583 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: GitHub Import Navigation

`GitHubImportPanel` now navigates directly to the successful import response's
canonical workspace href after validating that response through the existing
Valibot boundary. The completion event and `WorkspaceApp` listener are removed;
the coordinator continues to own opening the workflow and cross-feature policy.

This checkpoint reduces `src/client/app.ts` from 3,949 to 3,945 lines (-4) and
the GitHub import panel from 546 to 544 lines (-2). Runtime and focused test
source across the three changed files decreases by six lines. Eight focused and
ten affected tests pass alongside strict types.

The browser application artifact changes from 823,413 B raw / 222,946 B gzip
to 823,275 B raw / 222,921 B gzip (-138 B raw / -25 B gzip). Styles, direct and
unique production package counts, and the readability audit remain unchanged
at 135,411 B raw / 23,373 B gzip, 18, 150, and 250 externally visible low-level
component members.

Full native CI passes all 1,583 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: LaTeX Import Navigation

`LatexImportPanel` now navigates directly to the successful import response's
canonical workspace href. The completion event and `WorkspaceApp` listener are
removed; the coordinator continues to own opening the workflow while the panel
retains its request, response-validation, dialog, and failure lifecycles.

This checkpoint reduces `src/client/app.ts` from 3,953 to 3,949 lines (-4) and
the LaTeX import panel from 325 to 319 lines (-6). Runtime and focused test
source across the three changed files decreases by ten lines. Five focused and
seven affected tests pass alongside strict types.

The browser application artifact changes from 823,593 B raw / 222,967 B gzip
to 823,413 B raw / 222,946 B gzip (-180 B raw / -21 B gzip). Styles, direct and
unique production package counts, and the readability audit remain unchanged
at 135,411 B raw / 23,373 B gzip, 18, 150, and 250 externally visible low-level
component members.

Full native CI passes all 1,583 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Workspace Switcher Navigation

`WorkspaceSwitcher` now resolves a changed selection against its supplied
authorized catalog and navigates through that entry's canonical href. The
selection event and `WorkspaceApp` listener are removed, along with duplicate
route construction; empty, active, and non-catalog values remain inert.

This checkpoint reduces `src/client/app.ts` from 3,957 to 3,953 lines (-4).
Runtime and focused test source across the three changed files decreases by
three lines. Two focused and four affected tests pass alongside strict types.

The browser application artifact changes from 823,738 B raw / 222,983 B gzip
to 823,593 B raw / 222,967 B gzip (-145 B raw / -16 B gzip). Styles, direct and
unique production package counts, and the readability audit remain unchanged
at 135,411 B raw / 23,373 B gzip, 18, 150, and 250 externally visible low-level
component members.

Full native CI passes all 1,583 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Assistant Evidence Projection

`AssistantWorkflowStatus` now resolves its ordered selected evidence keys
against canonical annotations and claims and projects the model prompt items and
version references. `WorkspaceApp` retains canonical snapshot availability,
operation policy, provider requests, workflow transitions, and candidate
persistence.

This checkpoint reduces `src/client/app.ts` from 4,389 to 4,345 lines (-44) and
grows the assistant workflow-status owner from 110 to 154 lines. Runtime source
across those two files is unchanged while deleting two coordinator-only append
methods and the global evidence-key parser. Focused coverage passes selection
order, annotation and claim wording, optional context and notes, missing
resources, reconciliation, existing presentation, application contracts, and
strict types.

The browser application artifact changes from 824,520 B raw / 222,614 B gzip
to 824,436 B raw / 222,650 B gzip (-84 B raw / +36 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,574 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Assistant Start Status

`AssistantWorkflowStatus` now owns operation-specific generation-start wording
for claim drafting, clarity drills, and the remaining candidate operations.
`WorkspaceApp` retains workflow transitions, generation dispatch, failure
handling, and result-specific status policy.

This checkpoint reduces `src/client/app.ts` from 4,336 to 4,330 lines (-6) and
grows the assistant workflow-status owner from 162 to 172 lines. Runtime source
across those two files increases by four lines while deleting the
coordinator-only start-message helper. Focused coverage passes all three start
wording branches, existing operation and evidence presentation, application
contracts, and strict types.

The browser application artifact changes from 824,460 B raw / 222,664 B gzip
to 824,481 B raw / 222,688 B gzip (+21 B raw / +24 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,574 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Annotation Evidence Subsets

`AssistantWorkflowStatus` now returns the ordered annotation-only prompt items
and version references alongside its complete selected-evidence projection.
`WorkspaceApp` retains claim-draft requirements, generation policy, provider
requests, workflow transitions, and persistence.

This checkpoint reduces `src/client/app.ts` from 4,345 to 4,336 lines (-9) and
grows the assistant workflow-status owner from 154 to 162 lines. Runtime source
across those two files decreases by one line while deleting the coordinator's
two annotation filters, type guard, and duplicate generation-context fields.
Focused coverage passes mixed-order projection, annotation-only subsets,
missing resources, optional context and notes, claim-draft generation
contracts, application contracts, and strict types.

The browser application artifact changes from 824,436 B raw / 222,650 B gzip
to 824,460 B raw / 222,664 B gzip (+24 B raw / +14 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,574 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Citation Availability

`ProjectAnnotationForm` now derives its citation count, label, and availability
from the active PDF and canonical publication-PDF links. `WorkspaceApp` retains
active-tab selection, publication lookup, citation insertion, authoring caret,
and notification policy.

This checkpoint reduces `src/client/app.ts` from 4,392 to 4,389 lines (-3)
without growing the 362-line project-annotation owner. Runtime source across
those two files decreases by three lines while deleting the coordinator-only
publication-link filter. Focused coverage passes matching and unrelated links,
no active PDF, existing capture and save behavior, application contracts, and
strict types.

The browser application artifact changes from 824,533 B raw / 222,600 B gzip
to 824,520 B raw / 222,614 B gzip (-13 B raw / +14 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,573 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Annotation Capture Feedback

`ProjectAnnotationForm` now derives paint-versus-erase selection feedback,
captured line count, and page wording from its local tool and canonical capture.
`WorkspaceApp` retains PDF gesture routing, overlap derivation, persistence,
viewer draft clearing, canonical refresh, and notification policy.

This checkpoint reduces `src/client/app.ts` from 4,397 to 4,392 lines (-5) and
grows the project-annotation owner from 358 to 362 lines. Runtime source across
those two files decreases by one line while deleting the coordinator's tool and
pluralization presentation branch. Focused coverage passes paint, erase,
existing capture and save behavior, application contracts, and strict types.

The browser application artifact changes from 824,595 B raw / 222,606 B gzip
to 824,533 B raw / 222,600 B gzip (-62 B raw / -6 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,573 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Authoring Target Status

`EditorStatus` now owns bounded line counting and file, line-range, caret, and
selection wording from canonical source and resolved target inputs.
`WorkspaceApp` retains Yjs relative-position resolution, editor highlighting,
assistant target refresh, collaboration interpretation, and offline-save policy.

This checkpoint reduces `src/client/app.ts` from 4,449 to 4,432 lines (-17) and
grows the editor-status owner from 53 to 70 lines. Runtime source across those
two files is unchanged while deleting the coordinator-only line-count helper and
all authoring-status presentation branches. Focused coverage passes no-target,
single-line caret, multi-line selection, existing save presentation, application
contracts, and strict types.

The browser application artifact changes from 824,420 B raw / 222,534 B gzip
to 824,369 B raw / 222,551 B gzip (-51 B raw / +17 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,572 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Publication Paper Projection

`PublicationContextPanel` now derives available project PDFs and ordered
private-Library, shared-reference, and project paper options from canonical
inputs. It also owns duplicate shared-reference suppression when the same
private artifact is locally available. `WorkspaceApp` retains canonical
snapshots, authorization, refresh, citation insertion, paper navigation, and
workspace notification policy.

This checkpoint reduces `src/client/app.ts` from 4,487 to 4,468 lines (-19) and
grows the publication-context owner from 259 to 284 lines. Runtime source across
those two files increases by six lines while deleting the coordinator's
publication-specific paper mapper. Focused coverage passes project-only,
private-Library, shared-reference, duplicate-suppression, availability, existing
mutation and presentation behavior, application contracts, and strict types.

The browser application artifact changes from 824,259 B raw / 222,443 B gzip
to 824,296 B raw / 222,485 B gzip (+37 B raw / +42 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,571 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Valibot Adoption: GitHub User Responses

The GitHub user client now validates external identity, installation/account,
repository, and branch payloads with named Valibot schemas. The transport keeps
bounded response reads, pagination ceilings, OAuth input rules, token-expiry
projection, and stable integration error mapping explicit.

This checkpoint reduces `src/integrations/github-user.ts` from 295 to 261 lines
(-34), replacing four nested handwritten response guards, two structural
parsers, and four primitive predicates. The existing focused suite passes all
14 direct GitHub-user cases; affected integration coverage passes 79 tests and
all 120 Workers-runtime tests alongside strict types.

Browser application and style artifacts remain unchanged at 824,259 B raw /
222,443 B gzip and 135,411 B raw / 23,373 B gzip because this boundary is
server-side. Direct and unique production package counts remain 18 and 150;
Valibot was already pinned and shipped elsewhere.

Full native CI passes all 1,571 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Completed Valibot Adoption: GitHub OAuth Responses

The GitHub user client now validates OAuth token and provider-error payloads
with named Valibot schemas as well. This removes its final generic record
predicate and gives every GitHub identity, installation, repository, branch,
token, and error response one consistent external-data boundary.

This completion grows `src/integrations/github-user.ts` from 261 to 264 lines
(+3) in exchange for replacing the last handwritten structural checks. The
existing affected integration suite passes all 79 cases and all 120 Workers-
runtime tests alongside strict types.

Browser application and style artifacts remain unchanged at 835,394 B raw /
225,724 B gzip and 135,411 B raw / 23,373 B gzip because this boundary is
server-side. Direct and unique production package counts remain 18 and 150;
Valibot was already pinned.

Full native CI passes all 1,654 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Preview Status Projection

`PreviewContextStatus` now derives composed-versus-isolated file labels,
combined composition and Markdown-renderer issue counts, and unavailable-state
wording from canonical preview inputs. `WorkspaceApp` retains composition,
renderer loading and recovery, rendered output, source maps, and diagnostic
navigation coordination.

This checkpoint reduces `src/client/app.ts` from 4,402 to 4,397 lines (-5) and
grows the shared preview-presentation owner from 154 to 162 lines. Runtime
source across those two files increases by three lines while deleting three
coordinator presentation branches. Focused coverage passes composed, singular,
plural, clean, unavailable, mapped and fallback diagnostic states, application
contracts, and strict types.

The browser application artifact changes from 824,524 B raw / 222,609 B gzip
to 824,595 B raw / 222,606 B gzip (+71 B raw / -3 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,573 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Valibot Adoption: Review Catalog Commands

The review catalog API now validates creation, settings, membership, optional
synthesis-publish link, and project-link requests with named Valibot schemas.
Immutable-profile policy, normalized identities, authorization, project access,
and multi-catalog projection remain explicit.

This checkpoint removes the API's generic record predicate and five repeated
record-and-primitive validation branches. `src/api/reviews.ts` changes from 582
to 591 lines (+9) because the bounded schemas name each accepted command shape;
the maintained runtime contract is centralized even though physical lines grow.
Affected coverage passes 94 tests and all 121 Workers-runtime tests alongside
strict types. Browser artifacts are unchanged because this boundary is server-
side. Direct and unique production package counts remain 18 and 150; Valibot
was already pinned.

## Continued Valibot Adoption: Review-Study Decisions

The review-study API now composes screening, final-inclusion, adjudication, and
duplicate-resolution requests from shared safe-revision, screening-stage,
outcome, and nullable-criterion schemas. Concurrency, actor identity, evidence
authorization, and Durable Object mutation remain explicit.

This checkpoint reduces `src/api/review-study.ts` from 702 to 659 lines (-43),
replacing four repeated record, safe-integer, enum, string, and nullable-string
validation branches with named contracts and one schema parser. Affected
coverage passes 94 tests and all 121 Workers-runtime tests alongside strict
types. Browser artifacts are unchanged because this boundary is server-side.
Direct and unique production package counts remain 18 and 150; Valibot was
already pinned.

## Continued Valibot Adoption: Review Evidence Values

The review-study API now validates quality answers, extraction values, and
reassessment completions with named schemas that reuse the safe-revision
primitive. Existing evidence and extraction parsers retain domain shape rules,
and evidence authorization and study mutation remain explicit.

This checkpoint reduces `src/api/review-study.ts` from 659 to 648 lines (-11),
replacing 33 lines of repeated structural checks and normalization with 22
lines of composable contracts. Affected coverage passes 94 tests and all 121
Workers-runtime tests alongside strict types. Browser artifacts are unchanged
because this boundary is server-side. Direct and unique production package
counts remain 18 and 150; Valibot was already pinned.

## Continued Lit Ownership: Editor Insertions

`EditorInsertMenu` now owns passage-aware link adaptation, replacement and
selection-range projection, relative-include notices, and image-template
insertion from a resolved authoring target. `WorkspaceApp` retains Yjs mutation,
collaborative target resolution, editor focus, and the global toast outlet.

This checkpoint reduces `src/client/app.ts` from 932 to 916 lines (-16) and
grows the editor Insert-menu owner from 118 to 155 lines (+37). Runtime across
the pair grows by 21 lines because the typed insertion contract names all five
range fields, while deleting three coordinator methods and keeping the
canonical mutation boundary explicit. Focused coverage passes menu rendering,
syntax selection, selected-passage links, include notices, image templates, and
strict types. Direct and unique production package counts remain 18 and 150;
Lit was already pinned.

The browser application artifact changes from 852,473 B raw / 229,680 B gzip
to 852,830 B / 229,806 B (+357 B raw / +126 B gzip). Styles and lazy Markdown
and PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B /
62,386 B, and 481,994 B / 146,135 B.

Full native CI passes all 1,734 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Citation Insertion

`SourceCitationControl` now owns citation-at-caret state, canonical citation
syntax projection, missing-caret and invalid-key wording, and insertion
completion copy. `WorkspaceApp` retains the Yjs transaction, authoring-mode and
caret consequences, publication resolution, and cross-resource navigation.

This checkpoint reduces `src/client/app.ts` from 916 to 906 lines (-10) and
grows the source-citation owner from 57 to 85 lines (+28). Runtime across the
pair grows by 18 lines to name the insertion capability and keep mutation
authority explicit, while deleting the coordinator's citation projection and
presentation branches. Focused coverage passes citation navigation, locator
propagation, successful insertion, missing-caret and invalid-key behavior, and
strict types. Direct and unique production package counts remain 18 and 150;
Lit was already pinned.

The browser application artifact changes from 852,830 B raw / 229,806 B gzip
to 853,096 B / 229,870 B (+266 B raw / +64 B gzip). Styles and lazy Markdown
and PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B /
62,386 B, and 481,994 B / 146,135 B.

Full native CI passes all 1,736 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Completed Lit Ownership: Explicit Passage Insertion

`EditorInsertMenu` now routes an approved assistant table through the same typed
replacement and caret projection used by menu and image insertions.
`WorkspaceApp` retains the Yjs mutation callback and editor focus consequence.

This checkpoint reduces `src/client/app.ts` from 906 to 898 lines (-8), grows
the editor insertion owner from 155 to 159 lines (+4), and reduces runtime
across the pair by four lines. It deletes the final coordinator method that
repeated explicit passage replacement, focus, and caret calculation. Focused
coverage passes editor insertion and assistant generation behavior alongside
strict types. Direct and unique production package counts remain 18 and 150;
Lit was already pinned.

The browser application artifact changes from 853,096 B raw / 229,870 B gzip
to 853,054 B / 229,862 B (-42 B raw / -8 B gzip). Styles and lazy Markdown and
PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B / 62,386
B, and 481,994 B / 146,135 B.

Full native CI passes all 1,736 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Source Completion Application

`SourceCompletion` now dismisses itself immediately on acceptance, and
`EditorInsertMenu` applies its selected explicit replacement range through the
existing typed mutation capability. `WorkspaceApp` retains private-Library
reference linking, relative Yjs range preservation across that mutation, and
canonical Yjs authority.

This checkpoint reduces `src/client/app.ts` from 898 to 890 lines (-8), grows
the completion and insertion owners by two and five lines, and reduces runtime
across all three files by one line. It deletes the coordinator's generic source-
completion mutation, focus, and caret helper. Focused coverage passes immediate
acceptance dismissal, citation and include ranges, insertion projection, and
strict types. Direct and unique production package counts remain 18 and 150;
Lit was already pinned.

The browser application artifact changes from 853,054 B raw / 229,862 B gzip
to 853,101 B / 229,877 B (+47 B raw / +15 B gzip). Styles and lazy Markdown
and PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B /
62,386 B, and 481,994 B / 146,135 B.

Full native CI passes all 1,736 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Asynchronous Authoring Range

`EditorStatus` now preserves an explicit authoring range as Yjs-relative
positions across an asynchronous operation and resolves it only while the same
document and active text remain bound. `WorkspaceApp` uses that capability for
private-Library citation completion while retaining the request, canonical
snapshot refresh, and Yjs mutation.

This checkpoint reduces `src/client/app.ts` from 890 to 887 lines (-3) and grows
the editor-status owner from 145 to 159 lines (+14). Runtime across the pair
grows by 11 lines to centralize relative-position creation, resolution, and
active-text invalidation with the component that already owns the authoring
target. Focused coverage passes shifted-range restoration, active-text
invalidation, existing authoring-target behavior, and strict types. Direct and
unique production package counts remain 18 and 150; Lit and Yjs were already
pinned.

The browser application artifact changes from 853,101 B raw / 229,877 B gzip
to 853,318 B / 229,932 B (+217 B raw / +55 B gzip). Styles and lazy Markdown
and PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B /
62,386 B, and 481,994 B / 146,135 B.

Full native CI passes all 1,737 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Direct Owner Calls

`WorkspaceApp` callers now present notices through the existing `AppToast`
owner and restore standalone Library routes through `ReferenceLibraryWorkspace`
directly. The removed coordinator methods only forwarded their arguments and
added no policy, validation, or sequencing.

This checkpoint reduces `src/client/app.ts` from 887 to 878 lines (-9) without
growing another runtime module. Canonical message selection, navigation policy,
workspace routing, and shared mutation authority remain in the coordinator;
only redundant Lit-owner indirection is gone. Strict types pass. Direct and
unique production package counts remain 18 and 150; Lit was already pinned.

The browser application artifact changes from 853,318 B raw / 229,932 B gzip
to 853,556 B / 229,922 B (+238 B raw / -10 B gzip). Styles and lazy Markdown
and PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B /
62,386 B, and 481,994 B / 146,135 B.

Full native CI passes all 1,737 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Active Source Binding

`EditorStatus` now owns the active Yjs-text/source-editor binding, listener and
observer replacement when the active file changes, per-text undo managers,
external text synchronization, assistant-staleness observation, and local plus
collaborator presence projection. `WorkspaceApp` supplies remote ranges and
cross-feature callbacks, retains canonical Yjs transactions, and uses the Lit
owner as their authoring mutation origin so derived insertions remain undoable.

This checkpoint reduces `src/client/app.ts` from 878 to 845 lines (-33) and
grows the editor-status owner from 159 to 209 lines (+50). Runtime across the
pair grows by 17 lines to replace four coordinator lifecycle fields and a split
binding method with one typed owner binding and tested teardown boundary.
Focused coverage passes active-text switching, old-observer detachment, new-text
synchronization, collaborator-presence reads, owner-origin undo, existing
relative selections, source-adapter behavior, and strict types. Direct and
unique production package counts remain 18 and 150; Lit and Yjs were already
pinned.

The browser application artifact changes from 853,556 B raw / 229,922 B gzip
to 854,036 B / 230,005 B (+480 B raw / +83 B gzip). Styles and lazy Markdown
and PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B /
62,386 B, and 481,994 B / 146,135 B.

Full native CI passes all 1,738 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Valibot Boundary: Application Bootstrap

The shared browser contract module now validates the server-rendered workspace
id, identity email, and explicit workspace/Library mode as one inferred
Valibot-backed bootstrap value. `WorkspaceApp` consumes that validated value and
no longer maintains three local dataset readers or silently maps an unsupported
mode to the workspace surface.

This checkpoint reduces `src/client/app.ts` from 845 to 828 lines (-17), grows
`src/client/app-contracts.ts` from 245 to 257 lines (+12), and reduces runtime
across the pair by five lines. Focused coverage passes valid workspace and
Library bootstraps plus missing, malformed, overlong, and unsupported values;
affected guardrails pass 130 related tests and strict types. Direct and unique
production package counts remain 18 and 150; Valibot was already pinned.

The browser application artifact decreases from 854,036 B raw / 230,005 B gzip
to 853,954 B / 229,856 B (-82 B raw / -149 B gzip). Styles and lazy Markdown
and PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B /
62,386 B, and 481,994 B / 146,135 B.

Full native CI passes all 1,739 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Immediate Include Projection

`EditorInsertMenu` now projects an immediate relative-file choice into its full
include directive and collapsed post-insertion caret through the existing typed
insertion binding. `WorkspaceApp` retains Yjs mutation and the separate
cross-file continuation that must preserve an original text and caret while a
new file is created asynchronously.

This checkpoint reduces `src/client/app.ts` from 828 to 824 lines (-4), grows
the Insert owner from 164 to 165 lines (+1), and reduces runtime across the pair
by three lines. Focused coverage passes the exact relative directive, caret,
notice, other menu projections, and strict types. Direct and unique production
package counts remain 18 and 150; Lit was already pinned.

The browser application artifact decreases from 853,954 B raw / 229,856 B gzip
to 853,928 B / 229,850 B (-26 B raw / -6 B gzip). Styles and lazy Markdown and
PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B / 62,386
B, and 481,994 B / 146,135 B.

Full native CI passes all 1,739 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Authoring Mutation Application

`EditorStatus` now applies bounded text replacements and insertions, uses itself
as their Yjs origin, and focuses and selects the resulting range when the target
is the active source. `WorkspaceApp` retains mutation decisions, cross-file path
projection, asynchronous continuation, navigation, and collaboration policy.

This checkpoint reduces `src/client/app.ts` from 824 to 806 lines (-18), grows
the editor-status owner from 209 to 231 lines (+22), and reduces the Insert-menu
type surface from 165 to 159 lines (-6) by sharing the insertion contract. The
combined runtime and contract surface decreases by two lines. Focused coverage
passes active and background text insertion, focus, caret placement, per-file
undo, the Insert menu and citation control, plus strict types. Direct and unique
production package counts remain 18 and 150; Lit and Yjs were already pinned.

The browser application artifact decreases from 853,928 B raw / 229,850 B gzip
to 853,905 B / 229,836 B (-23 B raw / -14 B gzip). Styles and lazy Markdown and
PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B / 62,386
B, and 481,994 B / 146,135 B.

Full native CI passes all 1,739 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Preserved Include Caret

`EditorStatus` now captures a create-and-include caret as a Yjs-relative
position, resolves it after concurrent edits, applies the eventual insertion,
and rejects it if the active authoring text changed. `WorkspaceApp` supplies
only the selected file and project-relative include directive.

This checkpoint reduces `src/client/app.ts` from 806 to 798 lines (-8) and
grows the editor-status owner from 231 to 245 lines (+14). The six-line combined
increase replaces workflow-specific Yjs position handling with a reusable,
tested owner boundary. Focused coverage passes concurrent position movement,
active-text invalidation, insertion and undo behavior, project-file workflows,
and strict types. Direct and unique production package counts remain 18 and
150; Lit and Yjs were already pinned.

The browser application artifact increases from 853,905 B raw / 229,836 B gzip
to 854,017 B / 229,878 B (+112 B raw / +42 B gzip). Styles and lazy Markdown
and PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B /
62,386 B, and 481,994 B / 146,135 B.

Full native CI passes all 1,740 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Remote Selection Continuity

`EditorStatus` now captures and restores Yjs-relative selections around remote
collaboration updates for both its active source and supplied companion editors.
`WorkspaceApp` gives the collaboration socket one owner-produced restoration
closure instead of maintaining separate capture and restore methods.

This checkpoint reduces `src/client/app.ts` from 798 to 780 lines (-18) and
grows the editor-status owner from 245 to 265 lines (+20). The two-line combined
increase consolidates relative resolution, selection direction, and authoring-
target refresh in the component that owns editor selection state. Focused
coverage passes active and bibliography selection movement plus collaboration-
socket behavior and strict types. Direct and unique production package counts
remain 18 and 150; Lit and Yjs were already pinned.

The browser application artifact increases from 854,017 B raw / 229,878 B gzip
to 854,127 B / 229,900 B (+110 B raw / +22 B gzip). Styles and lazy Markdown
and PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B /
62,386 B, and 481,994 B / 146,135 B.

Full native CI passes all 1,741 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Created Include Projection

`ProjectFileDialog` now derives a create-and-include directive from its active
file and newly created path before invoking the editor-status insertion
continuation. `WorkspaceApp` supplies only that preserved insertion function
and no longer imports or applies project-relative path logic.

This checkpoint reduces `src/client/app.ts` from 780 to 777 lines (-3), grows
the project-file dialog from 491 to 493 lines (+2), and removes one combined
runtime line. Focused and affected coverage pass exact relative directive
projection, dialog workflow ordering, editor insertion continuity, and strict
types. Direct and unique production package counts remain 18 and 150; Lit was
already pinned.

The browser application artifact decreases from 854,127 B raw / 229,900 B gzip
to 854,117 B / 229,888 B (-10 B raw / -12 B gzip). Styles and lazy Markdown and
PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B / 62,386
B, and 481,994 B / 146,135 B.

Full native CI passes all 1,741 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Companion Editor Binding

`EditorStatus` now registers and binds the bibliography as a companion Yjs
textarea and automatically includes it in remote selection continuity.
`WorkspaceApp` no longer imports the source-editor adapter or supplies the same
companion on every remote update.

This checkpoint reduces `src/client/app.ts` from 777 to 775 lines (-2) and
grows the editor-status owner from 265 to 273 lines (+8). The six-line combined
increase colocates companion synchronization and relative-selection continuity
behind one owner registration. Focused coverage passes companion Yjs binding,
active and bibliography selection movement, collaboration-socket behavior, and
strict types. Direct and unique production package counts remain 18 and 150;
Lit and Yjs were already pinned.

The browser application artifact increases from 854,117 B raw / 229,888 B gzip
to 854,220 B / 229,899 B (+103 B raw / +11 B gzip). Styles and lazy Markdown
and PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B /
62,386 B, and 481,994 B / 146,135 B.

Full native CI passes all 1,741 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Passage-Link Policy

`ContextResourcePresenter` now consumes the authoring-state source it already
shares with manuscript comments, rejects claim and evidence links while the
document is unstable or no passage is selected, and delegates validated link
transport to its composed claim or evidence owner. `WorkspaceApp` supplies one
canonical authoring projection and no longer owns the policy or child routing.

This checkpoint reduces `src/client/app.ts` from 775 to 759 lines (-16), grows
the context-resource presenter from 1,183 to 1,200 lines (+17), and adds one
combined runtime line to consolidate policy shared by three resource families.
Focused coverage passes stable claim and evidence links, synchronization and
missing-selection guards, comment authoring, child mutation routes, and strict
types. Direct and unique production package counts remain 18 and 150; Lit was
already pinned.

The browser application artifact increases from 854,220 B raw / 229,899 B gzip
to 854,312 B / 229,963 B (+92 B raw / +64 B gzip). Styles and lazy Markdown and
PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B / 62,386
B, and 481,994 B / 146,135 B.

Full native CI passes all 1,742 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Bound Project Preview

`WorkspacePreview` now binds the canonical Yjs document, snapshot source,
project-file owner, and hidden-asset owner once. It derives live source and
bibliography text, active and visible files, resolved snapshot anchors, and the
complete render request whenever preview refresh is requested. `WorkspaceApp`
no longer rebuilds that projection or owns a preview-render helper.

This checkpoint reduces `src/client/app.ts` from 759 to 746 lines (-13) and
grows the workspace Preview owner from 403 to 440 lines (+37). The 24-line
combined increase makes the existing renderer's canonical inputs explicit and
testable at its ownership boundary, replacing repeated coordinator knowledge.
Focused and affected coverage pass default and bootstrap bibliography, live Yjs
source, active files, hidden assets, resolved anchors, companion projection, and
strict types. Direct and unique production package counts remain 18 and 150;
Lit and Yjs were already pinned.

The browser application artifact increases from 854,312 B raw / 229,963 B gzip
to 855,000 B / 230,058 B (+688 B raw / +95 B gzip). Styles and lazy Markdown
and PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B /
62,386 B, and 481,994 B / 146,135 B.

Full native CI passes all 1,743 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Source-to-Preview Navigation

`WorkspacePreview` now derives source-to-Preview eligibility from its bound
active file, snapshot, context, split layout, and synchronization owner. It asks
that owner for mapped offsets and reveals its nearest matching DOM range.
`WorkspaceApp` no longer owns the eligibility projection or Preview navigation
helper; it retains only cross-direction file activation and editor focus.

This checkpoint reduces `src/client/app.ts` from 746 to 738 lines (-8) and grows
the workspace Preview owner from 440 to 458 lines (+18). The ten-line combined
increase moves Preview DOM policy beside the DOM it controls and reuses the
canonical sources bound in the preceding checkpoint. Focused coverage passes
unbound behavior, active-file and layout/context projection, mapped-offset
selection, reveal routing, and strict types. Direct and unique production
package counts remain 18 and 150; Lit was already pinned.

The browser application artifact increases from 855,000 B raw / 230,058 B gzip
to 855,108 B / 230,068 B (+108 B raw / +10 B gzip). Styles and lazy Markdown
and PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B /
62,386 B, and 481,994 B / 146,135 B.

Full native CI passes all 1,743 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Completion Acceptance

`SourceCompletion` now owns the complete selected-option transaction. It
applies relative includes immediately and, for a private-Library citation,
preserves the collaborative range, requests project linking, delegates
canonical snapshot application, resolves the range again, applies the citation,
and presents completion. `WorkspaceApp` supplies narrow mutation, range,
insertion, and notice capabilities instead of implementing the transaction.

This checkpoint reduces `src/client/app.ts` from 738 to 723 lines (-15) and
grows the source-completion owner from 309 to 347 lines (+38). The 23-line
combined increase makes asynchronous range preservation and linking behavior
part of the same owner as candidate loading and acceptance, with a narrow
capability boundary back to canonical project and editor authorities. Focused
coverage passes immediate includes, request projection, mutation delegation,
range re-resolution, replacement, completion notice, and strict types. Direct
and unique production package counts remain 18 and 150; Lit was already pinned.

The browser application artifact remains 855,108 B raw / 230,068 B gzip.
Styles and lazy Markdown and PDF.js artifacts also remain unchanged at 135,411
B / 23,373 B, 204,779 B / 62,386 B, and 481,994 B / 146,135 B.

Full native CI passes all 1,744 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Passage Navigation

`ContextResourcePresenter` now resolves incoming manuscript anchors for the
comment, claim, and evidence owners it already composes. It rejects stale
targets and selects exact-versus-changed passage feedback before delegating the
file-qualified selection effect. `WorkspaceApp` retains the canonical Yjs
document, file activation, editor selection, scrolling, and toast outlet.

This checkpoint reduces `src/client/app.ts` from 723 to 713 lines (-10) and
grows the context-resource presenter from 1,200 to 1,217 lines (+17). The
seven-line combined increase consolidates shared navigation policy beside the
same owner's passage-link validation and child routing. Focused coverage passes
stale, exact, and changed anchors, file-qualified range delegation, notice
selection, and strict types. Direct and unique production package counts remain
18 and 150; Lit, Yjs, and Valibot were already pinned.

The browser application artifact increases from 855,108 B raw / 230,068 B gzip
to 855,360 B / 230,103 B (+252 B raw / +35 B gzip). Styles and lazy Markdown
and PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B /
62,386 B, and 481,994 B / 146,135 B.

Full native CI passes all 1,745 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Workspace Routes

`WorkspaceSurfaceSwitcher` now binds canonical file, rail, authoring-mode,
context, layout, and surface state once. It owns route readiness, ordered URL
restoration, default-state elision through the existing pure adapter, canonical
URL comparison, and push-versus-replace history writes. `WorkspaceApp` supplies
the state and bounded restoration effects instead of implementing route policy.

This checkpoint reduces `src/client/app.ts` from 713 to 687 lines (-26) and
grows the surface-navigation owner from 76 to 147 lines (+71). The 45-line
combined increase makes the cross-control route contract explicit and tests
restoration ordering and history semantics outside the application coordinator.
Focused coverage passes enabled and disabled readiness, file, rail, mode,
context, layout, and surface restoration, canonical no-op comparison, history
projection, preserved unrelated parameters, and strict types. Direct and unique
production package counts remain 18 and 150; Lit was already pinned.

The browser application artifact increases from 855,360 B raw / 230,103 B gzip
to 855,398 B / 230,128 B (+38 B raw / +25 B gzip). Styles and lazy Markdown and
PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B / 62,386
B, and 481,994 B / 146,135 B.

Full native CI passes all 1,747 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Offline Application Shell

`ApplicationVersionControl` now derives its displayed build identity directly
from the offline shell and owns service-worker registration, update refresh
sequencing, workspace-navigation caching, ready projection, and fail-open
behavior. `WorkspaceApp` supplies only project persistence and pinned-update
presentation effects.

This checkpoint reduces `src/client/app.ts` from 687 to 672 lines (-15) and
grows the application-version owner from 84 to 102 lines (+18). The three-line
combined increase unifies build identity with the versioned shell lifecycle and
removes duplicated startup knowledge from the application coordinator. Focused
coverage passes registration and update checks, navigation caching, ready
projection, persist-before-reload ordering, failure tolerance, and strict
types. Direct and unique production package counts remain 18 and 150; Lit was
already pinned.

The browser application artifact increases from 855,398 B raw / 230,128 B gzip
to 856,080 B / 230,290 B (+682 B raw / +162 B gzip). Styles and lazy Markdown
and PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B /
62,386 B, and 481,994 B / 146,135 B.

Full native CI passes all 1,749 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Collaboration Presentation

`ConnectionStatus` now binds the collaboration workflow and authoring controls
once, deriving label/tone, source and companion editability, and assistant-
availability refresh. `ProjectHistoryTrigger` owns the monotonic presented
revision and routes revision-dependent collaborator data, highlighting, offline
scheduling, and candidate refresh through bound owners. `WorkspaceApp` no
longer keeps a duplicate revision field or presentation helpers.

This checkpoint reduces `src/client/app.ts` from 670 to 655 lines (-15), grows
the connection-status owner from 49 to 78 lines (+29), and grows the history
trigger from 47 to 81 lines (+34). The 48-line combined increase makes both
cross-feature presentation contracts explicit while preserving collaboration
transport, server revision authority, Yjs state, and persistence policy in
their existing owners. Focused coverage passes unbound behavior, editability,
availability refresh, monotonic revisions, collaborator projection, highlight
and offline consequences, candidate refresh, and strict types. Direct and
unique production package counts remain 18 and 150; Lit was already pinned.

The browser application artifact increases from 856,080 B raw / 230,290 B gzip
to 856,141 B / 230,349 B (+61 B raw / +59 B gzip). Styles and lazy Markdown and
PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B / 62,386
B, and 481,994 B / 146,135 B.

Full native CI passes all 1,751 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Bound Resource Presentation

`ContextResourcePresenter` now consumes the canonical project, Library, API,
assistant, and route sources already bound to it to reconcile authorization and
present the full workspace resource graph. It also owns bound linked-reference
PDF refresh with optional downstream presentation. `WorkspaceApp` retains
canonical snapshot acceptance, Library refresh timing, and mutation effects.

This checkpoint reduces `src/client/app.ts` from 655 to 640 lines (-15) and
grows the context-resource presenter from 1,217 to 1,236 lines (+19). The
four-line combined increase removes duplicate source projection and wrapper
methods from the application coordinator. Focused coverage passes bound catalog
transport, validation, authorization reconciliation, workspace fan-out,
context, assistant and route effects, unbound behavior, and strict types.
Direct and unique production package counts remain 18 and 150; Lit and Valibot
were already pinned.

The browser application artifact increases from 856,141 B raw / 230,349 B gzip
to 857,031 B / 230,658 B (+890 B raw / +309 B gzip). Styles and lazy Markdown
and PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B /
62,386 B, and 481,994 B / 146,135 B.

Full native CI passes all 1,752 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Ownership: Offline Persistence Session

One typed `OfflineWorkspaceSession` now binds the Valibot-validated store, Yjs
document, canonical snapshot and server-vector sources, availability guard, and
save outcomes. It owns document encoding, guarded debounced scheduling and
flush, restoration delegation, project-copy clearing, and coordinated
IndexedDB and offline-shell cache cleanup. `WorkspaceApp` retains collaboration
recovery and restored-state presentation.

This checkpoint reduces `src/client/app.ts` from 640 to 619 lines (-21) and
grows the offline persistence module from 230 to 281 lines (+51). The 30-line
combined increase replaces scattered fields, guards, queue construction, and
cleanup methods with one testable lifecycle authority. Focused coverage passes
availability guards, debounced persistence, Yjs encoding, restoration, clearing,
flush-before-cleanup behavior, and strict types. Direct and unique production
package counts remain 18 and 150; Valibot and Yjs were already pinned.

The browser application artifact remains 857,031 B raw / 230,658 B gzip.
Styles and lazy Markdown and PDF.js artifacts also remain unchanged at 135,411
B / 23,373 B, 204,779 B / 62,386 B, and 481,994 B / 146,135 B.

Full native CI passes all 1,753 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Offline Restore Presentation

`WorkspaceCatalogPanel` now derives the single authorized offline project row
from restored snapshot identity, title, and save time. `ConnectionStatus`
combines restored collaboration/editability projection with pending-versus-
saved wording. `WorkspaceApp` retains canonical snapshot assignment,
collaboration recovery, project presentation, and Preview rendering.

This checkpoint reduces `src/client/app.ts` from 619 to 605 lines (-14), grows
the connection-status owner from 78 to 84 lines (+6), and grows the catalog
owner from 159 to 172 lines (+13). The five-line combined increase removes
offline-specific row and status construction from the coordinator while keeping
canonical state effects explicit. Focused coverage passes encoded offline
routes, timestamp projection, compact-switcher synchronization, restored
editability and save wording, and strict types. Direct and unique production
package counts remain 18 and 150; Lit was already pinned.

The browser application artifact increases from 857,031 B raw / 230,658 B gzip
to 857,627 B / 230,812 B (+596 B raw / +154 B gzip). Styles and lazy Markdown
and PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B /
62,386 B, and 481,994 B / 146,135 B.

Full native CI passes all 1,754 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: GitHub Browser Lifecycle

`GitHubSyncMenu` now owns ambient online, focus, and visible-document refresh
subscriptions and teardown, routing every trigger through its existing
throttling and active-review suppression. `WorkspaceApp` retains only the
online collaboration reconnect action.

This checkpoint reduces `src/client/app.ts` from 605 to 597 lines (-8) and
grows the GitHub synchronization owner from 234 to 261 lines (+27). The 19-line
combined increase makes subscription lifetime explicit beside the refresh
policy it invokes. Focused coverage passes online forcing, focus throttling,
hidden-versus-visible behavior, disconnect teardown, and strict types. Direct
and unique production package counts remain 18 and 150; Lit and Valibot were
already pinned.

The browser application artifact increases from 857,627 B raw / 230,812 B gzip
to 858,123 B / 230,941 B (+496 B raw / +129 B gzip). Styles and lazy Markdown
and PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B /
62,386 B, and 481,994 B / 146,135 B.

Full native CI passes all 1,755 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Browser History Restoration

`WorkspaceSurfaceSwitcher` now owns the workspace `popstate` subscription that
invokes its existing ordered route restoration. `ReferenceLibraryWorkspace`
now owns current-location parsing and the corresponding standalone-Library
history subscription. Both Lit owners remove their listeners when disconnected;
`WorkspaceApp` retains concrete history mutations and cross-feature effects.

This checkpoint reduces `src/client/app.ts` from 597 to 594 lines (-3), grows
the surface switcher from 147 to 165 lines (+18), and grows the Library workspace
from 372 to 403 lines (+31). The 46-line combined owner increase replaces an
application-global mode branch with independently testable lifecycle boundaries.
Focused coverage passes workspace and Library history restoration, route
parsing, listener teardown, and strict types. Direct and unique production
package counts remain 18 and 150; Lit was already pinned.

The browser application artifact increases from 858,123 B raw / 230,941 B gzip
to 858,956 B / 231,126 B (+833 B raw / +185 B gzip). Styles and lazy Markdown
and PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B /
62,386 B, and 481,994 B / 146,135 B.

Full native CI passes all 1,757 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Coordinator Extraction: Collaboration Browser Lifecycle

`CollaborationSocket` now owns online and offline browser subscriptions and
routes them through its existing connect and offline transitions. The
environment boundary keeps those subscriptions deterministic in unit tests and
supports explicit teardown. `WorkspaceApp` activates the lifecycle once.

This checkpoint reduces `src/client/app.ts` from 594 to 593 lines (-1) and
grows the socket owner from 228 to 248 lines (+20). The 19-line combined increase
places browser connectivity triggers beside the transport policy they invoke.
Focused coverage passes online connection, offline transition, teardown, and
strict types. Direct and unique production package counts remain 18 and 150.

The browser application artifact increases from 858,956 B raw / 231,126 B gzip
to 859,264 B / 231,208 B (+308 B raw / +82 B gzip). Styles and lazy Markdown
and PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B /
62,386 B, and 481,994 B / 146,135 B.

Full native CI passes all 1,758 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Coordinator Extraction: Offline Browser Lifecycle

`OfflineWorkspaceSession` now owns page-exit persistence and hosted-logout
interception, queued-save flush, IndexedDB and shell-cache cleanup, navigation,
failure routing, and listener teardown. `WorkspaceApp` supplies only the logout
element and user-facing failure presentation.

This checkpoint reduces `src/client/app.ts` from 593 to 586 lines (-7) and
grows the offline session module from 281 to 335 lines (+54). The 47-line
combined increase moves browser event lifetime and destructive cleanup ordering
beside the persistence authority. Focused coverage passes page-exit scheduling,
logout prevention, cleanup-before-navigation, teardown, and strict types. Direct
and unique production package counts remain 18 and 150; Valibot and Yjs were
already pinned.

The browser application artifact increases from 859,264 B raw / 231,208 B gzip
to 859,748 B / 231,347 B (+484 B raw / +139 B gzip). Styles and lazy Markdown
and PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B /
62,386 B, and 481,994 B / 146,135 B.

Full native CI passes all 1,759 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Bound Library Refresh

`ReferenceLibraryWorkspace` now binds the canonical project source, context
presenter, project API base, and route owner once, then owns the complete Library
refresh transaction. It loads the Library, asks `ContextResourcePresenter` to
refresh linked PDFs and reconcile authorization, presents project consumers,
waits for Lit settlement, presents the bound context, and replaces the route.
`WorkspaceApp` no longer duplicates that cross-feature sequence.

This checkpoint reduces `src/client/app.ts` from 563 to 556 lines (-7), grows
the Library workspace from 429 to 458 lines (+29), and grows the context
presenter from 1,238 to 1,243 lines (+5). The 27-line combined increase replaces
an application-level workflow with explicit, independently tested owner
capabilities. Focused coverage passes bound refresh, reconciliation,
presentation, settlement, route order, fallback injection, and strict types.
Direct and unique production package counts remain 18 and 150; Lit and Valibot
were already pinned.

The browser application artifact increases from 860,194 B raw / 231,511 B gzip
to 860,382 B / 231,606 B (+188 B raw / +95 B gzip). Styles and lazy Markdown
and PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B /
62,386 B, and 481,994 B / 146,135 B.

Full native CI passes all 1,763 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project Range Activation

`ProjectFileDialog` now owns project-range activation across canonical file
selection, entry-file fallback, Write-mode entry, and normalized editor bounds.
Preview synchronization, manuscript maps, writing workflows, context links, and
Preview diagnostics all use the same owner operation. `WorkspaceApp` no longer
reconstructs this workflow or reads the snapshot to choose the diagnostic
fallback file.

This checkpoint reduces `src/client/app.ts` from 556 to 554 lines (-2) and grows
the project-file owner from 493 to 502 lines (+9). The seven-line combined
increase replaces a coordinator helper with one tested file-authority contract.
Focused coverage passes omitted-file fallback, range normalization, owner
activation, affected integrations, and strict types. Direct and unique
production package counts remain 18 and 150; Lit was already pinned.

The browser application artifact increases from 860,382 B raw / 231,606 B gzip
to 860,630 B / 231,636 B (+248 B raw / +30 B gzip). Styles and lazy Markdown
and PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B /
62,386 B, and 481,994 B / 146,135 B.

Full native CI passes all 1,764 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Single Browser Project Snapshot

`ProjectFileDialog` now exposes the accepted project snapshot it already retains
for file projection. Offline persistence, settings, Library refresh, Preview,
Context, routing, and mutation consumers read that source instead of a duplicate
`WorkspaceApp` field. Project mutation acceptance now presents the snapshot to
the owner before dependent cross-feature refresh and rendering.

This checkpoint reduces `src/client/app.ts` from 554 to 549 lines (-5) and grows
the project-file owner from 502 to 506 lines (+4), a one-line net maintenance
reduction that also removes split snapshot authority. Focused coverage passes
snapshot exposure and project-file behavior; affected integration coverage and
strict types also pass. Direct and unique production package counts remain 18
and 150; Lit was already pinned.

The browser application artifact increases from 860,630 B raw / 231,636 B gzip
to 860,790 B / 231,627 B (+160 B raw / -9 B gzip). Styles and lazy Markdown and
PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B / 62,386 B,
and 481,994 B / 146,135 B.

Full native CI passes all 1,764 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Coordinator Simplification: Direct Owner Reads

`WorkspaceApp` now reads active-file identity, project revision, and Library
snapshot directly from their Lit owners. Three private alias getters and their
indirection are removed; collaboration selection captures the active file once
before constructing its payload.

This checkpoint reduces `src/client/app.ts` from 549 to 539 lines (-10) with no
growth elsewhere. Affected coverage passes all 1,764 unit tests after the
sandbox-blocked loopback test was rerun with local-loopback permission. Direct
and unique production package counts remain 18 and 150; Lit was already pinned.

The browser application artifact increases from 860,790 B raw / 231,627 B gzip
to 860,941 B / 231,618 B (+151 B raw / -9 B gzip). Styles and lazy Markdown and
PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B / 62,386 B,
and 481,994 B / 146,135 B.

Full native CI passes all 1,764 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Active Authoring Text

`EditorStatus` now resolves the active Y.Text from project-file and entry-file
identity, exposes the active manuscript projection, and owns active-text
insertion entry points. `WorkspaceApp` no longer stores a duplicate active-text
field or threads that value through assistant, citation, Insert-menu, and table
workflows.

This checkpoint reduces `src/client/app.ts` from 539 to 536 lines (-3) and grows
the editor-status owner from 273 to 292 lines (+19). The 16-line combined
increase centralizes mutable authoring authority and makes the coordinator
stateless for active text. Focused coverage passes project-file resolution,
active insertion, manuscript projection, affected integrations, and strict
types. Direct and unique production package counts remain 18 and 150; Lit and
Yjs were already pinned.

The browser application artifact increases from 860,941 B raw / 231,618 B gzip
to 861,178 B / 231,688 B (+237 B raw / +70 B gzip). Styles and lazy Markdown and
PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B / 62,386 B,
and 481,994 B / 146,135 B.

Full native CI passes all 1,765 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: File Activation Projection

`ProjectFileDialog` now completes active-file selection by reprojecting its
retained canonical snapshot and presentation inputs with an explicit editor
reset, then emits one argument-free cross-feature activation effect.
`WorkspaceApp` no longer receives file and snapshot values only to call back
into the same owner, and the prior duplicate editor binding is removed.

This checkpoint reduces `src/client/app.ts` from 536 to 530 lines (-6) and grows
the project-file owner from 506 to 511 lines (+5), a one-line net maintenance
reduction. Focused coverage passes selection eligibility, reset-aware file
presentation, deferred deletion and Undo, workflow-file focus, affected
integrations, and strict types. Direct and unique production package counts
remain 18 and 150; Lit was already pinned.

The browser application artifact changes from 861,178 B raw / 231,688 B gzip to
861,143 B / 231,718 B (-35 B raw / +30 B gzip). Styles and lazy Markdown and
PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B / 62,386 B,
and 481,994 B / 146,135 B.

Full native CI passes all 1,765 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project Mutation Acceptance

`ProjectFileDialog` now accepts generic project mutation responses or snapshots,
validates the canonical workspace contract, installs the accepted projection,
and awaits one argument-free post-accept effect for Context and Preview
reconciliation. Library and source-completion mutations delegate directly to
that owner. `WorkspaceApp` no longer parses these responses or retains its
project-mutation method and validation imports.

This checkpoint reduces `src/client/app.ts` from 530 to 523 lines (-7) and grows
the project-file owner from 511 to 521 lines (+10). The three-line combined
increase centralizes canonical response acceptance beside the sole browser
snapshot projection. Focused coverage passes response validation, projection,
post-accept effects, Library and completion delegation, affected integrations,
and strict types. Direct and unique production package counts remain 18 and
150; Lit was already pinned.

The browser application artifact increases from 861,143 B raw / 231,718 B gzip
to 861,356 B / 231,759 B (+213 B raw / +41 B gzip). Styles and lazy Markdown and
PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B / 62,386 B,
and 481,994 B / 146,135 B.

Full native CI passes all 1,766 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Canonical Project Refresh

`ProjectFileDialog` now binds snapshot transport, source, bibliography,
revision, Preview, Context, and offline capabilities once and owns the ordered
canonical refresh projection. It derives bootstrap state from the absence of
its retained snapshot, so an offline-restored snapshot naturally makes the next
network result a normal refresh. `WorkspaceApp` no longer stores a bootstrap
flag or implements the refresh workflow.

This checkpoint reduces `src/client/app.ts` from 523 to 515 lines (-8) and grows
the project-file owner from 521 to 560 lines (+39). The 31-line combined
increase makes bootstrap derivable and moves seven cross-feature sequencing
steps behind one tested owner operation. Focused coverage passes initial and
subsequent refresh projection, snapshot installation, Context presentation,
offline scheduling, linked-PDF refresh, affected integrations, and strict
types. Direct and unique production package counts remain 18 and 150; Lit was
already pinned.

The browser application artifact increases from 861,356 B raw / 231,759 B gzip
to 861,694 B / 231,912 B (+338 B raw / +153 B gzip). Styles and lazy Markdown
and PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B /
62,386 B, and 481,994 B / 146,135 B.

Full native CI passes all 1,767 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Offline Project Restoration

`ProjectFileDialog` now consumes the typed offline restoration result through
its existing project-lifecycle binding. It recovers collaboration state and
availability, sets revision and the authorized catalog row, installs and
presents the project and Context, projects connection status, and renders
Preview. `WorkspaceApp` no longer reconstructs this sequence or retains any
standalone workflow method beyond its binding phase.

This checkpoint reduces `src/client/app.ts` from 515 to 504 lines (-11) and
grows the project-file owner from 560 to 586 lines (+26). The 15-line combined
increase unifies online and offline project projection behind the same owner and
removes a seven-authority coordinator workflow. Focused coverage passes restored
and absent state, collaboration recovery, catalog and revision presentation,
project and Context projection, connection status, Preview rendering, affected
integrations, and strict types. Direct and unique production package counts
remain 18 and 150; Lit and Valibot were already pinned.

The browser application artifact increases from 861,694 B raw / 231,912 B gzip
to 861,791 B / 231,953 B (+97 B raw / +41 B gzip). Styles and lazy Markdown and
PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B / 62,386 B,
and 481,994 B / 146,135 B.

Full native CI passes all 1,768 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Collaboration Ownership: Document Update Lifecycle

`CollaborationSocket` now owns the document-wide Yjs update subscription,
offline-save scheduling, pending save wording, assistant invalidation, immediate
flush, and explicit teardown. `CollaborationSession` decides whether an update
origin is locally authored before enqueueing it. Local and remote changes share
one document-updated callback instead of duplicating assistant effects.

This checkpoint reduces `src/client/app.ts` from 504 to 501 lines (-3), grows
the collaboration session from 158 to 164 lines (+6), and grows the socket owner
from 248 to 275 lines (+27). The 30-line combined increase makes subscription
lifetime and origin policy independently testable beside the queue and
transport they control. Focused coverage passes remote, offline, local, and
unbound updates, persistence scheduling, enqueue eligibility, save wording,
assistant invalidation, teardown, affected integrations, and strict types.
Direct and unique production package counts remain 18 and 150; Yjs was already
pinned.

The browser application artifact increases from 861,791 B raw / 231,953 B gzip
to 862,019 B / 232,029 B (+228 B raw / +76 B gzip). Styles and lazy Markdown and
PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B / 62,386 B,
and 481,994 B / 146,135 B.

Full native CI passes all 1,770 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Authoring-Mode Route Effects

`WorkspaceSurfaceSwitcher` now consumes Write/Map outcomes through its existing
workspace-route binding. A Write outcome activates Authoring without emitting a
second surface event, focuses a narrowly supplied authoring target, and replaces
the canonical route; Map only replaces the route. `WorkspaceApp` no longer owns
that cross-component branch.

This checkpoint reduces `src/client/app.ts` from 501 to 495 lines (-6) and grows
the surface/route owner from 165 to 174 lines (+9). The three-line combined
increase locates route policy beside restoration and history mutation and keeps
editor access behind a capability callback. Focused coverage passes Write focus
and surface activation, Map focus avoidance, canonical replacement, restoration,
affected integrations, and strict types. Direct and unique production package
counts remain 18 and 150; Lit was already pinned.

The browser application artifact changes from 862,019 B raw / 232,029 B gzip to
861,982 B / 232,038 B (-37 B raw / +9 B gzip). Styles and lazy Markdown and
PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B / 62,386 B,
and 481,994 B / 146,135 B.

Full native CI passes all 1,770 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Workspace-Layout Route Effects

`WorkspaceSurfaceSwitcher` now consumes workspace-layout outcomes through its
existing route binding. PDF-only selection asks the Context presenter to ensure
an authorized PDF through one narrow capability; every layout outcome then
replaces the canonical route. `WorkspaceApp` no longer owns that async branch.

This checkpoint reduces `src/client/app.ts` from 495 to 492 lines (-3) and grows
the surface/route owner from 174 to 180 lines (+6). The three-line combined
increase locates layout route policy beside restoration and history mutation
without moving PDF selection into the route owner. Focused coverage passes PDF
activation, canonical replacement, restoration, affected integrations, and
strict types. Direct and unique production package counts remain 18 and 150;
Lit was already pinned.

The browser application artifact changes from 861,982 B raw / 232,038 B gzip to
861,983 B / 232,053 B (+1 B raw / +15 B gzip). Styles and lazy Markdown and
PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B / 62,386 B,
and 481,994 B / 146,135 B.

Full native CI passes all 1,770 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project-Rail Route Effects

`WorkspaceSurfaceSwitcher` now consumes project-rail navigation through its
existing workspace-route binding and replaces the canonical URL beside its
other route-producing controls. `WorkspaceApp` no longer installs a detached
rail subscription.

This checkpoint reduces `src/client/app.ts` from 492 to 491 lines (-1) and grows
the surface/route owner from 180 to 182 lines (+2). The one-line combined
increase completes route synchronization for the three controls already carried
by the binding. Focused coverage passes rail replacement, canonical projection,
restoration, affected integrations, and strict types. Direct and unique
production package counts remain 18 and 150; Lit was already pinned.

The browser application artifact changes from 861,983 B raw / 232,053 B gzip to
861,936 B / 232,045 B (-47 B raw / -8 B gzip). Styles and lazy Markdown and
PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B / 62,386 B,
and 481,994 B / 146,135 B.

Full native CI passes all 1,770 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Page Route Projection

`ContextResourcePresenter` now completes viewer page changes by projecting the
canonical PDF location and page-local private markup, then applying workspace
and standalone-Library replacement through its already bound route owners. The
return-only page-presentation shape and `WorkspaceApp` fan-out are removed.

This checkpoint reduces `src/client/app.ts` from 491 to 487 lines (-4) and the
Context presenter from 1,243 to 1,239 lines (-4), for eight fewer production
lines overall. Focused coverage passes canonical page projection, private markup
and undo presentation, workspace replacement, standalone PDF replacement,
inactive-context behavior, affected integrations, and strict types. Direct and
unique production package counts remain 18 and 150; Lit was already pinned.

The browser application artifact changes from 861,936 B raw / 232,045 B gzip to
861,873 B / 232,061 B (-63 B raw / +16 B gzip). Styles and lazy Markdown and
PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B / 62,386 B,
and 481,994 B / 146,135 B.

Full native CI passes all 1,770 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Manuscript Reveal Routing

`ProjectFileDialog` now owns explicit authoring and range reveal operations
beside its existing file/entry fallback, Write-mode activation, and normalized
selection. Project-map document navigation and durable passage navigation reuse
those operations, while editor scrolling remains a narrow bound capability.

This checkpoint reduces `src/client/app.ts` from 487 to 482 lines (-5) and grows
the project-file owner from 586 to 597 lines (+11). The six-line combined
increase removes two duplicated cross-feature sequences and makes selection-only
versus selection-and-reveal intent explicit. Focused coverage passes authoring
reveal, range reveal, entry fallback, normalized selection, affected
integrations, and strict types. Direct and unique production package counts
remain 18 and 150; Lit was already pinned.

The browser application artifact changes from 861,873 B raw / 232,061 B gzip to
861,973 B / 232,094 B (+100 B raw / +33 B gzip). Styles and lazy Markdown and
PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B / 62,386 B,
and 481,994 B / 146,135 B.

Full native CI passes all 1,770 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Standalone Library Startup

`ReferenceLibraryWorkspace` now binds standalone browser history, projects the
Context-only shell and private connection state through typed capabilities,
opens the canonical Library, and restores the current route. `WorkspaceApp`
only asks whether that bounded startup path handled the application mode.

This checkpoint reduces `src/client/app.ts` from 482 to 480 lines (-2) and grows
the composed Library owner from 458 to 478 lines (+20). The 18-line combined
increase makes the complete standalone startup lifecycle independently testable
beside the route and refresh authorities it uses. Focused coverage passes
ignored workspace mode, shell projection, connection presentation, open-before-
restore sequencing, history binding, affected integrations, and strict types.
Direct and unique production package counts remain 18 and 150; Lit was already
pinned.

The browser application artifact changes from 861,973 B raw / 232,094 B gzip to
862,016 B / 232,139 B (+43 B raw / +45 B gzip). Styles and lazy Markdown and
PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B / 62,386 B,
and 481,994 B / 146,135 B.

Full native CI passes all 1,771 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Offline-First Workspace Opening

`ProjectFileDialog` now owns workspace opening across offline restoration,
catalog refresh, and canonical project refresh through its existing lifecycle
binding. It distinguishes first-use network failure from usable restored state,
clears offline data when access is revoked, and otherwise projects the restored
project into explicit offline collaboration mode.

This checkpoint reduces `src/client/app.ts` from 480 to 464 lines (-16) and
grows the project-file owner from 597 to 628 lines (+31). The 15-line combined
increase moves a multi-authority fallback workflow beside the online and offline
project projections it controls and makes all branches independently testable.
Focused coverage passes online opening, first-use catalog and project failure,
restored catalog and project failure, offline transition, revoked-access
cleanup, affected integrations, and strict types. Direct and unique production
package counts remain 18 and 150; Lit and Valibot were already pinned.

The browser application artifact changes from 862,016 B raw / 232,139 B gzip to
862,081 B / 232,202 B (+65 B raw / +63 B gzip). Styles and lazy Markdown and
PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B / 62,386 B,
and 481,994 B / 146,135 B.

Full native CI passes all 1,773 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Persisted Layout Restoration

`WorkspaceSurfaceSwitcher` now restores the workspace's persisted layout as the
first step of canonical route restoration, before applying an explicit URL
layout override. `WorkspaceApp` no longer starts that asynchronous transition
independently of project and route readiness.

This checkpoint reduces `src/client/app.ts` from 464 to 463 lines (-1) and grows
the surface/route owner from 182 to 184 lines (+2). The one-line combined
increase gives persisted and routed layout state one deterministic ordering and
ensures PDF-only restoration runs after the project is available. Focused
coverage passes persisted restore, explicit route override, PDF activation,
canonical replacement, affected integrations, and strict types. Direct and
unique production package counts remain 18 and 150; Lit was already pinned.

The browser application artifact changes from 862,081 B raw / 232,202 B gzip to
862,072 B / 232,201 B (-9 B raw / -1 B gzip). Styles and lazy Markdown and PDF.js
artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B / 62,386 B, and
481,994 B / 146,135 B.

Full native CI passes all 1,773 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project-Opening Editor Lock

`ProjectFileDialog` now locks source and bibliography editing before offline
restoration or network work begins. The connection-status owner remains the
single authority that unlocks those fields after editability is established;
`WorkspaceApp` no longer mutates them during startup.

This checkpoint reduces `src/client/app.ts` from 463 to 461 lines (-2) and grows
the project-file owner from 628 to 630 lines (+2), keeping total production
lines flat. Focused coverage passes initial locking, online opening, offline
fallback, connection-driven unlocking, affected integrations, and strict types.
Direct and unique production package counts remain 18 and 150; Lit was already
pinned.

The browser application artifact changes from 862,072 B raw / 232,201 B gzip to
862,060 B / 232,203 B (-12 B raw / +2 B gzip). Styles and lazy Markdown and
PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B / 62,386 B,
and 481,994 B / 146,135 B.

Full native CI passes all 1,773 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project-Map Destination Binding

`ContextResourcePresenter` now consumes the document, project, people, and
Preview destination owners as typed capabilities when binding its composed
project map. It routes those selections itself and applies the Preview context
transition before section scrolling; `WorkspaceApp` no longer expands four
destination-specific closures.

This checkpoint reduces `src/client/app.ts` from 461 to 458 lines (-3) and grows
the Context presenter from 1,239 to 1,250 lines (+11). The eight-line combined
increase makes every project-map destination independently testable at the
composed owner boundary and keeps the application binding declarative. Focused
coverage passes document, project, person, Preview section, annotation, claim,
candidate, note, PDF, and publication routes, affected integrations, and strict
types. Direct and unique production package counts remain 18 and 150; Lit was
already pinned.

The browser application artifact changes from 862,060 B raw / 232,203 B gzip to
862,099 B / 232,231 B (+39 B raw / +28 B gzip). Styles and lazy Markdown and
PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B / 62,386 B,
and 481,994 B / 146,135 B.

Full native CI passes all 1,773 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Library Metadata Refresh

`ReferenceLibraryWorkspace` now completes metadata mutations by refreshing its
own canonical Library before requesting the remaining project refresh. The
application no longer receives a callback that immediately calls back into the
Library owner.

This checkpoint reduces `src/client/app.ts` from 458 to 455 lines (-3) and grows
the Library owner from 478 to 483 lines (+5). The two-line combined increase
removes an inverted ownership round trip and makes refresh ordering explicit at
the mutation owner. Focused coverage passes Library-before-project sequencing,
success and failure completion, affected integrations, and strict types. Direct
and unique production package counts remain 18 and 150; Lit was already pinned.

The browser application artifact changes from 862,099 B raw / 232,231 B gzip to
862,073 B / 232,225 B (-26 B raw / -6 B gzip). Styles and lazy Markdown and
PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B / 62,386 B,
and 481,994 B / 146,135 B.

Full native CI passes all 1,773 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Citation Success Effects

`SourceCitationControl` now activates Write after a successful bound Yjs
insertion and before presenting completion. Missing-caret and invalid-key paths
remain local failures without authoring activation. `WorkspaceApp` no longer
wraps the insertion callback to add that outcome.

This checkpoint reduces `src/client/app.ts` from 455 to 453 lines (-2) and grows
the source-citation owner from 85 to 87 lines (+2), keeping total production
lines flat. Focused coverage passes insertion-before-activation-before-notice
ordering, failure guards, affected integrations, and strict types. Direct and
unique production package counts remain 18 and 150; Lit was already pinned.

The browser application artifact changes from 862,073 B raw / 232,225 B gzip to
862,122 B / 232,231 B (+49 B raw / +6 B gzip). Styles and lazy Markdown and
PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B / 62,386 B,
and 481,994 B / 146,135 B.

Full native CI passes all 1,773 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Template Save Refresh Lifecycle

`ProjectTemplateSaveDialog` now binds the starting-point browser once as a
typed template source. The dialog owns its pre-open load, post-save catalog
refresh, replacement-option synchronization, and successful-save notification
timing instead of returning those steps to `WorkspaceApp` through loader and
completion callbacks. The starting-point browser remains the canonical catalog
and hidden-template owner.

This checkpoint reduces `src/client/app.ts` from 453 to 452 lines (-1). The
template-save owner grows from 228 to 246 lines (+18) to replace coordinator
policy with an explicit reusable boundary. Direct component coverage passes all
seven save-dialog cases and all ten starting-point cases; affected coverage
passes all nine related runtime cases alongside strict types.

The browser application artifact changes from 862,122 B raw / 232,231 B gzip
to 862,354 B raw / 232,259 B gzip (+232 B raw / +28 B gzip). Styles, lazy
Markdown, lazy PDF.js, and direct and unique production package counts remain
unchanged at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip,
481,994 B raw / 146,135 B gzip, 18, and 150.

Full native CI passes all 1,773 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project-File Snapshot Commitment

`ProjectFileDialog` now commits validated file, folder, tree, deletion, and
upload snapshots to its own canonical project projection and requests Preview
rendering through its existing project-refresh binding. `WorkspaceApp` no
longer accepts each mutation result merely to return it to the same Lit owner.

This checkpoint reduces `src/client/app.ts` from 452 to 448 lines (-4). The
project-file owner grows from 630 to 633 lines (+3), so their combined runtime
source falls by one line while removing the mutation callback and its repeated
round trip. Direct component coverage passes all 25 project-file cases;
affected coverage passes all 27 related runtime cases alongside strict types.

The browser application artifact changes from 862,354 B raw / 232,259 B gzip
to 862,298 B raw / 232,254 B gzip (-56 B raw / -5 B gzip). Styles, lazy
Markdown, lazy PDF.js, and direct and unique production package counts remain
unchanged at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip,
481,994 B raw / 146,135 B gzip, 18, and 150.

Full native CI passes all 1,773 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Accepted-Mutation Refresh

`ProjectFileDialog` now finishes accepted cross-feature mutations through the
Context, reference-PDF, and Preview authorities already present in its project-
refresh binding. `WorkspaceApp` no longer receives a post-acceptance callback
whose only purpose was to call those same bound owners.

This checkpoint reduces `src/client/app.ts` from 448 to 443 lines (-5). The
project-file owner grows from 633 to 635 lines (+2), reducing their combined
runtime source by three lines and removing one callback from the public mutation
boundary. Direct component coverage passes all 25 project-file cases; affected
coverage passes all 27 related runtime cases alongside strict types.

The browser application artifact changes from 862,298 B raw / 232,254 B gzip
to 862,156 B raw / 232,216 B gzip (-142 B raw / -38 B gzip). Styles, lazy
Markdown, lazy PDF.js, and direct and unique production package counts remain
unchanged at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip,
481,994 B raw / 146,135 B gzip, 18, and 150.

Full native CI passes all 1,773 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Authoring Target Publication

`EditorStatus` now binds the collaborator-presence, citation, assistant, and
Context owners structurally. The owner subscribes directly to remote-selection
changes and publishes each resolved caret or selection to its consumers instead
of asking `WorkspaceApp` to repeat its derived state across four callbacks.

This checkpoint reduces `src/client/app.ts` from 443 to 439 lines (-4). The
editor-status owner grows from 292 to 306 lines (+14) to make the structural
boundary explicit. Direct component coverage passes all seven editor-status
cases; affected coverage passes all nine related runtime cases alongside strict
types.

The browser application artifact changes from 862,156 B raw / 232,216 B gzip
to 862,095 B raw / 232,224 B gzip (-61 B raw / +8 B gzip). Styles, lazy
Markdown, lazy PDF.js, and direct and unique production package counts remain
unchanged at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip,
481,994 B raw / 146,135 B gzip, 18, and 150.

Full native CI passes all 1,773 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Editor Interaction Lifecycle

`EditorStatus` now attaches target-tracking listeners after its Yjs textarea
binding, ensuring each input updates canonical text before capturing the
relative selection. It owns collaboration-presence scheduling and assistant-
availability refresh from those interactions. `SourceCompletion` no longer
transports unrelated editor consequences through a coordinator callback.

This checkpoint reduces `src/client/app.ts` from 439 to 436 lines (-3) and the
source-completion owner from 347 to 343 lines (-4). The editor-status owner grows
from 306 to 316 lines (+10), a combined increase of three runtime lines for an
independent editor lifecycle. Direct component coverage passes all 14 editor-
status and completion cases; affected coverage passes all 16 related runtime
cases alongside strict types. Five focused browser scenarios confirm input,
completion, undo, Preview sync, and remote-caret ordering.

The browser application artifact changes from 862,095 B raw / 232,224 B gzip
to 862,204 B raw / 232,226 B gzip (+109 B raw / +2 B gzip). Styles, lazy
Markdown, lazy PDF.js, and direct and unique production package counts remain
unchanged at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip,
481,994 B raw / 146,135 B gzip, 18, and 150.

Full native CI passes all 1,773 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Writing-Workflow Documents

The research-question and reviewer-response Lit panels now own their canonical
paths and template choices and bind project-file and notice capabilities
directly. The research-diary summary likewise owns its canonical dated template.
Opening and exact source selection route through the project-file owner without
kind, path, template, or selection adapters in `WorkspaceApp`.

This checkpoint reduces `src/client/app.ts` from 436 to 418 lines (-18). The
writing-workflow owner grows from 187 to 202 lines (+15) and the diary owner from
63 to 64 lines (+1), reducing combined runtime source by two lines while
removing the coordinator's entire workflow mapping. Direct component coverage
passes all five workflow cases; affected coverage passes all 23 related runtime
cases alongside strict types.

The browser application artifact changes from 862,204 B raw / 232,226 B gzip
to 862,160 B raw / 232,230 B gzip (-44 B raw / +4 B gzip). Styles, lazy
Markdown, lazy PDF.js, and direct and unique production package counts remain
unchanged at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip,
481,994 B raw / 146,135 B gzip, 18, and 150.

Full native CI passes all 1,773 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Manuscript-Map Project Routing

`ManuscriptMapPanel` now routes its translated file-qualified ranges through the
project-file capability already present in its project-presentation binding.
The separate navigation callback and selection protocol are removed, leaving
one structural boundary for guide sibling projection and authored-range focus.

This checkpoint reduces `src/client/app.ts` from 418 to 415 lines (-3) and the
manuscript-map owner from 200 to 190 lines (-10), reducing combined runtime
source by 13 lines. Direct component coverage passes all three manuscript-map
cases; affected coverage passes all 18 related runtime cases alongside strict
types.

The browser application artifact changes from 862,160 B raw / 232,230 B gzip
to 862,061 B raw / 232,220 B gzip (-99 B raw / -10 B gzip). Styles, lazy
Markdown, lazy PDF.js, and direct and unique production package counts remain
unchanged at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip,
481,994 B raw / 146,135 B gzip, 18, and 150.

Full native CI passes all 1,773 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Assistant Decision Context

`AssistantGenerationPresenter` now binds the Context owner directly. Candidate
decision start and completion re-present assistant Context and refresh presenter
availability internally; rejection also activates assistant Context without
returning fixed effects through `WorkspaceApp`.

This checkpoint reduces `src/client/app.ts` from 415 to 409 lines (-6). The
assistant presenter grows from 649 to 657 lines (+8) to replace two callback
concepts with one structural capability. Direct presenter coverage passes all
19 cases; affected coverage passes all 21 related runtime cases alongside
strict types.

The browser application artifact changes from 862,061 B raw / 232,220 B gzip
to 862,003 B raw / 232,248 B gzip (-58 B raw / +28 B gzip). Styles, lazy
Markdown, lazy PDF.js, and direct and unique production package counts remain
unchanged at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip,
481,994 B raw / 146,135 B gzip, 18, and 150.

Full native CI passes all 1,773 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Canonical Assistant Table State

`AssistantGenerationPresenter` now derives captured-table manuscript text,
source revision, and collaboration stability from its existing authoring source
binding. The duplicate `tableState` callback and its second projection of the
same canonical values are removed from `WorkspaceApp`.

This checkpoint reduces `src/client/app.ts` from 409 to 404 lines (-5) and the
assistant presenter from 657 to 653 lines (-4), reducing combined runtime source
by nine lines. Direct presenter coverage passes all 19 cases; affected coverage
passes all 21 related runtime cases alongside strict types.

The browser application artifact changes from 862,003 B raw / 232,248 B gzip
to 861,876 B raw / 232,236 B gzip (-127 B raw / -12 B gzip). Styles, lazy
Markdown, lazy PDF.js, and direct and unique production package counts remain
unchanged at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip,
481,994 B raw / 146,135 B gzip, 18, and 150.

Full native CI passes all 1,773 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Direct Library Mutation Routing

`ContextResourcePresenter` now delegates publication-list management directly
to `ReferenceLibraryWorkspace`, while `LibraryPdfInspector` delegates project
reference and research mutation snapshots directly to the same workspace's
apply-project lifecycle. `WorkspaceApp` no longer adapts either owner through a
callback closure.

This checkpoint reduces `src/client/app.ts` from 404 to 400 lines (-4). The two
structural capability contracts grow the context presenter by two lines and the
PDF inspector by four, for a two-line combined runtime-source increase that
removes two application-level routing seams. Focused coverage passes all 45
presenter and inspector cases; affected coverage passes 60 related runtime
cases and both affected test files alongside strict types.

The browser application artifact changes from 861,876 B raw / 232,236 B gzip to
861,848 B raw / 232,232 B gzip (-28 B raw / -4 B gzip). Styles, lazy Markdown,
lazy PDF.js, and direct and unique production package counts remain unchanged
at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip, 481,994 B raw /
146,135 B gzip, 18, and 150.

Full native CI passes all 1,773 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Canonical Context Route Sources

`ContextResourcePresenter` now consumes project and Library snapshots from its
existing context source and linked-reference PDFs from its owned validated
catalog. The route coordinator no longer repeats those three canonical getters,
and `WorkspaceApp` no longer projects them a second time.

This checkpoint reduces `src/client/app.ts` from 400 to 397 lines (-3) and grows
the context presenter from 1,252 to 1,255 lines (+3), leaving combined runtime
source unchanged while narrowing one central route contract. Direct presenter
coverage passes all 39 cases; affected coverage passes 54 related runtime cases
and the affected test file alongside strict types.

The browser application artifact changes from 861,848 B raw / 232,232 B gzip to
861,889 B raw / 232,235 B gzip (+41 B raw / +3 B gzip). Styles, lazy Markdown,
lazy PDF.js, and direct and unique production package counts remain unchanged
at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip, 481,994 B raw /
146,135 B gzip, 18, and 150.

Full native CI passes all 1,773 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Owned Linked-PDF Context Input

`ContextResourcePresenter` now injects its owned, validated linked-reference PDF
catalog when composing resource presentation. `WorkspaceApp` no longer reads
that catalog only to feed it back through the presenter's context-source
binding.

This checkpoint reduces `src/client/app.ts` from 397 to 396 lines (-1) and grows
the context presenter from 1,255 to 1,256 lines (+1), leaving combined runtime
source unchanged while removing a circular input. Direct presenter coverage
passes all 39 cases; affected coverage passes 54 related runtime cases and the
affected test file alongside strict types.

The browser application artifact changes from 861,889 B raw / 232,235 B gzip to
861,890 B raw / 232,236 B gzip (+1 B raw / +1 B gzip). Styles, lazy Markdown,
lazy PDF.js, and direct and unique production package counts remain unchanged
at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip, 481,994 B raw /
146,135 B gzip, 18, and 150.

Full native CI passes all 1,773 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Assistant Candidate Presentation

`AssistantGenerationPresenter` now presents candidate review using the decision,
source revision, and collaboration stability it already owns. The context
presenter supplies only candidate identity, canonical snapshot, and restored
scroll position; `WorkspaceApp` no longer projects the three assistant-owned
values through its general context source.

This checkpoint reduces `src/client/app.ts` from 396 to 394 lines (-2) and the
context presenter from 1,256 to 1,255 lines (-1), while growing the assistant
presenter from 653 to 665 lines (+12). The nine-line combined runtime increase
places candidate presentation with its decision and authoring authority.
Focused coverage passes all 58 assistant and context presenter cases; affected
coverage passes 73 related runtime cases and both affected test files alongside
strict types.

The browser application artifact changes from 861,890 B raw / 232,236 B gzip to
862,035 B raw / 232,259 B gzip (+145 B raw / +23 B gzip). Styles, lazy Markdown,
lazy PDF.js, and direct and unique production package counts remain unchanged
at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip, 481,994 B raw /
146,135 B gzip, 18, and 150.

Full native CI passes all 1,773 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Preview Project-Owner Navigation

`WorkspacePreview` now routes source offsets, semantic citations, and diagnostic
ranges through the sync, Context, and project-file owners already supplied by
its canonical project binding. The separate navigation callback bag and its
three application-level adapters are removed.

This checkpoint reduces `src/client/app.ts` from 394 to 389 lines (-5) and the
Preview owner from 479 to 465 lines (-14), reducing combined runtime source by
19 lines. Direct Preview coverage passes all eight cases; affected coverage
passes 15 related runtime cases and the affected test file alongside strict
types.

The browser application artifact changes from 862,035 B raw / 232,259 B gzip to
861,772 B raw / 232,212 B gzip (-263 B raw / -47 B gzip). Styles, lazy Markdown,
lazy PDF.js, and direct and unique production package counts remain unchanged
at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip, 481,994 B raw /
146,135 B gzip, 18, and 150.

Full native CI passes all 1,773 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Editor-Owned Citation Completion

`SourceCitationControl` now binds to Context navigation and editor completion
through editor status's existing authoring boundary. It sends one nullable
insertion plus completion or error copy; editor status owns the Yjs edit, Write
activation, caret consequences, and notice. `WorkspaceApp` no longer maintains
separate citation navigation and three-effect insertion callback bags.

This checkpoint reduces `src/client/app.ts` from 389 to 385 lines (-4), keeps
the source-citation owner at 87 lines, and grows editor status from 316 to 331
lines (+15). The eleven-line combined runtime increase makes citation completion
one editor transaction rather than three application effects. Focused coverage
passes all 12 editor and citation cases; affected coverage passes 14 related
runtime cases and both affected test files alongside strict types.

The browser application artifact changes from 861,772 B raw / 232,212 B gzip to
861,681 B raw / 232,218 B gzip (-91 B raw / +6 B gzip). Styles, lazy Markdown,
lazy PDF.js, and direct and unique production package counts remain unchanged
at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip, 481,994 B raw /
146,135 B gzip, 18, and 150.

Full native CI passes all 1,774 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Direct Workspace Route Owners

`WorkspaceSurfaceSwitcher` now consumes the live project-file, Context, and
authoring owners through its existing workspace-route binding. Canonical file
and Context state, PDF activation, route restoration, file selection, and editor
focus no longer need eight application-level getter or method adapters.

This checkpoint reduces `src/client/app.ts` from 385 to 380 lines (-5) and grows
the surface/route owner from 184 to 188 lines (+4), reducing combined runtime
source by one line while replacing duplicated callback projections with stable
owner boundaries. Focused coverage passes all four route-owner cases; affected
coverage passes six related runtime cases and the affected test file alongside
strict types.

The browser application artifact changes from 861,681 B raw / 232,218 B gzip to
861,348 B raw / 232,159 B gzip (-333 B raw / -59 B gzip). Styles, lazy Markdown,
lazy PDF.js, and direct and unique production package counts remain unchanged at
135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip, 481,994 B raw /
146,135 B gzip, 18, and 150.

Full native CI passes all 1,774 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Preview-Owned Project Snapshot Source

`WorkspacePreview` now reads the canonical project snapshot from its already
bound project-file owner. Its project binding no longer accepts a parallel
snapshot getter, and `WorkspaceApp` no longer projects that owner state through
an extra callback.

This checkpoint keeps `src/client/app.ts` at 380 lines and reduces the Preview
owner from 465 to 464 lines (-1), reducing combined runtime source by one line.
Focused coverage passes all eight Preview cases; affected coverage passes 15
related runtime cases and the affected test file alongside strict types.

The browser application artifact changes from 861,348 B raw / 232,159 B gzip to
861,341 B raw / 232,159 B gzip (-7 B raw / unchanged gzip). Styles, lazy
Markdown, lazy PDF.js, and direct and unique production package counts remain
unchanged at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip,
481,994 B raw / 146,135 B gzip, 18, and 150.

Full native CI passes all 1,774 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Direct Assistant Authoring Owners

`AssistantGenerationPresenter` now reads canonical file identity, manuscript
text and target, source revision, and collaboration stability from the live
project, editor, history, and collaboration owners. `WorkspaceApp` no longer
projects those four owners through five anonymous getter callbacks.

This checkpoint reduces `src/client/app.ts` from 380 to 379 lines (-1) and grows
the assistant presenter from 665 to 667 lines (+2). The one-line combined
runtime increase makes the authoring contract owner-based and keeps every value
live without coordinator adapters. Focused coverage passes all 19 assistant
cases; affected coverage passes 21 related runtime cases and the affected test
file alongside strict types.

The browser application artifact changes from 861,341 B raw / 232,159 B gzip to
861,277 B raw / 232,163 B gzip (-64 B raw / +4 B gzip). Styles, lazy Markdown,
lazy PDF.js, and direct and unique production package counts remain unchanged
at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip, 481,994 B raw /
146,135 B gzip, 18, and 150.

Full native CI passes all 1,774 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Editor-Owned Insertion Target

`EditorStatus` now projects the live insertion target from its owned source,
caret, and passage state. `EditorInsertMenu` binds directly to the editor and
notice owners, so `WorkspaceApp` no longer constructs the target or adapts
insertion and notice methods through three callbacks.

This checkpoint reduces `src/client/app.ts` from 379 to 375 lines (-4), grows
editor status from 331 to 341 lines (+10), and grows the Insert menu from 159 to
161 lines (+2). The eight-line combined runtime increase makes insertion-target
resolution an explicit editor contract and leaves menu policy independent of
application wiring. Focused coverage passes all 11 editor and Insert-menu cases;
affected coverage passes 13 related runtime cases and both affected test files
alongside strict types.

The browser application artifact changes from 861,277 B raw / 232,163 B gzip to
861,271 B raw / 232,162 B gzip (-6 B raw / -1 B gzip). Styles, lazy Markdown,
lazy PDF.js, and direct and unique production package counts remain unchanged
at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip, 481,994 B raw /
146,135 B gzip, 18, and 150.

Full native CI passes all 1,774 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Canonical Catalog and Project Owners

`ProjectStartingPointBrowser` now reads the live workspace catalog from its
bound catalog owner, and `ReferenceLibraryWorkspace` reads the live project
snapshot from its bound project-file owner. `WorkspaceApp` no longer wraps
either canonical owner in a parallel getter callback.

This checkpoint keeps `src/client/app.ts` at 375 lines and leaves both owning
components' line counts unchanged at 582 and 483 lines. Focused coverage passes
all 25 starting-point and Library workspace cases; affected coverage passes 27
related runtime cases and both affected test files alongside strict types.

The browser application artifact changes from 861,271 B raw / 232,162 B gzip to
861,262 B raw / 232,157 B gzip (-9 B raw / -5 B gzip). Styles, lazy Markdown,
lazy PDF.js, and direct and unique production package counts remain unchanged
at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip, 481,994 B raw /
146,135 B gzip, 18, and 150.

Full native CI passes all 1,774 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Direct Context Presentation Owners

`ContextResourcePresenter` now binds the live assistant, editor, layout,
Library, project-file, and surface-route owners. It derives canonical project
and Library sources, citation availability, pane restoration, Context-surface
activation, and route effects directly instead of receiving a source factory
plus seven application-level adapters.

This checkpoint reduces `src/client/app.ts` from 375 to 370 lines (-5) and grows
the Context presenter from 1,255 to 1,269 lines (+14). The nine-line combined
runtime increase replaces parallel state/effect projections with one explicit
owner boundary. Focused coverage passes all 39 Context presenter cases;
affected coverage passes 54 related runtime cases and the affected test file
alongside strict types.

The browser application artifact changes from 861,262 B raw / 232,157 B gzip to
861,131 B raw / 232,140 B gzip (-131 B raw / -17 B gzip). Styles, lazy
Markdown, lazy PDF.js, and direct and unique production package counts remain
unchanged at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip,
481,994 B raw / 146,135 B gzip, 18, and 150.

Full native CI passes all 1,774 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project-File Presentation Owners

`ProjectFileDialog` now receives assistant, editor-status, workspace-preview,
surface-route, and toast owners through its existing presentation binding. Its
file-activation sequence invokes those owners directly, while `configureApi`
is again limited to API configuration. `WorkspaceApp` no longer maintains ten
parallel presentation adapters for project-file operations.

This checkpoint reduces `src/client/app.ts` from 370 to 360 lines (-10) and
grows the project-file dialog from 635 to 647 lines (+12). The two-line combined
runtime increase replaces an application callback bag with an explicit owner
boundary. Focused coverage passes all 25 project-file dialog cases; affected
coverage passes 27 related runtime cases and the affected test file alongside
strict types.

The browser application artifact changes from 861,131 B raw / 232,140 B gzip to
860,912 B raw / 232,149 B gzip (-219 B raw / +9 B gzip). Styles, lazy Markdown,
lazy PDF.js, and direct and unique production package counts remain unchanged
at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip, 481,994 B raw /
146,135 B gzip, 18, and 150.

Full native CI passes all 1,774 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Workspace-Settings Owners

`WorkspaceSettingsPanel` now binds the live catalog, project-file,
template-save, and GitHub owners through one typed workspace boundary. It reads
the canonical catalog, snapshot, and hidden-file projection when opening, and
invokes owner refresh and template operations directly. `WorkspaceApp` no
longer constructs a settings-specific source factory plus three adapters.

This checkpoint reduces `src/client/app.ts` from 360 to 350 lines (-10) and
grows the settings panel from 427 to 441 lines (+14). The four-line combined
runtime increase replaces duplicated projections with one explicit owner
boundary. Focused coverage passes all 7 settings-panel cases; affected coverage
passes 15 related runtime cases and the affected test file alongside strict
types.

The browser application artifact changes from 860,912 B raw / 232,149 B gzip to
860,780 B raw / 232,130 B gzip (-132 B raw / -19 B gzip). Styles, lazy Markdown,
lazy PDF.js, and direct and unique production package counts remain unchanged
at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip, 481,994 B raw /
146,135 B gzip, 18, and 150.

Full native CI passes all 1,774 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Starting-Point Workflow Owners

`ProjectStartingPointBrowser` now binds the GitHub-import, LaTeX-import,
template-save, and toast owners directly. Import selection opens its target
workflow, catalog changes synchronize replacement choices, and deferred
template-deletion notices reach the toast owner without an application callback
bag.

This checkpoint reduces `src/client/app.ts` from 350 to 343 lines (-7) and the
starting-point browser from 582 to 580 lines (-2), removing nine runtime lines
overall. Focused coverage passes all 10 starting-point cases; affected coverage
passes 12 related runtime cases and the affected test file alongside strict
types.

The browser application artifact changes from 860,780 B raw / 232,130 B gzip to
860,611 B raw / 232,078 B gzip (-169 B raw / -52 B gzip). Styles, lazy Markdown,
lazy PDF.js, and direct and unique production package counts remain unchanged
at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip, 481,994 B raw /
146,135 B gzip, 18, and 150.

Full native CI passes all 1,774 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Reference-Library Owners

`ReferenceLibraryWorkspace` now binds the context, project-file,
web-comparison, route, and toast owners directly. PDF navigation, project
snapshot acceptance and refresh, comparison dispatch, canonical route effects,
and notices no longer pass through a second configure-time callback bag. The
old callback contract and its inert default implementation are removed.

This checkpoint reduces `src/client/app.ts` from 343 to 326 lines (-17) and
grows the Library workspace from 483 to 485 lines (+2), removing fifteen
runtime lines overall. Focused coverage passes all 15 Library workspace cases;
affected coverage passes 17 related runtime cases and the affected test file
alongside strict types.

The browser application artifact changes from 860,611 B raw / 232,078 B gzip to
860,057 B raw / 232,027 B gzip (-554 B raw / -51 B gzip). Styles, lazy Markdown,
lazy PDF.js, and direct and unique production package counts remain unchanged
at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip, 481,994 B raw /
146,135 B gzip, 18, and 150.

Full native CI passes all 1,774 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Source-Completion Owners

`SourceCompletion` now binds the project-file, editor-status, Insert-menu, and
toast owners directly for private-Library citation acceptance and relative
include insertion. Project mutation acceptance, stable-range preservation,
replacement, and success notice no longer require application callback
adapters.

This checkpoint reduces `src/client/app.ts` from 326 to 321 lines (-5) and the
source-completion owner from 343 to 341 lines (-2), removing seven runtime lines
overall. Focused coverage passes all 7 completion cases; affected coverage
passes 9 related runtime cases and the affected test file alongside strict
types.

The browser application artifact changes from 860,057 B raw / 232,027 B gzip to
859,896 B raw / 232,010 B gzip (-161 B raw / -17 B gzip). Styles, lazy Markdown,
lazy PDF.js, and direct and unique production package counts remain unchanged
at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip, 481,994 B raw /
146,135 B gzip, 18, and 150.

Full native CI passes all 1,774 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Workspace-Sharing Owners

`WorkspaceSharingPanel` now binds its sibling entry trigger and the global toast
owner directly. The application no longer adapts those owners into a
configure-time trigger and notice callback pair; the panel retains its typed
bubbling notice event for independent consumers.

This checkpoint reduces `src/client/app.ts` from 321 to 318 lines (-3) while
keeping the sharing panel at 326 lines. Focused coverage passes all 8 sharing
cases; affected coverage passes 10 related runtime cases and the affected test
file alongside strict types.

The browser application artifact changes from 859,896 B raw / 232,010 B gzip to
859,807 B raw / 232,000 B gzip (-89 B raw / -10 B gzip). Styles, lazy Markdown,
lazy PDF.js, and direct and unique production package counts remain unchanged
at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip, 481,994 B raw /
146,135 B gzip, 18, and 150.

Full native CI passes all 1,774 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project-History Owners

`ProjectHistoryDialog` now binds its sibling History trigger and the global
toast owner directly. The application no longer adapts them into a
configure-time trigger and notice callback pair; the dialog retains its typed
bubbling outcome event for independent consumers.

This checkpoint reduces `src/client/app.ts` from 318 to 315 lines (-3) while
keeping the history dialog at 234 lines. Focused coverage passes all 6 dialog
cases; affected coverage passes 8 related runtime cases and the affected test
file alongside strict types.

The browser application artifact changes from 859,807 B raw / 232,000 B gzip to
859,718 B raw / 231,985 B gzip (-89 B raw / -15 B gzip). Styles, lazy Markdown,
lazy PDF.js, and direct and unique production package counts remain unchanged
at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip, 481,994 B raw /
146,135 B gzip, 18, and 150.

Full native CI passes all 1,774 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: GitHub and Template Workflow Owners

`GitHubSyncMenu` now invokes its already-bound settings owner for settings and
preview entry instead of receiving a duplicate open-settings callback.
`ProjectTemplateSaveDialog` likewise binds the toast owner directly for
successful create-or-replace notices instead of storing an application notice
adapter.

This checkpoint reduces `src/client/app.ts` from 315 to 312 lines (-3), reduces
the GitHub sync menu from 261 to 260 lines (-1), and keeps the template-save
dialog at 246 lines, removing four runtime lines overall. Focused coverage
passes all 13 workflow cases; affected coverage passes 15 related runtime cases
and both affected test files alongside strict types.

The browser application artifact changes from 859,718 B raw / 231,985 B gzip to
859,642 B raw / 231,970 B gzip (-76 B raw / -15 B gzip). Styles, lazy Markdown,
lazy PDF.js, and direct and unique production package counts remain unchanged
at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip, 481,994 B raw /
146,135 B gzip, 18, and 150.

Full native CI passes all 1,774 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Preview Synchronization Owners

`PreviewSyncControls` now binds the native source, highlight layer,
project-file owner, and workspace Preview directly. File-qualified focus,
centered Preview-offset reads, and automatic or explicit source following no
longer pass through three application callbacks or inert default functions.

This checkpoint reduces `src/client/app.ts` from 284 to 280 lines (-4) and the
Preview synchronization control from 171 to 165 lines (-6), removing ten
runtime lines overall. Focused coverage passes both synchronization-control
cases; affected coverage passes 17 related runtime cases and the affected test
file alongside strict types.

The browser application artifact changes from 859,197 B raw / 231,950 B gzip
to 859,045 B raw / 231,884 B gzip (-152 B raw / -66 B gzip). Styles, lazy
Markdown, lazy PDF.js, and direct and unique production package counts remain
unchanged at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip,
481,994 B raw / 146,135 B gzip, 18, and 150.

## Continued Lit Ownership: Assistant Workflow Owners

`AssistantGenerationPresenter` now binds the Insert-menu, Context,
Research-rail, toast, and canonical refresh owners directly. Table insertion,
decision refresh and context presentation, evidence-rail entry, and notices no
longer pass through a five-member application workflow callback bag.

This checkpoint reduces `src/client/app.ts` from 290 to 284 lines (-6) and the
assistant presenter from 667 to 662 lines (-5), removing eleven runtime lines
overall. Focused coverage passes all 19 assistant-presenter cases; affected
coverage passes 21 related runtime cases and the affected test file alongside
strict types.

The browser application artifact changes from 859,335 B raw / 231,986 B gzip
to 859,197 B raw / 231,950 B gzip (-138 B raw / -36 B gzip). Styles, lazy
Markdown, lazy PDF.js, and direct and unique production package counts remain
unchanged at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip,
481,994 B raw / 146,135 B gzip, 18, and 150.

## Continued Lit Ownership: Private-PDF Project Owners

`ContextResourcePresenter` now binds private-PDF project API scope alongside
the existing editor-status and reference-Library owners. Caret readiness,
project snapshot acceptance, markup completion, and artifact navigation no
longer pass through five application callbacks, including a callback to the
presenter's own `openLibraryPdf` method.

This checkpoint reduces `src/client/app.ts` from 300 to 290 lines (-10) and
grows the context presenter from 1,289 to 1,291 lines (+2), removing eight
runtime lines overall. Focused coverage passes all 39 context-presenter cases;
affected coverage passes 54 related runtime cases and the affected test file
alongside strict types.

The browser application artifact changes from 859,446 B raw / 232,032 B gzip
to 859,335 B raw / 231,986 B gzip (-111 B raw / -46 B gzip). Styles, lazy
Markdown, lazy PDF.js, and direct and unique production package counts remain
unchanged at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip,
481,994 B raw / 146,135 B gzip, 18, and 150.

## Continued Lit Ownership: Context Route Owners

`ContextResourcePresenter` now binds the canonical Yjs document,
collaboration and refresh capabilities, plus the existing project-file,
editor-status, history-trigger, citation-control, Library, and toast owners
directly. Authoring state, passage selection, citation insertion, refresh, and
notices no longer pass through a seven-function application callback bag.

This checkpoint reduces `src/client/app.ts` from 312 to 300 lines (-12) and
grows the context presenter from 1,269 to 1,289 lines (+20), an eight-line
combined runtime increase that replaces a broad adapter contract with direct
typed ownership and shared semantic helpers. Focused coverage passes all 39
context-presenter cases; affected coverage passes 54 related runtime cases and
the affected test file alongside strict types.

The browser application artifact changes from 859,642 B raw / 231,970 B gzip
to 859,446 B raw / 232,032 B gzip (-196 B raw / +62 B gzip). Styles, lazy
Markdown, lazy PDF.js, and direct and unique production package counts remain
unchanged at 135,411 B raw / 23,373 B gzip, 204,779 B raw / 62,386 B gzip,
481,994 B raw / 146,135 B gzip, 18, and 150.

## Continued Lit Ownership: One-Shot Browser Entry Intents

`ProjectStartingPointBrowser` now consumes the `create=1` editor intent, removes
the one-shot query, and enters its existing bound loading workflow.
`GitHubImportPanel` likewise consumes successful OAuth and installation results,
opens its owned dialog, and removes the callback query. `WorkspaceApp` no longer
parses or branches on either workflow-specific URL contract.

This checkpoint reduces `src/client/app.ts` from 578 to 571 lines (-7), grows
the starting-point owner from 572 to 582 lines (+10), and grows the GitHub import
owner from 545 to 556 lines (+11). The 14-line combined increase makes both
one-shot intents independently testable beside the workflows they activate.
Focused coverage passes ignored and accepted query values, canonical cleanup,
owner activation, and strict types. Direct and unique production package counts
remain 18 and 150; Lit and Valibot were already pinned.

The browser application artifact increases from 859,676 B raw / 231,348 B gzip
to 859,830 B / 231,458 B (+154 B raw / +110 B gzip). Styles and lazy Markdown
and PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B /
62,386 B, and 481,994 B / 146,135 B.

Full native CI passes all 1,761 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Preview Document Observation

`WorkspacePreview` now owns one document-wide Yjs update subscription and Lit
disconnect teardown through its existing project binding. This replaces the
coordinator's separate source and bibliography observers and its duplicate local
update render, while ensuring every bound project-file update follows the same
canonical render path.

This checkpoint reduces `src/client/app.ts` from 566 to 563 lines (-3) and grows
the Preview owner from 458 to 479 lines (+21). The 18-line combined increase
makes observer lifetime explicit and removes overlapping render triggers.
Focused coverage passes document-wide update rendering, disconnect teardown,
the bound project request, and strict types. Direct and unique production
package counts remain 18 and 150; Lit and Yjs were already pinned.

The browser application artifact increases from 859,931 B raw / 231,446 B gzip
to 860,194 B / 231,511 B (+263 B raw / +65 B gzip). Styles and lazy Markdown and
PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B / 62,386 B,
and 481,994 B / 146,135 B.

Full native CI passes all 1,761 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Standalone Library PDF History

`ReferenceLibraryWorkspace` now owns private-PDF push routes, active-page route
replacement, and canonical Library fallback beside its root and addressed-
reference history. `ContextResourcePresenter` consumes that owner through one
structural route capability instead of two detached callbacks, while PDF viewer
page changes delegate directly to the same owner. `WorkspaceApp` no longer
imports or formats standalone Library routes.

This checkpoint reduces `src/client/app.ts` from 571 to 566 lines (-5), grows
the context presenter from 1,236 to 1,238 lines (+2), and grows the Library
workspace from 416 to 429 lines (+13). The ten-line combined increase completes
the standalone history authority and narrows the presenter binding. Focused
coverage passes encoded PDF pushes, active-page replacement and guards,
canonical fallback, structural presenter routing, and strict types. Direct and
unique production package counts remain 18 and 150; Lit was already pinned.

The browser application artifact changes from 859,830 B raw / 231,458 B gzip to
859,931 B / 231,446 B (+101 B raw / -12 B gzip). Styles and lazy Markdown and
PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B / 62,386 B,
and 481,994 B / 146,135 B.

Full native CI passes all 1,761 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Library History Mutation

`ReferenceLibraryWorkspace` now owns standalone Library root and addressed-
reference push/replace history writes beside its existing route parsing,
restoration subscription, and fallback behavior. Three history-effect callbacks
and their application-mode branches are removed from `WorkspaceApp`; private-PDF
route effects remain at the cross-feature viewer boundary.

This checkpoint reduces `src/client/app.ts` from 586 to 578 lines (-8) and grows
the Library workspace from 403 to 416 lines (+13). The five-line combined
increase completes one cohesive browser-route authority and narrows its callback
surface. Focused coverage passes optional root entry, encoded reference entry,
canonical fallback replacement, restoration, and strict types. Direct and unique
production package counts remain 18 and 150; Lit was already pinned.

The browser application artifact changes from 859,748 B raw / 231,347 B gzip to
859,676 B / 231,348 B (-72 B raw / +1 B gzip). Styles and lazy Markdown and
PDF.js artifacts remain unchanged at 135,411 B / 23,373 B, 204,779 B / 62,386 B,
and 481,994 B / 146,135 B.

Full native CI passes all 1,759 unit/coverage tests, 121 Workers-runtime tests,
and 74 browser tests.
