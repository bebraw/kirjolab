# Changelog

All notable changes to the private package candidate are documented here.

## 0.1.2 - 2026-08-19

- Exclude section commands and section-bearing includes inside prose-excluded
  environments before section inventory and prose traversal.
- Omit cross-file includes inside outer and nested list items from normalized
  parent text with exact provenance diagnostics instead of leaking raw item
  syntax or ambiguous child prose.
- Reissue the prose-exclusion correction through a checked release manifest
  after discovering that the `0.1.1` tarball was built by different Node.js and
  npm versions than its recorded provenance claimed.
- Enforce the exact release Node.js and npm versions before building, then
  verify the candidate filename, byte count, toolchain, and SHA-256 digest.

## 0.1.1 - 2026-08-19

> Superseded by `0.1.2`. The recorded artifact was actually packed with Node.js
> 26.7.0 and npm 11.19.0; its earlier Node.js 24.15.0 and npm 11.12.1 provenance
> statement was incorrect.

- Exclude nested figure, table, code, and math environments from normalized
  list-item retrieval text while preserving exact item provenance and dedicated
  semantic inventories.
- Exclude prose and list markers from files included inside prose-excluded
  environments without splitting the authored parent item.
- Exclude `\\bibliography`, `\\addbibresource`, and `\\bibliographystyle`
  commands from normalized list-item text while preserving exact provenance.

## 0.1.0 - 2026-08-18

- Add bounded LaTeX archive inspection and neutral conversion.
- Add exact UTF-16 semantic and prose provenance.
- Add canonical reviewed-preview and conversion-manifest identities.
- Add an explicit `scholarmark-v1` rendered-file format marker.
- Add a separate external conformance export.
- Add runtime-injected, bounded PDF text extraction.
