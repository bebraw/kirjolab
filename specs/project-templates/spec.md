# Feature: Project Templates

## Blueprint

### Context

Researchers repeatedly use the same paper structures, publication settings,
and supporting files. Kirjolab should offer useful built-in starting points and
let an owner promote a current project into a reusable personal template
without copying private research or creating a live dependency on the source.

### Architecture

- Built-in templates use the same versioned `ProjectTemplateSeed` contract as
  personal templates and ship from an application-owned registry.
- The initial built-ins are Guided starter, Blank project, Research article,
  and Literature review. Built-in ids and content are stable application data.
- An owner-keyed `ProjectTemplateCatalog` Durable Object stores at most 50
  personal template records with bounded name, description, sanitized seed,
  and timestamps. It is separate from project navigation and collaboration.
- A sanitized seed contains the Markdown file tree, empty folders, portable
  BibTeX, and publication profile. It excludes images and all PDFs,
  annotations, claims, comments, candidates, private research shares,
  collaborators, share capabilities, history, and milestones.
- Promotion captures the current project head. Replacing a personal template
  is explicit and owner-only; it never changes projects already created from
  that template.
- Creating a project from a template initializes normal project access,
  instantiates an independent `DocumentRoom`, records revision zero, and then
  registers the project in the owner catalog. Blank and built-in creation use
  the same path as personal templates.
- The New project surface presents one clear template choice before creation.
  Personal templates can be removed there. Project settings exposes **Save as
  template** for creating or explicitly replacing one.

### API Contracts

- `GET /api/project-templates` returns the built-in templates followed by the
  verified owner's personal templates. Seeds are not returned in list data.
- `DELETE /api/project-templates/{id}` deletes only an owner-created template.
- `POST /api/workspaces/{id}/template` promotes the current project. A bounded
  optional `templateId` replaces one personal template owned by the caller.
- `POST /api/workspaces` accepts an optional bounded `templateId`; omission
  retains the Guided starter default for compatibility.

### Anti-Patterns

- Do not implement templates as hidden projects or complete revision seeds.
- Do not store template source in `WorkspaceCatalog`.
- Do not copy private research, project access, or logical history into a
  template.
- Do not keep a live link between a template, its source project, and projects
  created from it.
- Do not silently overwrite a personal template when a name collides.

## Contract

### Definition of Done

- [x] New projects can start from four distinct built-in structures.
- [x] Owners can promote the current project into a named personal template.
- [x] Owners can explicitly replace or delete a personal template.
- [x] Template instantiation preserves files, folders, BibTeX, and publication
      settings while creating an independent project and revision history.
- [x] Promotion excludes every private research, collaboration, binary, and
      history representation.
- [x] New-project and project-settings UI expose the workflow without adding a
      second project browser.
- [x] Domain, Workers, API, and browser tests cover the critical behavior.

### Regression Guardrails

- Template names are non-empty and at most 120 characters; descriptions are at
  most 500 characters; each seed inherits project file-count and composed-byte
  bounds; owners retain at most 50 personal templates.
- Built-in templates cannot be replaced or deleted.
- A missing, foreign, or malformed personal template id does not create a
  project or disclose template metadata.
- Project creation registers the catalog entry only after access and document
  initialization succeed.
- Existing duplication, revision branching, and default starter creation keep
  their current semantics.

### Verification

- Pure tests validate built-in seeds, sanitized projection, bounds, and input
  guards.
- Workers tests validate personal persistence, ownership isolation,
  replacement, deletion, and independent template instantiation.
- Browser coverage creates projects from built-in and personal templates and
  verifies the promotion workflow.

### Scenarios

**Scenario: Researcher starts a literature review**

- Given: the built-in template registry is available
- When: they choose Literature review and enter a project title
- Then: Kirjolab creates an isolated project with the review structure and no
  private research state

**Scenario: Researcher promotes a common structure**

- Given: an owner has arranged reusable Markdown files and publication settings
- When: they save the current project as a personal template
- Then: the template catalog retains a sanitized independent seed and lists it
  in New project

**Scenario: Researcher refreshes a personal template**

- Given: a personal template and a newer project structure
- When: the owner explicitly replaces that template from the current project
- Then: future projects use the new seed while existing projects remain
  unchanged
