# `@kirjolab/paper-import`

Private `0.x` package candidate for maintained paper-import adapters. It exposes
bounded LaTeX archive inspection and neutral conversion, canonical preview
identity, exact UTF-16 prose provenance, reusable conformance fixtures, and
runtime-injected PDF text extraction.

The package has two public exports:

```js
import {
  convertLatexProject,
  createLatexPreviewIdentity,
  createPdfTextExtractor,
  digestLatexPreviewIdentity,
  inspectLatexArchive,
} from "@kirjolab/paper-import";
import { createPaperImportConformanceCorpusV2 } from "@kirjolab/paper-import/conformance";
```

The conformance corpus is deliberately absent from the main production export.
Converted files identify their content as `scholarmark-v1`; consumers must not
treat that rendered content as neutral Markdown. Semantic inventories and exact
source ranges provide the product-neutral integration boundary.

## Runtime and dependencies

- Supported runtime: Node.js `24.15.0` on macOS.
- Module format: ESM, with TypeScript declarations.
- Mandatory runtime dependency: `fflate@0.8.3` only.
- PDF.js is consumer-owned and runtime-injected through
  `createPdfTextExtractor`. The package candidate is conformance-tested with
  `pdfjs-dist@6.2.108`, but does not install or import it.
- Kirjolab application, API, storage, authorization, UI, Cloudflare, OCR, and
  collaboration modules are outside this package boundary.

Build the deterministic staging directory with
`npm run build:paper-import-package`. Create the reviewed tarball with
`npm run paper-import:pack`. The package remains private and is not intended for
registry publication.

## `0.x` compatibility policy

The Kirjolab maintainers own candidate releases. During `0.x`, compatible fixes
and additive declarations use patch releases; intentional breaking contract or
behavior changes use minor releases. When practical, a public symbol is
deprecated for at least one minor release before removal. Security or
correctness fixes may remove unsafe behavior immediately and will be called out
in the changelog and migration notes.

See `SECURITY.md` for private vulnerability reporting.
