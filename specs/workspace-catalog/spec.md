# Feature: Workspace Catalog and Navigation

## Blueprint

### Context

A researcher needs separate lines of inquiry with isolated manuscripts,
evidence, annotations, and collaborators. Workspaces must be discoverable and
addressable without collapsing their collaboration state into one process.
The application dashboard and editor should expose those projects without
making the storage term `workspace` the primary browser hierarchy.

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
- `/editor/{id}` is the canonical browser representation and
  `/api/workspaces/{id}` remains the stable API representation.
- `/editor` redirects to the first active authorized catalog entry, which is
  the seeded `demo` workspace by default. `/` is the authenticated dashboard
  and must not initialize a document room or collaboration socket.
- `/workspaces/{id}` redirects to `/editor/{id}` while preserving the query
  string. New browser links use only the canonical editor prefix.
- The dashboard exposes a bounded, condensed recent-project projection from
  the authorized catalog. Selecting a project navigates to its canonical editor
  URL before project state is loaded.
- The application shell pairs a compact current-project selector with a
  labelled Projects browser. The browser filters the authorized catalog by
  title, marks the current project, and links directly to stable project URLs.
- Unknown browser routes render the shared responsive visual shell, identify
  the missing path, and provide a direct return to the dashboard.

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
- [x] Creation returns and navigates to a stable UUID editor URL.
- [x] The workspace switcher lists catalog entries and opens another workspace.
- [x] A searchable project browser makes larger catalogs discoverable without
      expanding the primary authoring header.
- [x] The dashboard provides bounded project access without opening a workspace.
- [x] Legacy `/workspaces/{id}` links redirect to `/editor/{id}` without losing
      valid query state.
- [x] Source edits and scholarly resources remain isolated by workspace id.
- [x] Unknown workspace API identities return not found.
- [x] Browser tests prove dashboard discovery, creation, canonical and legacy
      navigation, and source isolation.

### Regression Guardrails

- Workspace titles must be non-empty and at most 120 characters.
- Workspace route ids must match the bounded alphanumeric/hyphen grammar.
- Every workspace API request must resolve through the current owner catalog.
- A document room must not enumerate or coordinate unrelated workspaces.
- PDF keys must stay under `{workspaceId}/{pdfId}.pdf`.
- Dashboard rendering must not fetch a workspace snapshot, restore offline Yjs
  state, or connect a workspace socket.
- Compatibility redirects must retain bounded query parameters without making
  `/workspaces/{id}` a second canonical state authority.

### Scenarios

**Scenario: Researcher starts another inquiry**

- Given: the researcher is in one workspace
- When: they create a workspace with a valid title
- Then: Kirjolab initializes isolated source state, registers it in the owner
  catalog, and navigates to `/editor/{id}`

**Scenario: Researcher switches workspaces**

- Given: two cataloged workspaces contain different source
- When: the researcher selects the other workspace
- Then: the browser opens its canonical editor resource and connects to only
  that document room

**Scenario: Researcher enters through the dashboard**

- Given: the current owner has authorized catalog entries
- When: they open `/`
- Then: Kirjolab lists bounded project summaries without selecting a project or
  starting collaboration

**Scenario: Legacy project bookmark remains valid**

- Given: a bookmark points to `/workspaces/{id}` with valid editor query state
- When: the owner follows it
- Then: Kirjolab redirects to `/editor/{id}`, preserves the query string, and
  applies the normal catalog authorization before loading project state
