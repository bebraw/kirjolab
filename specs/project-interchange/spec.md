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
project offers **Import project ZIP** on the dedicated `/projects/new` page. The import panel
shows project title, entry document, file/reference/asset counts, Library
matches, and exclusions before **Create project**. Errors remain in the panel
with retry available. The imported project opens with references already linked.

### Source Project Import

- An ordinary source ZIP does not require `manifest.json` or `project.json`.
  Inspection generates their native contracts in memory, with deterministic
  source identities, byte counts, and payload hashes. Confirmation reuses the
  existing native staging and cleanup pipeline; later native export produces
  the ordinary self-contained Kirjolab project ZIP.
- Source import strips one common enclosing directory and preserves Markdown
  content and relative Markdown/image paths. The inferred root uses eligible
  source paths before PDF omission, keeping entry choices stable across previews.
  The suggested entry prefers
  `manuscript.md`, `main.md`, `paper.md`, `index.md`, and then a README.
  The first level-one heading suggests the title; folder or entry name is
  the fallback. Setup may choose any retained Markdown entry file.
- Setup selects one `.bib` file, preferring `bibliography.bib`, or explicitly
  omits the bibliography. Parsed entries become project references with their
  authored citation aliases through existing Library reconciliation. Text and
  bibliography contents are not rewritten. Publication settings start from
  the normal default.
- Bundled images pass existing signature and inert-SVG checks. PDFs are included
  as project PDFs by default, with relative source paths as names; setup may
  omit them before the first preview or during review. Omitted PDFs are never
  inflated or counted toward retained-file and retained-byte limits; their
  paths and local headers still pass full-archive safety validation. No
  PDF-to-reference relationship is inferred from filenames.
- Source archives may contain 16,384 raw ZIP entries and declare at most 64 MiB
  expanded, but retain at most 1,024 importable files and 20 MiB of extracted
  content and generated project metadata. Compressed input stays at 20 MiB;
  UTF-8 Markdown and BibTeX files stay at 2 MiB each. Native state collection,
  graph, and binary validation continues to apply.
- `node_modules`, `.git`, `.svn`, `.hg`, `__MACOSX`, `.DS_Store`, AppleDouble
  files, directory entries, and unsupported files are skipped before inflation.
  Every central path and local header remains validated. The review reports
  the skipped-entry count and fresh project-history/collaboration scope.
- A root `manifest.json` declares a native archive and is always strictly
  validated; corruption cannot downgrade into source import. Unrelated nested
  manifest/project JSON files are skipped. Legacy Kirjolab source snapshots retain their
  existing inspection-only compatibility behavior.
- Preview responds with `kind: source`, candidate entry/bibliography paths,
  selected bibliography, PDF inclusion, skipped count, and the usual project
  summary and Library reconciliation. Both endpoints accept `entryPath`,
  `bibliographyPath` (empty means none), and `includePdfs` (`true` or `false`).
  The preview digest binds these choices as well as the archive and Library
  matches. Confirmation repeats normalization and rejects changed setup.

[ADR-243](../../docs/adrs/implemented/ADR-243-guide-project-creation-and-normalize-source-archives.md)
records the creation and source normalization boundary.

## Verification

- Unit tests verify exact archive round trips, integrity, path and size limits,
  duplicate identities, graph validation, identity remapping, and compatibility.
- Workers tests verify persisted files, references, PDFs, comments and evidence,
  safe Library reuse, preview/confirmation binding, retries, and failure cleanup.
- Browser tests exercise export, preview, confirmation, and opening the imported
  project without individual reference linking.
