# ADR-184: Retain the Bounded LaTeX Converter

**Status:** Implemented

**Date:** 2026-07-29

## Context

Kirjolab imports a conservative scholarly LaTeX subset into canonical Markdown.
Its converter currently owns both lexical recognition and product policy, so a
mature parser could reduce custom mechanics. The modularization RFC required a
measured `unified-latex` spike before changing this security-sensitive boundary.

The development-only spike parses representative prose, includes, figures,
lists, tables, literal code, TikZ, math, custom macros, and execution-capable TeX
primitives. It also records the isolated browser-compatible parser cost.

## Decision

Retain the existing bounded converter in production. Keep
`@unified-latex/unified-latex-util-parse` exact-pinned as a development-only
dependency and preserve `npm run spike:unified-latex` as the reevaluation
fixture.

The spike establishes that:

- six representative sources parse in approximately 8 ms on the development
  machine;
- common environments and known macros become structural AST nodes;
- `\citet` and `\citep` require a Kirjolab macro-signature registry before their
  arguments become structural;
- runtime macro definitions such as `\newcommand` are preserved but not
  interpreted;
- execution-capable primitives remain inert syntax; and
- the parser alone bundles to 251,007 raw bytes and 59,176 gzip bytes before an
  AST-to-Scholarmark adapter and diagnostics are added.

An adapter would still own archive-local includes, bibliography selection,
figures, literal environments, TikZ preservation and translation, source-aware
diagnostics, and reviewed output. It would therefore retain most Kirjolab policy
without yet demonstrating deletion of the handwritten lexical layer required by
the RFC acceptance gate.

Reconsider production adoption when broader macro or environment coverage is a
committed requirement and a corpus-backed adapter deletes the existing lexical
helpers rather than running beside them. Any replacement must preserve the
archive, filesystem, network, execution, source-visibility, and output bounds in
the LaTeX import specification.

## Consequences

**Positive:**

- Production bundle size, request behavior, and the existing security boundary
  do not change.
- Future parser evaluations are reproducible instead of relying on an informal
  package comparison.
- Unsupported authored constructs continue to produce explicit diagnostics or
  preserved source rather than implied compatibility.

**Negative:**

- Kirjolab continues to maintain its bounded lexical conversion mechanics.
- The development install carries the parser's transitive dependency tree even
  though production does not.
- Broader LaTeX compatibility still requires focused converter work or a future
  replacement.

## Alternatives Considered

### Adopt `unified-latex` immediately

This would improve AST construction but add a parser and a Kirjolab adapter
without removing enough existing policy or measured maintenance cost.

### Remove the spike and dependency after evaluation

This minimizes development dependencies but makes future comparisons less
repeatable and discards the exact macro-registry and bundle evidence.

### Run TeX or Pandoc

Executing arbitrary uploaded TeX would widen the trust boundary materially.
Pandoc would also introduce a separate runtime and operational model. ADR-141
already rejects both for the current importer.
