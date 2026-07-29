# RFC: Modularization and Dependency Strategy

**Status:** Proposed

**Date:** 2026-07-29

## Purpose

Kirjolab has grown into several substantial product domains. This RFC proposes
where to narrow project-owned maintenance through internal module boundaries,
where to evaluate an external dependency, and which application-specific
authorities should remain local.

This is a proposal rather than an architecture decision. It covers several
independent choices and may produce multiple ADRs. Following the repository's
[ADR authoring practice](../.asdlc/practices/adr-authoring.md), each choice must
receive its own ADR if it is accepted. Implementation must update the affected
feature spec in the same change set.

## Summary

Kirjolab should not become a collection of published packages merely because
the repository is large. The immediate maintenance problem is concentrated
coupling and mixed responsibilities inside application authorities.

The recommended direction is:

1. Decompose large Durable Objects and reference-library contracts internally,
   without changing runtime behavior or adding a framework.
2. Incubate PDF analysis behind a neutral internal library boundary that can
   support highlights, references, and later citation extraction.
3. Run a measured CodeMirror 6 spike before deciding whether to replace the
   increasingly capable native textarea editor.
4. Run a separate `unified-latex` spike that replaces LaTeX parsing only while
   preserving Kirjolab's import security and conversion policy.
5. Adopt an external graph renderer only after graph interaction exceeds the
   current bounded SVG presentation.
6. Keep product identity, provenance, authorization, persistence, and review
   workflow rules inside Kirjolab.

No dependency or package extraction is approved by this RFC alone.

## Context

The 2026-07-29 diagnostics reported:

- 96,923 lines across analyzed source, tests, and tooling;
- an 81/B Fallow health score;
- average cyclomatic complexity of 2.7 and 3.9% duplication;
- 71,679 lines of non-test TypeScript under `src/`;
- 11 direct production dependencies and 229 unique production package/version
  nodes;
- a 63,889-byte gzip lazy Markdown runtime; and
- a 146,135-byte gzip lazy PDF.js runtime.

The largest non-test authorities include:

| Authority                                  | Lines | Architectural concern                                                                         |
| ------------------------------------------ | ----: | --------------------------------------------------------------------------------------------- |
| `src/durable-objects/document-room.ts`     | 5,636 | Collaboration, files, history, export, and persistence share one authority file.              |
| `src/durable-objects/review-study.ts`      | 2,766 | Review commands and SQLite projection are difficult to change independently.                  |
| `src/durable-objects/reference-library.ts` | 2,411 | Reference, PDF, research, analysis, and web-source persistence share one implementation unit. |
| `src/client/review-study.ts`               | 2,012 | A broad product workspace remains one browser component.                                      |
| `src/domain/reference-library.ts`          | 1,090 | Eighty-two dependents consume a mixed contract surface.                                       |
| `src/domain/latex-converter.ts`            |   765 | Kirjolab owns both LaTeX recognition and product conversion policy.                           |

Repository size alone is not evidence for package extraction. A useful library
boundary must isolate a coherent capability, have a small explicit API, avoid
depending on Kirjolab authorities, and either remove commodity implementation
or serve more than one real consumer.

## Goals

- Reduce the blast radius of changes to storage and shared domain contracts.
- Stop expanding custom implementations where a mature dependency owns the
  same commodity behavior.
- Create a reusable PDF-analysis seam for additional analysis kinds.
- Preserve Kirjolab's explicit security, authorization, provenance, and review
  policies.
- Keep heavy or occasional capabilities lazy and measurable.
- Make every migration reversible until it demonstrates behavioral parity.

## Non-Goals

- Convert the repository to npm workspaces immediately.
- Publish packages before a stable API and second consumer exist.
- Replace product-domain code merely to lower line count.
- Introduce an ORM, application framework, global client store, or general
  plugin system.
- Change current feature behavior as part of structural decomposition.
- Approve CodeMirror, `unified-latex`, or a graph renderer without a spike.

## Decision Principles

### Product policy stays local

Authorization, owner isolation, bounded reads, stable identity, provenance,
review workflows, atomic mutations, and canonical Markdown rules are Kirjolab
behavior. An external dependency may supply mechanics beneath those rules but
must not become their authority.

### Internal boundary before published package

A candidate starts as a source-local module with one public entry point. It may
become a workspace package only when independent build or dependency needs
justify that cost. Publication requires a second real consumer, a versioned
public contract, independent tests, and an explicit release owner.

### Adoption must retire equivalent code

A dependency experiment succeeds only when it deletes or clearly caps a
project-owned maintenance surface. Wrapping a dependency while retaining the
old implementation is not a successful adoption.

### Expensive capabilities remain lazy

Editor, PDF, graph, and conversion dependencies must not enter unrelated
browser paths. Spikes must record raw and gzip artifact changes through
`npm run diagnostics:dependencies`.

### Trust boundaries remain explicit

External packages do not replace Kirjolab's request bounds, schema validation,
path normalization, authorization, safe error mapping, or transaction rules.

## Proposed Workstreams

### 1. Decompose application authorities internally

This is the highest-confidence work because it does not require a new runtime
dependency or public package.

Each Durable Object should remain the authorization, transaction, and RPC
facade while delegating cohesive implementation to adjacent modules:

```text
Durable Object RPC facade
├── command validation and authorization
├── transactional command services
├── query/projection repositories
├── schema and migration definitions
└── backup and recovery adapters
```

The decomposition must preserve transaction placement. A repository helper may
prepare or map SQL, but it must not hide whether a mutation is atomic or move a
multi-record invariant outside its current transaction.

The domain-level `reference-library.ts` should split by capability:

```text
reference-library/
├── bibliography.ts
├── artifacts.ts
├── pdf-annotations.ts
├── artifact-analysis.ts
├── research.ts
├── web-sources.ts
├── metadata.ts
├── snapshot.ts
└── index.ts
```

The compatibility entry point may re-export contracts during migration, but
new consumers should import the narrow capability module. This is an internal
module boundary, not an npm package.

#### Acceptance gates

- No API, persisted schema, migration, or runtime behavior changes.
- Transaction and authorization tests remain at their existing boundaries.
- New modules have one-way dependencies and no circular imports.
- The former authority reads as a facade rather than a renamed monolith.
- Targeted checks and the full native CI gate pass.

### 2. Incubate `pdf-analysis-core`

Highlight detection and reference parsing are mechanics that can serve several
analysis kinds. They should move behind a neutral, source-local entry point,
initially `src/lib/pdf-analysis/index.ts`.

The core should consume normalized inputs rather than PDF.js documents or
Kirjolab persistence records:

```ts
interface PdfAnalysisPage {
  readonly page: number;
  readonly text: string;
  readonly spans: readonly PdfAnalysisTextSpan[];
}

interface PdfAnalysisBitmap {
  readonly page: number;
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
}
```

The initial public capability surface should cover:

- native PDF highlight normalization;
- flattened highlight region detection;
- bibliography boundary detection;
- reference-entry grouping and parsing;
- candidate deduplication and confidence scoring; and
- stable bounded result contracts.

PDF.js document loading, managed-browser execution, job lifecycle, storage,
authorization, polling, and UI remain Kirjolab adapters.

Citation extraction should become another consumer of this core rather than a
special case inside the reference-analysis job. Publication is deferred until
the API survives at least two analysis kinds and has a consumer outside the
Kirjolab application composition root.

#### Acceptance gates

- Core modules have no imports from `src/api`, `src/client` UI components,
  `src/durable-objects`, or Cloudflare runtime types.
- Existing fixtures produce equivalent bounded candidates.
- Analysis-kind schemas and queue state remain independent.
- The extraction removes the corresponding algorithms from their old modules.

### 3. Evaluate CodeMirror 6

The native textarea editor was selected when syntax highlighting and Vim
support were bounded additions. It now has approximately 1,675 lines across
Yjs binding, mirrored highlighting, completion geometry, citation and include
completion, Vim emulation, indentation, presence, and history modules.

CodeMirror provides modular editor state, view, history, highlighting,
indentation, completion, selection, and accessibility infrastructure. Yjs has
an existing CodeMirror 6 binding. This makes an external editor credible, but
the migration would replace a sensitive collaboration and input boundary.

The spike must be lazy-loaded and bind one existing `Y.Text`. It should port
Kirjolab's citation/include completion and Scholarmark presentation without
changing canonical Markdown or Yjs persistence.

#### Required parity matrix

| Capability    | Required evidence                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| Collaboration | Local and remote edits, relative selections, presence, reconnect, and undo behave as today.                         |
| Input         | iPad hardware/software keyboard, IME composition, paste, spellcheck, and touch selection are verified.              |
| Editing       | Spaces/tabs preferences, Tab completion priority, indentation, and browser shortcuts retain their contracts.        |
| Vim           | Existing documented commands work, or the replacement and any intentional differences receive an explicit decision. |
| Language      | Scholarmark headings, citations, references, directives, comments, and diagnostics remain visible.                  |
| Performance   | Startup, long-document editing, and raw/gzip bundle costs are recorded against the textarea baseline.               |
| Accessibility | Keyboard navigation, labels, announcements, forced colors, and screen-reader editing receive browser evidence.      |
| Offline       | The editor loads from the fingerprinted offline shell without network dependency.                                   |

Passing the spike permits a dedicated ADR; it does not require adoption. If
mobile input, accessibility, Yjs semantics, or bundle cost regress materially,
retain the textarea and use the spike to identify smaller replaceable pieces.

#### Outcome

Completed on 2026-07-29. The development-only spike passed automated checks
for two-peer Yjs synchronization, relative positions, awareness, shared undo,
citation-completion precedence, spaces and tab indentation, bounded
Scholarmark presentation, Vim `dd`, accessibility attributes, offline loading,
and 250,000-character startup. Its isolated bundle measured 772,100 raw bytes
and 257,760 gzip bytes. Physical iPad input, real IME composition,
forced-colors, and screen-reader editing remain unverified.

[ADR-182](./adrs/implemented/ADR-182-retain-native-editor-after-codemirror-spike.md)
therefore retains the native textarea and keeps CodeMirror outside production.
The experiment is reproducible with `npm run spike:codemirror`.

### 4. Evaluate `unified-latex` for parsing

Kirjolab's LaTeX import policy remains intentionally conservative: archives
are bounded, source is never executed, ambiguous conversion is reviewed, and
Markdown becomes canonical. Those are product and security rules.

The replaceable portion is LaTeX tokenization and AST construction. A spike
should parse the existing fixture corpus with `unified-latex`, then adapt its
AST into the current conversion report:

```text
archive validation and include graph       Kirjolab
LaTeX tokenization and AST                 unified-latex candidate
AST to Scholarmark conversion              Kirjolab
diagnostics, review, and project creation  Kirjolab
```

The external parser must not execute macros, access the filesystem or network,
or weaken existing archive and output bounds. Kirjolab should retain explicit
handling for includes, citations, figures, TikZ preservation, native figures,
diagnostics, and reviewed confirmation.

#### Acceptance gates

- The current malicious-archive and resource-bound tests pass unchanged.
- The real archive corpus is equivalent or improves with explicit diagnostics.
- Unsupported constructs remain visible rather than silently discarded.
- Worker bundle and request latency remain acceptable and are recorded.
- The handwritten lexical parser is removed rather than retained as a fallback.

### 5. Adopt a graph renderer only when triggered

The current citation network and project map are small, bounded SVG views. A
graph dependency is premature while nodes have deterministic presentation and
limited interaction.

Evaluate Cytoscape.js when any two of these requirements become committed:

- pan and zoom over a graph larger than the current viewport;
- draggable or persistently positioned nodes;
- multiple automatic layout strategies;
- clustering, collapsing, or progressive neighborhood expansion;
- selection and keyboard navigation shared across graph views; or
- more than 250 simultaneously rendered nodes or 500 edges.

The domain graph remains plain typed nodes and edges. A renderer owns layout,
viewport, hit testing, and interaction only. Sigma.js may be reconsidered if
measured graphs reach thousands of simultaneously visible nodes and WebGL
throughput becomes more important than rich DOM interaction.

### 6. Keep review logic as an internal bounded context

Review protocols, screening, extraction, appraisal, synthesis, PRISMA export,
and audit history form a coherent domain, but they are also a Kirjolab product
authority. They should be grouped behind narrower internal modules and facades,
not published as a general review engine today.

A `review-core` package becomes credible only if a second executable, such as a
review export CLI or independent service, needs the same pure protocol and
projection contracts without importing browser, API, or Durable Object code.

## Dependency Decisions Deferred or Rejected

### npm workspaces now

Rejected for the first stage. Workspace packages add manifests, build and test
coordination, dependency boundaries, and release questions before there is a
second build unit. Source-local modules can establish the same conceptual
boundaries more cheaply.

### ORM for Durable Object SQLite

Rejected as a decomposition mechanism. Most complexity comes from Kirjolab's
authorization, lifecycle, atomicity, migrations, and cross-record invariants.
An ORM would change query syntax without separating those responsibilities.

### Worker router framework

Deferred. Route matching is not the dominant API maintenance cost; handlers
are large because they enforce authorization and product workflow contracts.

### Full GitHub SDK

Deferred. Existing transport deliberately enforces bounded response reads,
Workers-compatible request scoping, subtree policy, optimistic concurrency,
and stable public errors. Broader SDK adoption is useful only if a specific new
GitHub capability removes more protocol code than its adaptation layer adds.

### General model-provider SDK

Deferred. The current provider is intentionally OpenAI-compatible and bounded.
Provider SDKs become useful when Kirjolab commits to materially different
provider protocols, streaming tool calls, or server-owned credentials.

### Citation.js

Deferred under ADR-175. Scholarmark's bounded bibliography support is adequate
until broader BibLaTeX, RIS, CSL processing, or citation-style execution
becomes a product requirement.

### Publishing UI components

Rejected. Kirjolab's light-DOM Lit components encode its application workflows,
semantic tokens, and typed intents. Reuse inside the application does not imply
a stable external component library.

## Delivery Sequence

Each numbered step is independently reviewable and may stop without committing
the repository to later work:

1. Split the domain reference-library contracts by capability.
2. Decompose one Durable Object vertical slice to establish the facade,
   repository, and command-service convention.
3. Extract the internal PDF-analysis core and make highlight and reference
   analysis its first two consumers.
4. Build the CodeMirror parity spike outside the production path and decide it
   through a dedicated ADR.
5. Build the `unified-latex` corpus spike and decide it through a separate ADR.
6. Revisit graph rendering when the stated interaction triggers are met.
7. Introduce workspace packages or publication only after a qualifying second
   consumer exists.

Structural changes should use `npm run quality:affected` while iterating and
must pass `npm run ci:local` before they are considered ready. Dependency
changes must additionally record `npm run diagnostics:dependencies` before and
after measurements.

## Success Measures

- Large authorities become narrow facades with cohesive one-way collaborators.
- Consumers import only the contracts they need rather than a mixed domain
  surface.
- A dependency adoption deletes equivalent custom mechanics and does not weaken
  application policy.
- Lazy bundle growth is explicit and justified by retired maintenance.
- PDF analysis supports additional kinds without queue or UI coupling.
- Published packages, if any, have a demonstrated second consumer and an owner.
- Every accepted choice has an ADR, updated feature spec, focused regression
  tests, and a reversible migration plan.

## Open Questions

- Does CodeMirror meet Kirjolab's iPad, IME, spellcheck, and Yjs undo behavior
  without application-specific patches?
- Can a Scholarmark-aware CodeMirror language layer reuse public Scholarmark
  parsing contracts without coupling to package internals?
- Does `unified-latex` reduce maintained parsing code after the Kirjolab adapter
  and diagnostics are included?
- Which future citation-extraction input makes `pdf-analysis-core` genuinely
  reusable rather than merely relocated?
- What graph size and interaction model will actual reference-analysis data
  require?

## Resulting Decision Records

If this RFC is accepted, it should produce separate ADRs for:

- the internal PDF-analysis boundary;
- CodeMirror adoption or explicit retention of the native textarea;
- `unified-latex` adoption or retention of the bounded converter;
- a graph-rendering dependency when its trigger is met; and
- npm workspace or package publication policy if a second consumer appears.
