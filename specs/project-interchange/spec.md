# Feature: Native Project Interchange

## Blueprint

### Context

Researchers can export the current working project and import it into another
account or deployment without reconstructing reference links or evidence.
[ADR-241](../../docs/adrs/implemented/ADR-241-add-lossless-native-project-archives.md)
defines the native interchange boundary.

### Contract

- `kirjolab-project-v1` is a ZIP containing `manifest.json`, `project.json`, and
  exactly the payloads declared by the manifest. Each payload declares its
  portable identity, path, byte count, and SHA-256 digest.
- The scope is the current working project: exact Markdown, file and folder
  structure, entry document, settings, all linked bibliographic snapshots and
  citation aliases, project-owned images and PDFs, comments and anchors,
  annotations, claims, evidence links, shared snapshots, and pinned review outputs.
- History, milestones, private Library attachments and research, live review
  and Library grants, memberships, public shares, GitHub connections, and model
  candidates are excluded. Export and import show these exclusions explicitly.
- Explicitly shared research remains accessible as a project snapshot. Owners
  can revoke imported snapshots without creating private Library research or
  restoring source sharing capabilities. Captured web bytes retain the metadata
  used by the existing download integrity check. Shared PDF artifacts pass the
  same signature checks as project PDFs and retain their PDF media type.
- Runtime identifiers and binary object keys are replaced with portable
  identities. Import allocates destination identifiers and preserves source
  provenance. Resolved manuscript anchors are recreated against the imported
  document; stale anchors remain stale.
  Owner-catalog receipts retain the source project/revision, archive hash and
  an identity correspondence bounded to 8 MiB. These values confer no access.
- Import reuses strong Library identity matches without overwriting existing
  metadata. Project snapshots and citation aliases remain exactly as exported.
  Ambiguous mappings that would collapse distinct project references fail with
  an actionable error rather than rewrite citations.
- Preview validates the whole archive without mutation. Confirmation binds the
  archive digest, preview digest, and a browser-generated import attempt UUID.
  Completed attempt retries return the same project; concurrent confirmation
  never creates an additional project.
  Receipts are bounded to 2,000 attempts per owner. Processing leases last
  ten minutes; an expired retry allocates a fresh staging identity and cleans
  abandoned staging before creation. Failed, cleaned attempts can retry
  immediately; completed receipts remain stable even after project deletion.
  Retain at most 64 abandoned staging identities until their cleanup is
  acknowledged. Register PDF cleanup identities before reserving shared bytes
  so a crash or lost RPC response cannot orphan a reservation.
- All required bytes and relationships are validated before creation. The
  project becomes discoverable only after storage and reference dependencies
  are committed. Failure cleans up only newly created resources.
- Archives are bounded to 20 MiB compressed, 20 MiB expanded, 1,024 ZIP entries,
  10 MiB project metadata, 512 Markdown files, 512 references, 20 MiB per image,
  25 MiB per PDF, and 10,000 entries per relationship collection. Paths are
  relative, canonical, traversal-free, at most 1,024 code units and 64 segments.
  Text files retain existing 2,000,000-character project limits. All JSON
  collections and text fields are bounded; every declared digest is verified.
- Native v1 is the initial supported version. Unsupported versions fail closed;
  later versions must add explicit migrations. Legacy source ZIP inspection
  reports missing metadata, PDF bytes, and history and does not enable lossless
  confirmation. Publication ZIPs remain publication artifacts.

### API

| Route                                             | Behavior                                                         |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| `GET /api/workspaces/{id}/export/project-preview` | Authorized current-project scope and dependency summary          |
| `GET /api/workspaces/{id}/export/project.zip`     | Self-contained current-project ZIP                               |
| `POST /api/project-import-previews`               | ZIP inspection and Library reconciliation summary without writes |
| `POST /api/project-imports`                       | Confirm the previewed ZIP and create an independent project      |

All responses are private and non-cacheable. Mutation routes use the existing
same-origin and authenticated-owner boundary. Archive content cannot authorize
remote reads, execute code, or reconnect source permissions.

### Interface

Export offers **Kirjolab project (.zip)** with current-project scope and
exclusions, including the count of excluded live Library source grants. New
project offers **Import Kirjolab project**. The import dialog
shows project title, entry document, file/reference/asset counts, Library
matches, and exclusions before **Create project**. Errors remain in the dialog
with retry available. The imported project opens with references already linked.

## Verification

- Unit tests verify exact archive round trips, integrity, path and size limits,
  duplicate identities, graph validation, identity remapping, and compatibility.
- Workers tests verify persisted files, references, PDFs, comments and evidence,
  safe Library reuse, preview/confirmation binding, retries, and failure cleanup.
- Browser tests exercise export, preview, confirmation, and opening the imported
  project without individual reference linking.
