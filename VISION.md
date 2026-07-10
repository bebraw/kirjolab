# Kirjolab Architectural Vision

## Purpose

Kirjolab is a scholarly workspace for turning source material into traceable
writing. It combines a fast, collaborative WYSIWYM editor with a working memory
for publications, PDFs, annotations, claims, and notes.

These are not separate products joined by integration. They are two views over
the same body of scholarly work:

- the editor organizes knowledge into publishable arguments
- the library preserves the evidence, annotations, and relationships behind
  those arguments

The defining workflow is the movement from source material to annotation, from
annotation to claim, and from claim to cited prose without losing provenance.

## The Actual Human

Kirjolab is initially for a researcher-writer who is comfortable with Markdown,
bibliographies, structured documents, and local development tools. They value
portable files, keyboard-oriented workflows, inspectable automation, and fast
feedback more than opaque convenience.

Collaboration matters, but the individual researcher must retain a complete,
usable scholarly record independent of a hosted service.

## Point of View

### Writing and working memory form one system

A citation in a manuscript, a highlighted passage in a PDF, and a note about the
passage should remain connected. Kirjolab should make those connections explicit
and useful rather than forcing the writer to reconstruct them across tools.

### Meaning stays visible

The editor follows WYSIWYM: the author works with meaningful source while a fast
preview shows the rendered result. Kirjolab should help authors understand and
correct structure; it should not hide the source format behind a proprietary
rich-text model.

### Portable source is the durable artifact

Authored Markdown and bibliography data must remain readable and useful outside
Kirjolab. Collaboration state, indexes, previews, embeddings, and model output
are supporting representations. None may become the only usable copy of the
work.

### Hypermedia is the interaction model

Documents, sections, publications, PDFs, annotations, claims, notes, people,
projects, and model suggestions are addressable resources. Their representations
expose typed links and relevant actions so users can follow the scholarly record
instead of navigating a generic graph visualization.

### AI proposes; the researcher decides

Language models may explain, compare, extract, connect, and revise, but they must
operate on explicit context and return reviewable candidates. Model identity,
source material, and accepted changes remain inspectable. Local models are a
first-class provider target, including models that benefit from small,
well-structured tasks.

## Taste References

- [Overleaf](https://www.overleaf.com/) demonstrates the value of a focused
  source-and-preview writing loop and rapid collaborative feedback. Kirjolab
  applies that immediacy to meaningful Markdown rather than hiding document
  semantics.
- [Zotero](https://www.zotero.org/) demonstrates that a research library should
  be durable working infrastructure, not a temporary import screen. Kirjolab
  narrows the initial library scope and connects each useful source directly to
  annotations and prose.
- [SlideOtter](https://github.com/bebraw/slideotter) demonstrates a local-first,
  inspectable candidate-review-apply loop that works with local language models.
  Kirjolab carries that control boundary into scholarly writing.

## Core Resource Model

Kirjolab treats the following as first-class resources:

- **Document:** portable authored source and its publication metadata
- **Section:** a stable semantic target within a document
- **Publication:** bibliographic identity and metadata independent of a citation
  key
- **PDF:** an immutable source artifact associated with a publication when known
- **Annotation:** a selector-backed observation on a PDF or other source
- **Claim:** a concise proposition that may be supported, contradicted, or used
  in writing
- **Note:** working material that is not yet a claim or authored prose
- **Link:** a typed relationship such as `cites`, `supports`, `contradicts`,
  `extends`, `annotates`, `derived-from`, or `used-in`
- **Suggestion:** a proposed operation or patch with model and source provenance

Resource identities are stable and internal. Citation keys, titles, routes,
heading slugs, DOI values, and filenames are mutable or external identifiers,
not universal primary keys.

## Document and Preview Model

Kirjolab supports standard Markdown plus the structured citation and
cross-reference syntax defined by the
[scientific-writing syntax](https://github.com/survivejs/learnscientificwriting/blob/main/content/book/SYNTAX.md).

The editing pipeline is:

1. Markdown source is the authored representation.
2. A pure parser produces a semantic syntax tree with source ranges.
3. Validation resolves citations, references, aliases, and anchors against the
   workspace.
4. A renderer produces disposable preview output.
5. Source ranges connect editor selections, diagnostics, comments, preview
   elements, and scholarly resources.

Preview and validation should update incrementally during normal editing.
Selecting a semantic element in either source or preview should reveal its
counterpart and related resources.

## Collaboration Model

Real-time collaboration synchronizes document text and collaboration metadata,
not the parsed syntax tree or rendered output. The shared state must regularly
materialize into clean Markdown so a document remains recoverable without the
collaboration runtime.

The first collaboration contract includes concurrent editing, presence,
selections, comments anchored to document ranges, and recoverable history.
Track changes and editorial approval workflows are later capabilities.

## Source and Annotation Model

PDFs are preserved as source artifacts. Annotations are separate resources and
do not require rewriting the PDF. Each PDF annotation should combine:

- artifact identity
- page and geometric position
- exact quoted text
- surrounding textual context

Geometry enables faithful display while text selectors provide recovery when a
PDF representation changes. An annotation can link to publications, claims,
notes, document passages, and other annotations.

## Local Model Integration

Kirjolab exposes provider-neutral model operations through a local-capable
gateway. A hosted client may use a companion process to reach models running on
the researcher's machine.

Model actions are scoped to explicit resources and return typed candidates, for
example:

- explain a selected passage
- compare a set of annotations
- find evidence relevant to a paragraph
- extract candidate claims or metadata
- identify assertions that lack citations
- propose a grounded Markdown patch

Applying a candidate is a separate, explicit action. Direct, unreviewed model
mutation of canonical documents or scholarly links is outside the architecture.

## Architectural Boundaries

- Canonical content must be exportable without private runtime state.
- Rendered HTML, search indexes, embeddings, and previews are rebuildable.
- Resource storage and blob storage may evolve independently of the authoring
  format.
- Typed links are part of the domain model; a graph database is not required.
- Collaboration transport is isolated from parsing and document semantics.
- Model providers are isolated behind a capability-oriented interface.
- Every generated assertion or revision that enters the scholarly record must
  retain enough provenance for a human to inspect its basis.

## First Vertical Slice

The first meaningful release should prove the complete scholarly loop:

1. Open and collaboratively edit one Markdown document.
2. Render and validate citations and cross-references while editing.
3. Import one PDF and create a resilient annotation.
4. Link that annotation to a document passage or claim.
5. Ask a local model for a revision grounded in selected resources.
6. Review and apply the proposed Markdown patch.
7. Export the document and bibliography in portable form.

This slice is more important than broad feature coverage. Collaborative editing
alone and PDF annotation alone are established categories; Kirjolab is defined
by the traceable path between them.

## Decision Heuristics

When credible approaches compete, prefer the one that:

1. preserves portable scholarly artifacts
2. keeps provenance and meaning inspectable
3. shortens the feedback loop between evidence and prose
4. supports local operation and weak local models
5. keeps derived state rebuildable
6. introduces the smallest architecture that proves the vertical slice

## Non-Goals for the Initial Product

- replacing every Zotero library-management feature
- hiding Markdown behind a general-purpose rich-text editor
- making a graph canvas the primary navigation model
- silently rewriting authored work with an LLM
- embedding annotations by mutating imported PDF files
- implementing track changes before basic collaboration is reliable
