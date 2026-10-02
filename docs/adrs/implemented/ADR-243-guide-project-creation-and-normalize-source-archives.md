# ADR-243: Guide Project Creation and Normalize Source Archives

**Status:** Implemented

**Date:** 2026-10-02

## Context

New project opens a dialog over a running editor, even when the researcher
has not chosen a project. Native ZIP import requires Kirjolab's manifest and
project state. Ordinary Markdown project folders lack these files and can
exceed the ZIP entry limit because they contain dependencies, Git history,
and macOS metadata.

## Decision

Make `/projects/new` the dedicated project-creation surface. Starting point,
project setup, and review precede creation. Templates, existing project
structures, Markdown source ZIPs, native Kirjolab ZIPs, LaTeX, and GitHub
use the existing APIs and Lit owners. The creation page does not initialize
an editor, collaboration socket, or offline project store. Dashboard and
editor New project actions lead here; legacy `?create=1` links redirect here.

Normalize ordinary Markdown source archives into the validated native
project-state and manifest contracts in memory. Suggest a title and entry
document; let the researcher change the entry, select one bibliography,
and include or omit bundled PDFs before preview or during review. Omitted
PDFs are skipped before inflation and retained-content accounting, while
root inference stays stable across choices. Preserve Markdown bytes as UTF-8 text,
relative paths, citation aliases, and image and PDF bytes. Link selected
BibTeX entries through the existing Library reconciliation path. Bundled
PDFs become project-owned PDFs without guessing reference relationships.
Generate deterministic source identities and metadata so repeat inspection
and confirmation agree. Reuse native import staging, ownership, cleanup,
and idempotent completion, binding setup selections to the preview digest.

Permit at most 16,384 raw ZIP entries and 64 MiB of declared expanded source
content. Skip dependencies, version control, macOS metadata, directories,
and unsupported files before decompression. Retained content remains bounded
to 1,024 files and 20 MiB, with the existing native state collection limits.
Keep compressed input at 20 MiB and text files at 2 MiB. Validate every
central path, duplicate, symlink, compression method, and expansion ratio;
validate local headers even for skipped files. Selected content must pass
the existing graph and binary-signature validation. These explicit bounds
respect [Workers' memory constraints](https://developers.cloudflare.com/workers/platform/limits/#memory).

A ZIP declaring a root `manifest.json` always uses the existing strict native
importer. Invalid or unsupported native manifests never fall back to source
import. Unrelated nested manifest/project JSON files are skipped. Native ZIPs
keep their original 1,024-entry and 20 MiB expanded limits.
This extends [ADR-241](./ADR-241-add-lossless-native-project-archives.md)
without changing its native preservation and integrity contract.

## Trigger

A real paper ZIP with 1,782 entries failed before Kirjolab could recognize its
manuscript and bibliography. The requested import relaxation also exposed
the editor-backed creation dialog as the wrong place to assemble a project.

## Consequences

**Positive:**

- Existing Markdown projects need no manually authored Kirjolab JSON files.
- Researchers review setup before entering the editor.
- Source imports reuse established reference matching and rollback behavior.

**Negative:**

- Source projects cannot reconstruct comments, history, or collaboration metadata.
- One bibliography is selected; additional BibTeX files require separate import.
- Large projects remain bounded and must be reduced before upload.

**Neutral:**

- The browser retains the uploaded ZIP for repeat previews and confirmation.
- No raw archive staging store, generated directory, dependency, or new binding is added.

## Alternatives Considered

### Raise the native ZIP entry limit alone

This would leave ordinary project folders without required metadata and
inflate dependencies that do not belong in the writing project.

### Require hand-written manifests or a separate conversion utility

This puts internal schema details into the researcher's workflow and duplicates
the existing preview, Library matching, and project creation contracts.

### Keep creation in an editor dialog

This initializes a project behind setup and continues to couple project
selection to an already active authoring workspace.
