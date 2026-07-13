# ADR-081: Read Private Library PDFs in Context

**Status:** Partially superseded by [ADR-082](./ADR-082-capture-private-library-pdf-highlights.md)

**Date:** 2026-07-13

## Context

The private reference library accepts PDFs, retains their owner-scoped bytes,
and supports reviewed metadata, but the Library surface cannot open an attached
PDF for ordinary reading. Researchers must otherwise share or separately import
the artifact into a project merely to inspect content, weakening the boundary
between private research memory and collaborative project evidence.

Kirjolab already has a PDF.js context reader with local page and scroll state.
Its existing `pdf:` tabs, however, are authorized by the workspace snapshot and
enable project annotation capture. Reusing that identity for a private artifact
would conflate authorization scopes and could send selections to project
annotation routes.

## Decision

Private library artifacts open in the existing context reader through a
kind-qualified `library-pdf:{artifactId}` tab. The tab is authorized against the
current owner-library snapshot and streams bytes only through the existing
owner-private, non-cacheable library PDF endpoint.

The reader uses an explicit read-only mode for private library artifacts. It
keeps PDF text and page navigation available, hides project intake and evidence
controls, and never emits selection-capture callbacks. Page, within-page scroll,
open, pin, and close state remain local browser context state. They are not
written to the library, project, Yjs document, or collaboration protocol.

Workspace `pdf:` and private `library-pdf:` tabs remain distinct even when ids
or filenames coincide. Context reconciliation checks workspace PDFs against the
workspace snapshot and library PDFs against the owner-library snapshot. Opening
a private artifact never adds it to a project, shares it, creates an annotation,
or changes its bibliographic record.

## Consequences

**Positive:**

- Uploading a private PDF now leads directly to a usable reading workflow.
- Existing rendering and local tab-state behavior are reused without another viewer.
- Kind-qualified identities preserve the private/project authorization boundary.
- Read-only mode prevents accidental project mutations from private selections.

**Negative:**

- Private PDFs cannot create highlights or notes from the reader in this slice.
- Only one PDF is rendered at a time, so switching private and project tabs reloads bytes.
- Library-tab authorization depends on a current owner snapshot in the browser.

**Neutral:**

- Explicit project sharing, project PDF import, and artifact rights remain unchanged.
- The private library PDF download route retains its existing contract.

## Alternatives Considered

### Open the PDF in a separate browser tab

This is smaller, but loses Kirjolab's context tabs, local reading position, and
side-by-side authoring workflow.

### Import or share before reading

This reuses project PDF behavior but turns a navigation action into a durable
privacy or collaboration mutation.

### Enable private highlights immediately

The library already stores highlight records, but capture requires a separate
review of private annotation editing, persistence, and later sharing semantics.
Keeping this slice read-only completes reading without silently broadening it.
