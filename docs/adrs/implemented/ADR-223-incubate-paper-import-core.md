# ADR-223: Incubate a Reviewed Paper-Import Core

**Status:** Implemented

**Date:** 2026-08-17

**Clarified:** 2026-08-18

## Context

Kirjolab's bounded LaTeX importer already performs archive validation,
conservative conversion, and reviewed project creation. Slideotter is a named
prospective consumer of the same import mechanics, but it needs a paper model
and exact source provenance rather than Kirjolab project seeds, publication
profiles, browser state, or cloud persistence.

The existing confirmation digest covers only ZIP bytes. It does not identify
the selected root, bibliography, converter behavior, schema, extracted-file
manifest, or neutral conversion output, so a confirmation can submit a
different interpretation of the same archive than the researcher reviewed.
Converter diagnostics also calculate some offsets after slicing and rewriting
source, and ordinary section prose has no discrete source inventory, which makes
those results unsafe or incomplete for downstream citation, retrieval, and
figure review.

ADR-186 requires independent-consumer evidence and explicit ownership before
package promotion. Slideotter establishes a concrete external-adapter boundary
that can qualify a private candidate under ADR-186's clarified gate, while
public registry publication still requires the remaining release gates.

## Decision

Maintain the versioned, product-neutral paper-import source under
`src/lib/paper-import/` and make the same boundary available as a private `0.x`
ESM package candidate for a maintained Slideotter adapter. The core exposes
LaTeX archive inspection, neutral conversion and provenance, canonical preview
identity, conformance fixtures, and bounded PDF page-text contracts. Kirjolab
adapters remain responsible for `ProjectTemplateSeed`, publication profiles,
UI, authorization, Durable Objects, R2, queues, OCR, and browser lifecycle.

Every retained source range is defined against the original decoded archive
file in UTF-16 code units. A consumer must be able to recover the reported
source with `originalText.slice(start, end)`. When conversion cannot reconstruct
an original range safely, it omits the affected block and emits a typed
diagnostic instead of returning an offset into transformed text.

Inventory ordinary prose as deterministic paragraph and list-item blocks with
normalized retrieval text, exact source, original-file range, and active section
identity when known. Inclusion traversal retains the active section relationship
where possible. If a block cannot receive exact original provenance, omit it and
emit a typed diagnostic.

LaTeX previews expose two SHA-256 identities: the original archive identity and
the exact reviewed-preview identity. Export
`createLatexPreviewIdentity` and `digestLatexPreviewIdentity` from the neutral
boundary. The preview digest canonically covers the identity schema, archive
hash, effective root and bibliography, converter version, conversion options,
deterministic archive manifest, and deterministic neutral conversion manifest.
The conversion manifest includes schema and converter versions, diagnostics,
semantic inventories and prose blocks, source fingerprints, figure provenance,
hashed bibliography and rendered files, and asset media types, byte counts, and
SHA-256 hashes; raw binary assets never enter canonical JSON. The Worker repeats
inspection and neutral conversion and compares both identities before adapting
or performing any project, catalog, access, document-room, or asset write.

Mark every rendered file as `scholarmark-v1`. These files remain a versioned
Kirjolab-oriented projection and are not represented as product-neutral
Markdown; the semantic and prose inventories are the neutral cross-product
authority.

The PDF seam accepts bytes through an injected PDF.js document adapter and
returns bounded, page-oriented native text with stable diagnostics and a
content hash. URL loading, canvases, OCR, browser automation, persistence, and
cloud jobs remain outside the core. Hard byte, page, and returned-text ceilings
limit the neutral result; the consumer-owned adapter still provides parser
isolation plus execution-time and memory controls for untrusted PDFs.

Archive inspection and neutral conversion also enforce non-loosenable retained-
record ceilings. Consumer-supplied limits may tighten those bounds, and invalid
limit values or exhausted record budgets fail through stable typed codes before
unbounded inventories are retained. Fixed archive-path, image-resolution,
table, TikZ, rendered-output, and derived-folder work ceilings additionally
bound malformed-input scans, candidate probing, list nesting, and conversion
amplification.
Figure provenance has an aggregate retained-code-unit ceiling, and its repeated
reference, caption, label, and enclosing-source strings become hashes in the
canonical conversion manifest so identity construction remains linear in the
bounded retained output. Prose provenance likewise has an aggregate ceiling
across normalized text and exact source slices, and the manifest hashes each
exact source slice so nested overlapping ranges cannot amplify identity work
quadratically.

Keep a versioned, deterministic conformance corpus beside the core so another
consumer can exercise archive, conversion, provenance, preview-identity,
manifest-hashing, and PDF-text behavior without importing Kirjolab application
authorities. Package the corpus behind `./conformance`, outside the main
production entry. The main package keeps `fflate` as its only mandatory parser
dependency and keeps PDF.js runtime-injected.

The private candidate emits ESM JavaScript and TypeScript declarations, targets
the documented Node 24 runtime, carries `0.x` compatibility and deprecation
policy plus README, changelog, license, and security-reporting information, and
is verified through reproducible build, reviewed tarball contents, and an
isolated install test. Creating this candidate enables the maintained Slideotter
adapter; it does not authorize registry publication, credentials, provenance, or
public release automation.

Kirjolab maintainers own private candidate releases. During `0.x`, compatible
fixes and additive contracts use patch releases, while intentional breaking
contract or behavior changes use minor releases. Deprecate a public symbol for
at least one minor release before removal when practical; urgent security or
correctness fixes may remove unsafe behavior immediately with changelog and
migration notes. If maintained external consumption does not materialize, the
reversal path is to remove the packaging metadata and build/install harness
while retaining the source-local core used by Kirjolab; no registry artifact or
consumer data migration is involved.

## Trigger

Slideotter's reviewed LaTeX-plus-PDF presentation workflow supplied the first
concrete external-adopter requirements and exposed the archive-only preview
identity and transformed-offset integrity gaps.

## Consequences

**Positive:**

- Kirjolab and a future Slideotter adapter can share one bounded conversion and
  provenance contract.
- Slideotter can install a reviewed private artifact instead of copying
  security-sensitive archive and hashing mechanics.
- Confirmation is bound to exactly what was reviewed rather than merely to the
  uploaded container bytes.
- Figure, diagnostic, and semantic source references can be verified directly
  against original decoded files.
- PDF text extraction can run locally without Kirjolab's OCR or cloud pipeline.

**Negative:**

- The private `0.x` API, corpus, and artifact add versioned contracts and
  reproducible-build work that must evolve deliberately before public
  publication.
- Exact provenance requires extra hashing and original-source bookkeeping on
  each preview and confirmation.
- Product adapters must explicitly map neutral semantic results and
  `scholarmark-v1` rendered files into their own project or presentation models.

**Neutral:**

- The production bounded converter retained by ADR-184 remains authoritative;
  this decision separates its contract and adapters rather than replacing its
  parser.
- LaTeX remains inert and one-way, and PDF remains a complementary rendered
  representation rather than a second semantic authority.

## Alternatives Considered

### Publish a public npm package immediately

Rejected because a private candidate for a named adapter does not satisfy
ADR-186's registry, credentials, provenance, and public-release requirements.
The installable `0.x` tarball proves the package boundary without making a
public distribution commitment.

### Let Slideotter copy Kirjolab's importer

Rejected because duplicated trust-boundary code would diverge on archive
limits, diagnostics, provenance, and preview identity.

### Include OCR and cloud persistence in the shared core

Rejected because they are product and deployment policy. Native byte-oriented
text extraction is the smallest useful PDF boundary for local consumers.
