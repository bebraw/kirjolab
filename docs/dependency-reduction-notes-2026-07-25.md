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
