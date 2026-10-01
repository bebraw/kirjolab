# ADR-241: Add Lossless Native Project Archives

**Status:** Proposed

**Date:** 2026-10-01

## Context

Kirjolab exports `kirjolab-source.zip`, but has no matching native project
importer. The current archive contains the authored file tree, a partial
project snapshot, image bytes, and derived publication outputs. It omits PDF
bytes and the retained revision timeline. Its snapshot also contains runtime
identities and storage references that cannot be reused in another project or
deployment. Library archive restore is a separate metadata-only workflow.

Researchers should be able to export a Kirjolab project and import it as a
working project without reconstructing its files, citation aliases, reference
links, and evidence relationships. Importing its bibliography into the Library
and clicking **Add** for every reference does not restore those relationships.
Converting generated LaTeX back to Markdown would also lose native information.

[ADR-035](../implemented/ADR-035-keep-markdown-canonical.md) keeps Markdown
canonical, [ADR-058](../implemented/ADR-058-use-a-shared-reference-library.md)
keeps bibliographic identity in the Library, and
[ADR-059](../implemented/ADR-059-separate-private-research-from-projects.md)
separates private research from project state. A native archive must preserve
these boundaries while supporting an exact, explicitly scoped round trip.

## Decision

Add a versioned, self-contained native project ZIP format with paired
**Export → Kirjolab project (.zip)** and
**New project → Import Kirjolab project** workflows. Treat export and import
as one maintained interchange contract. The archive is a portable projection
of canonical project state; it never becomes a second live storage authority.

### Preservation contract

The minimum native archive scope is the complete current working project:

- Preserve exact authored file contents, paths, empty folders, entry document,
  project title, and publication settings.
- Include every project-linked bibliographic snapshot and its citation alias,
  including references not cited by the current manuscript. Import restores
  these project links together, without individual **Add** clicks.
- Preserve project comments and their anchors, annotations, claims, passage
  links, evidence relationships, explicitly shared research snapshots, and
  materialized review outputs with their provenance pins.
- Include image and project-owned PDF bytes required by the declared scope,
  together with the metadata needed to reopen them and resolve their links.
  Required missing bytes or unresolved internal relationships are errors,
  rather than silently dropped content.

The manifest identifies the archive schema, exported project revision,
included scope, intentional exclusions, and each payload's portable identity,
path, byte count, and digest. Export pins one coherent project revision; it
must not combine files from one revision with relationships from another.
Referenced binary payloads are verified against their declared identities.
Derived previews, source maps, indexes, and publication outputs may be rebuilt
and do not substitute for canonical data.

Project PDF readability under
[ADR-239](../implemented/ADR-239-link-member-library-sources-to-project-references.md)
does not itself grant permission to redistribute a contributor's private
Library attachments. Do not silently export unrelated Library records, private
notes, highlights, tags, or reading state. The export preview must identify
external dependencies and any research or attachment exclusions. A bundle
with exclusions must describe its scope instead of claiming to be a complete
project backup.

### Import identity and ownership

Import creates an independent project owned by the authenticated importer.
Allocate destination identities and remap all internal references consistently,
while retaining source identities as bounded provenance. Preserve authored
citation aliases and project-pinned metadata even when the destination Library
already contains a matching source. Reuse verified Library matches through the
existing identity rules; conflicting or ambiguous matches require an explicit
resolution and must not silently overwrite existing research or rewrite
manuscript citations.

Do not reactivate source memberships, public share links, private Library
source grants, GitHub connections, or other external capabilities. Reconnect
external services and live reviews explicitly. Imported review materializations
remain readable from their retained project bytes and provenance without access
to the original review. Never treat archived storage keys or owner identities
as authorization to fetch resources from the destination deployment.

### Compatibility and completion

Validate the manifest, supported schema version, payload digests, paths, and
relationship graph before publishing a project. Bound compressed and expanded
bytes, entry counts, individual payload sizes, and parsing work. Reject unsafe
or duplicate normalized paths and unsupported required features. Do not execute
archive content or fetch external URLs to complete an import.

Show an import summary with the project title, files, references, assets,
declared scope, and exclusions before creation. Publish the project only after
all required data and remapped relationships are committed. Failed imports
clean up newly created resources without deleting or modifying pre-existing
projects or Library records. Retrying must not create duplicate projects from
the same import attempt.

Support explicit migrations for older native schema versions. Inspect legacy
source ZIPs as a distinct compatibility case and report their missing scope;
do not promise lossless restoration from information they never exported.
The existing publication export pipeline under
[ADR-062](../implemented/ADR-062-use-one-source-mapped-export-pipeline.md)
continues to own PDF, LaTeX, composed Markdown, and cited bibliography outputs.
Native project import consumes canonical archive data directly.

### Round-trip acceptance

An export/import test must compare canonical content and relationships after
identity remapping, not merely assert that a project was created. It must cover
multiple files, empty folders, a non-default entry document, cited and uncited
references, custom citation aliases, images, PDFs, comments, and project
evidence. Import must preserve their content and allow citations, attachments,
and evidence links to resolve without manual reconstruction. Existing Library
matches and malformed or incomplete archives need separate regression cases.

### Scope questions before acceptance

- Decide whether full retained revisions and named milestones from
  [ADR-061](../implemented/ADR-061-preserve-project-revisions-and-milestones.md)
  are mandatory or an explicitly selected archive scope. The current-state
  minimum must not be advertised as preserving the complete timeline.
- Define how authorized Library attachments may be included as portable copies,
  including contributor export rights and the destination ownership model.
  Live private source grants cannot simply survive project identity remapping.
- Set concrete format limits and the compatibility policy in the feature spec
  before implementation. On acceptance, record the global interchange boundary
  in `ARCHITECTURE.md` and create `specs/project-interchange/spec.md`, with updates
  to the affected export and reference-library contracts.

Project-only Library defaults, direct BibTeX-to-project intake, and bulk
selection of existing Library references remain separate workflow changes.
Native archive restoration must nevertheless restore its references already
linked to the imported project.

## Trigger

A researcher importing a bibliography encountered repeated per-reference
linking and then identified that a Kirjolab project ZIP could not be imported
back into Kirjolab as a complete working project.

## Consequences

**Positive:**

- Projects can move between accounts or deployments without manually rebuilding
  their manuscript, references, and evidence relationships.
- A named preservation contract makes omissions visible and provides a
  meaningful round-trip regression target.
- Shared Library reuse and private research boundaries remain explicit.

**Negative:**

- Archive schemas and migrations become a lasting compatibility commitment.
- Identity remapping, duplicate reconciliation, and failure cleanup span several
  existing storage authorities.
- PDFs and retained history can make archives large; quotas and attachment
  export rights constrain which complete scopes can be offered.

**Neutral:**

- Imported projects have new runtime identities and freshly configured sharing.
- Native project archives complement publication exports, Library interchange,
  and operational owner backups; each retains its own declared scope.
- This draft proposes the contract and does not change current product behavior
  or supersede implemented ADRs before acceptance.

## Alternatives Considered

### Import only Markdown files and BibTeX

This reuses existing intake paths but loses citation aliases, uncited project
links, annotations, comments, settings, and evidence relationships. It cannot
meet a native project round-trip promise.

### Import the generated LaTeX export

The LaTeX converter can create a writing project, but publication output omits
native project state and conversion can change the authored Markdown structure.
It remains appropriate for external LaTeX projects.

### Restore the existing project snapshot verbatim

This appears to reuse internal state, but the current source ZIP lacks required
bytes and history and embeds deployment-specific identities and storage keys.
Verbatim restoration would leave broken relationships or revive inappropriate
access rather than create an independent project.

### Use an operational owner backup as the user-facing project format

Owner backups preserve broader account and storage state, including private
Library and independent review data. Using them for one project would couple
portable import to deployment recovery and expose unrelated research scope.
