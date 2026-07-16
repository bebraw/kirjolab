# Feature: Workspace Catalog and Navigation

## Blueprint

### Context

A researcher needs separate lines of inquiry with isolated manuscripts,
evidence, annotations, and collaborators. Workspaces must be discoverable and
addressable without collapsing their collaboration state into one process.

### Architecture

- `WorkspaceCatalog` is a SQLite-backed Durable Object selected by owner id.
- Catalog selection uses the authenticated identity's opaque email digest. The
  compatible default local identity retains the `local` placeholder.
- `DocumentRoom` remains selected by workspace id and owns document-scoped
  coordination and metadata.
- R2 PDF object keys begin with the workspace id.
- `GET /api/workspaces` lists at most 200 catalog summaries.
- `POST /api/workspaces` validates a title, initializes a document room, and
  registers a UUID workspace summary.
- `/workspaces/{id}` is the stable browser representation and
  `/api/workspaces/{id}` is the stable API representation.
- `/` remains the browser representation of the seeded `demo` workspace.
- The application shell pairs a compact current-project selector with a
  labelled Projects browser. The browser filters the authorized catalog by
  title, marks the current project, and links directly to stable project URLs.
- Unknown browser routes render the shared responsive visual shell, identify
  the missing path, and provide a direct return to Kirjolab.

### Anti-Patterns

- Do not put unrelated collaborative documents into one Durable Object.
- Do not infer workspace existence from a caller-supplied id without checking
  its owner catalog.
- Do not store document source, annotations, or PDFs in the catalog.
- Do not allow workspace ids into R2 keys without the bounded id grammar.
- Do not accept a catalog identity that has not passed the authentication
  boundary.

## Contract

### Definition of Done

- [x] The local catalog contains the compatible demo workspace.
- [x] A researcher can create a titled workspace from the application shell.
- [x] Creation returns and navigates to a stable UUID workspace URL.
- [x] The workspace switcher lists catalog entries and opens another workspace.
- [x] A searchable project browser makes larger catalogs discoverable without
      expanding the primary authoring header.
- [x] Source edits and scholarly resources remain isolated by workspace id.
- [x] Unknown workspace API identities return not found.
- [x] Browser tests prove creation, listing, navigation, and source isolation.

### Regression Guardrails

- Workspace titles must be non-empty and at most 120 characters.
- Workspace route ids must match the bounded alphanumeric/hyphen grammar.
- Every workspace API request must resolve through the current owner catalog.
- A document room must not enumerate or coordinate unrelated workspaces.
- PDF keys must stay under `{workspaceId}/{pdfId}.pdf`.

### Scenarios

**Scenario: Researcher starts another inquiry**

- Given: the researcher is in one workspace
- When: they create a workspace with a valid title
- Then: Kirjolab initializes isolated source state, registers it in the owner
  catalog, and navigates to its stable URL

**Scenario: Researcher switches workspaces**

- Given: two cataloged workspaces contain different source
- When: the researcher selects the other workspace
- Then: the browser opens its stable resource and connects to only that
  document room
