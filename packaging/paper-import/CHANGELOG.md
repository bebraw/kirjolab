# Changelog

All notable changes to the private package candidate are documented here.

## 0.1.1 - 2026-08-19

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
