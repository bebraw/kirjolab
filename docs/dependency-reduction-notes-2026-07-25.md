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
