# Feature: Scholarly Workspace Vertical Slice

## Blueprint

### Context

Kirjolab needs to prove one complete scholarly loop before expanding into a
general editor or reference manager. A researcher must be able to move evidence
from an immutable PDF into an anchored annotation, connect it to manuscript
text, ask a local model for a grounded revision, review the candidate, and
export portable source.

The compatible `demo` workspace remains the root experience, while additional
UUID workspaces are discovered through the local-owner catalog. The current
surface supports loopback local identity and a fail-closed Cloudflare Access
mode for authenticated hosted collaboration.

### Architecture

- **Application shell:** `src/views/home.ts` renders the accessible workspace;
  `src/client/app.ts` provides typed browser behavior bundled into
  `.generated/app.txt`.
- **Workspace navigation:** `WorkspaceCatalog` lists and creates stable
  workspace resources while each `DocumentRoom` retains isolated coordination.
- **Access control:** Verified Cloudflare Access identities or loopback-local
  identities resolve explicit owner/member roles before workspace state.
- **Document semantics:** Satteri parses standard Markdown and GFM while
  `src/domain/markdown.ts` adds headings, citations, references, aliases,
  anchors, validation, and preview security from the scientific-writing syntax.
- **Collaboration:** `DocumentRoom` is a SQLite-backed Durable Object for the
  `demo` document. Browser and server exchange Yjs updates through hibernatable
  WebSockets. Each update materializes Yjs state, Markdown, BibTeX, and a
  monotonically increasing revision together.
- **Resource metadata:** The document Durable Object stores PDF artifact fingerprints, annotations,
  publication projections, passage links, and model candidates alongside the
  document coordination atom.
- **Reference library:** BibTeX imports merge into canonical bibliography text
  and materialize stable publication resources. DOI-backed Crossref enrichment
  is an explicit action.
- **Blob storage:** The `PAPERS` R2 binding stores immutable PDF bytes under a
  workspace-scoped key. PDF responses stream from R2 and the R2 ETag identifies
  the exact stored artifact.
- **Evidence capture:** PDF.js renders one selectable page. Text selection
  creates exact quote/context selectors plus normalized page rectangles before
  the annotation is saved.
- **Local models:** The browser calls a user-configured OpenAI-compatible local
  endpoint. Kirjolab receives a typed candidate containing provider/model
  identity, source resource ids, source revision, and proposed Markdown.
- **Mutation boundary:** A pending candidate can be inspected, rejected without
  changing source, or applied only while its source revision is current.
- **Exports:** Dedicated endpoints return `document.md` and `bibliography.bib`
  with download metadata.

### API Contracts

- `GET /api/workspaces` returns the current owner's workspace summaries.
- `POST /api/workspaces` creates and registers an isolated workspace.
- `GET /api/workspaces/demo` returns the complete workspace representation.
- `GET /api/workspaces/demo/socket` upgrades to the collaborative Yjs channel.
- `POST /api/workspaces/demo/pdfs` streams one PDF of at most 25 MB to R2.
- `GET /api/workspaces/demo/pdfs/{id}` streams an imported PDF.
- `POST /api/workspaces/demo/annotations` creates a selector-backed annotation.
- `POST /api/workspaces/demo/bibliography/import` merges valid BibTeX entries.
- `POST /api/workspaces/demo/publications/{id}/enrich` explicitly enriches a
  DOI-backed publication through Crossref.
- `POST /api/workspaces/demo/links` links an annotation to an exact current
  manuscript range.
- `POST /api/workspaces/demo/candidates` persists a review candidate.
- `POST /api/workspaces/demo/candidates/{id}/apply` applies a current pending
  candidate.
- `POST /api/workspaces/demo/candidates/{id}/reject` rejects a pending
  candidate without changing source.
- `GET /api/workspaces/demo/export/document.md` exports canonical Markdown.
- `GET /api/workspaces/demo/export/bibliography.bib` exports canonical BibTeX.

### Anti-Patterns

- Do not make Yjs state, rendered HTML, or a candidate the only usable document
  representation.
- Do not proxy arbitrary local-model endpoints through the hosted Worker.
- Do not accept stale model candidates or stale passage ranges.
- Do not buffer PDF bodies in Worker memory.
- Do not write annotation data into imported PDFs.
- Do not deploy with local authentication or without a protected Cloudflare
  Access hostname and matching JWT configuration.
- Do not claim CSL-complete bibliography formatting or direct Worker-side
  Satteri execution in this slice.

## Contract

### Definition of Done

- [x] Two browser sessions converge on one collaborative Markdown document.
- [x] Markdown changes update a semantic preview and diagnostics immediately.
- [x] Citation and reference targets are validated against BibTeX and document
      targets.
- [x] BibTeX imports materialize stable publication resources independently of
      citation keys.
- [x] A PDF can be imported, rendered with selectable text, streamed back, and
      annotated without mutation.
- [x] An annotation can be linked to the exact selected manuscript range.
- [x] A local model can return a grounded candidate with inspectable provenance.
- [x] Candidate application is explicit and rejects stale revisions.
- [x] Markdown and BibTeX export without private collaboration state.
- [x] Unit coverage and browser tests exercise the critical workflow.

### Regression Guardrails

- Canonical source and bibliography must be materialized after every accepted
  Yjs update.
- Document updates must be scoped to one Durable Object per workspace/document
  coordination atom.
- PDF uploads must require `application/pdf`, a known positive content length,
  and the 25 MB size limit.
- Annotation creation must require a known PDF, positive page number, exact
  quote, textual context fields, and valid bounded geometry when present.
- Passage links must match the current source at their supplied offsets.
- Applying a model candidate must fail after the document revision changes.
- Browser code must remain external to Worker-rendered HTML and pass both strict
  worker and client TypeScript configurations.

### Verification

- `src/domain/**/*.test.ts` covers semantic rendering, validation, guards, and
  model-operation helpers.
- `src/worker.test.ts` covers routing, generated assets, and missing-binding
  behavior.
- `src/worker.e2e.ts` exercises real local Durable Object, WebSocket, and R2
  behavior, including the full evidence-to-prose workflow.
- `npm run quality:gate` and `npm run ci:local` are the readiness gates.

### Scenarios

**Scenario: Collaborative source becomes a preview**

- Given: the demo workspace is open in a browser
- When: a writer changes the Markdown source
- Then: collaborators converge, the Durable Object materializes Markdown, and
  the semantic preview updates

**Scenario: Evidence becomes linked working memory**

- Given: a PDF is imported
- When: the researcher records a page, exact quote, surrounding context, and a
  note through an in-view text selection, then selects manuscript text
- Then: Kirjolab stores an external annotation and a typed passage link without
  changing the PDF

**Scenario: Local model proposes grounded prose**

- Given: manuscript text and annotations are explicitly selected
- When: the local model returns revised Markdown
- Then: Kirjolab stores a pending candidate with provider, model, revision, and
  source ids while leaving canonical Markdown unchanged

**Scenario: Researcher applies a current candidate**

- Given: a pending candidate targets the current document revision
- When: the researcher inspects and applies it
- Then: the candidate is accepted, canonical Markdown changes, and all
  collaborators receive the update

**Scenario: Researcher exports portable work**

- Given: the manuscript and bibliography have been edited collaboratively
- When: the researcher requests both export endpoints
- Then: plain Markdown and BibTeX downloads are returned without Yjs or private
  runtime state
