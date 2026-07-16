# Feature: GitHub-Backed Projects

## Blueprint

### Context

Authors need to bring an existing repository folder into Kirjolab, collaborate
on its Markdown, and deliberately exchange later changes without moving the
repository's build and deployment system into Kirjolab. The routine workflow
must be lighter than mandatory pull requests while still previewing every
incoming and outgoing mutation.

### Architecture

- A project has at most one `GitHubProjectBinding`. It stores the GitHub App
  installation id, immutable repository id, display owner/name, branch,
  normalized repository-relative root, last synchronized commit and logical
  project revision, tracked paths, base blob identities, and operation
  reconciliation records. Secrets and installation access tokens are never
  stored in the binding.
- GitHub repository selection is limited by the App installation. Every
  server-side read and write independently verifies the current Kirjolab owner,
  installation access, repository id, branch, and normalized subtree path.
  Repository display names are not authorities.
- Import, Pull, and Publish are two-phase operations: a read-only preview is
  followed by an explicit confirmation carrying an opaque, expiring preview
  identity. Confirmation fails if the project revision, binding, remote head,
  operation owner, or preview expiry no longer matches.
- Import creates a new owner-controlled workspace from one exact remote commit.
  Version 1 accepts bounded UTF-8 `.md` files and folders only. It strips the
  configured repository root from project paths, retains source text without
  parsing or serialization, and lists skipped entries in the preview.
- Import lets the owner select an entry file. Without a selection it prefers
  root `main.md`, then the first Markdown file by normalized project-relative
  path, and persists that stable file id under ADR-133. Import does not create a
  synthetic composition file.
- The retained synchronization base contains enough exact tracked text and path
  identity to compare even if a remote commit later becomes unreachable. A
  tracked manifest joins repository paths and blob ids to stable Kirjolab file
  ids. Unique unchanged blob identity may preserve a file id across a remote
  rename; ambiguous rename candidates remain add/delete changes for review.
- Pull calculates a three-way result from retained base, current remote head,
  and current project state. It classifies path and text changes as remote-only,
  local-only, identical, or conflicting. No preview mutates Yjs, project rows,
  history, or the synchronized base.
- Confirmed non-conflicting remote text changes are expressed as bounded edits
  against each existing `Y.Text`. New files receive new stable ids. Renames keep
  stable ids when their identity is unambiguous. Deletes and moves must satisfy
  existing composition, comment, asset, and path invariants. One pull applies
  all accepted changes and records one logical project revision or applies none.
- Publish compares the retained base, current project, and current remote head.
  Its preview includes the exact path diff, textual diff, commit message,
  destination branch, skipped local-only files, and conflicts. Conflicts block
  confirmation rather than being resolved by last-writer-wins behavior.
- Confirmed Publish creates blobs and one tree based on the complete current
  remote tree, creates one commit whose parent is the previewed head, and updates
  the configured reference with `force: false`. Only approved tracked changes
  beneath the normalized root enter the tree. A remote head change, protected
  branch, permission failure, or non-fast-forward response leaves the binding
  base unchanged.
- Each confirmed external mutation has a durable idempotency key and expected
  result identity. On an ambiguous timeout, reconciliation reads GitHub before
  retrying. Kirjolab never creates a second commit merely because the first
  response was lost.
- The first slice requests GitHub App repository Metadata read and Contents
  read/write permissions. Pull-request write permission is deferred until an
  optional publish-for-review workflow is implemented.

### API Contracts

- `POST /api/github/import-previews` validates an owner-visible installation,
  repository, branch, and root, then returns a bounded immutable import preview.
- `POST /api/github/imports` consumes a current import preview and creates the
  workspace, initial logical revision, GitHub binding, and synchronized base.
- `GET /api/workspaces/{id}/github-sync` returns owner-safe binding display
  state, current sync status, and last synchronized commit/revision without
  credentials or token material.
- `POST /api/workspaces/{id}/github-sync/pull-previews` returns a non-mutating
  three-way incoming diff and conflicts.
- `POST /api/workspaces/{id}/github-sync/pulls` consumes a current pull preview
  and atomically applies its accepted result through project Yjs documents.
- `POST /api/workspaces/{id}/github-sync/publish-previews` returns a
  non-mutating outgoing diff and proposed commit metadata.
- `POST /api/workspaces/{id}/github-sync/publishes` consumes a current publish
  preview and creates at most one direct GitHub commit.
- `DELETE /api/workspaces/{id}/github-sync` removes only the binding after owner
  confirmation. It does not delete the Kirjolab project, GitHub files, commits,
  App installation, or retained project history.
- Anticipated stale previews, conflicts, revoked access, branch protection, and
  remote movement return typed serializable results rather than routine Durable
  Object exceptions.

### Bounds

- A preview may inspect at most 512 tracked Markdown files and 2 MiB of decoded
  Markdown text, matching the project composition ceiling.
- Paths must be normalized relative paths under the configured root. Empty,
  absolute, backslash, dot-segment, NUL-containing, and escaping paths fail
  closed.
- Version 1 rejects symlinks, submodules, executable entries, non-UTF-8 text,
  Git LFS pointers, and binary content instead of dereferencing or coercing
  them. Unsupported entries remain untracked and untouched in GitHub.
- Diff and conflict payloads are bounded and escaped as text; authored Markdown
  is never rendered as trusted HTML in a sync preview.

### Anti-Patterns

- Do not run `git`, clone repositories, or persist a working tree in a Worker;
  use bounded GitHub API objects and Kirjolab's existing project model.
- Do not parse and reserialize imported Markdown. Unknown syntax must survive as
  canonical text even when preview cannot interpret it.
- Do not apply pulled text by replacing a complete `Y.Text` when a bounded edit
  can preserve surviving identities and anchors.
- Do not use webhooks, polling, scheduled jobs, page load, or editor save as an
  implicit Pull or Publish trigger.
- Do not force-update a Git reference, bypass branch protection, broaden an App
  installation, or write outside the configured subtree.
- Do not treat a GitHub owner/name, branch name, path, client-supplied commit, or
  preview payload as sufficient authorization.
- Do not advance the synchronized base before the internal pull transaction or
  external reference update is known to have succeeded.

## Contract

### Definition of Done

- [ ] An owner can preview and import a selected GitHub repository subtree into
      a new project at one exact commit.
- [ ] Import of `bebraw/scalability_book` scoped to `book/` tracks only its
      chapter Markdown and resolves `00_introduction.md` as the default entry unless
      the owner chooses another file.
- [ ] An owner can preview and pull non-conflicting remote changes through the
      existing Yjs documents as one logical revision.
- [ ] An owner can preview and publish local tracked changes as one direct,
      non-forced commit to the configured branch.
- [ ] Concurrent local and remote changes are classified by a retained
      three-way base and never silently overwrite either side.
- [ ] Unknown Markdown syntax and all untracked repository content remain
      byte-for-byte unchanged by operations that do not edit them.
- [ ] Revoked access, stale previews, protected branches, timeouts, and retries
      fail closed without duplicate commits or premature base advancement.
- [ ] Unit, Workers-runtime integration, and browser tests cover authorization,
      bounds, path confinement, preview freshness, Yjs application, conflicts, and
      idempotent GitHub mutation reconciliation.
- [ ] This spec and ADR-132 are updated with discoveries from implementation.

### Regression Guardrails

- Only a current workspace owner may create, use, alter, or delete a GitHub
  binding; normal members and bearer-share users cannot invoke sync operations.
- Installation tokens, App private keys, authorization codes, and complete
  private repository responses never enter browser payloads, logs, snapshots,
  history, or Durable Object storage.
- Every remote write is confined to the immutable repository id, configured
  branch, and normalized subtree revalidated by the server at confirmation.
- Pull and Publish always have a separately confirmed diff preview; preview
  generation is non-mutating and confirmation cannot reuse stale state.
- A pull preserves stable file and Yjs identities wherever path and text
  identity survive, and it does not mutate comments or anchors around Yjs.
- Direct Publish creates one commit, never force-pushes, and never changes an
  untracked path or a path outside the selected repository root.
- The persisted entry choice changes only through an explicit project operation;
  Pull and Publish do not silently rerun entry-file inference.
- Repository or branch deletion, installation suspension, and permission loss
  surface recoverable disconnected state without corrupting the project.
- Disconnecting GitHub leaves canonical Markdown, project history, and the
  remote repository unchanged.

### Verification

- **Unit tests:** Path normalization and confinement, manifest joins, rename
  classification, three-way text cases, diff bounds, preview freshness,
  permission-result mapping, and commit-plan idempotency.
- **Workers tests:** Owner authorization, binding migrations, exact base
  retention, atomic pull application through Yjs, logical revision creation,
  typed failure results, and ambiguous external-write reconciliation with a
  deterministic fake GitHub client.
- **Browser tests:** Installation/repository/folder and optional entry selection,
  deterministic entry fallback, incoming and outgoing diff review, conflict blocking,
  direct Publish confirmation, stale preview recovery, and disconnected state.
- **Coverage target:** All GitHub boundary and merge branches are exercised;
  new `src/` code satisfies the repository's baseline unit coverage and
  mutation gates.

### Scenarios

**Scenario: Import only the book subtree**

- Given: the owner selects `bebraw/scalability_book`, branch `main`, and `book/`
- When: the owner confirms the import preview
- Then: Kirjolab creates a project from the chapter Markdown at the previewed
  commit, resolves `00_introduction.md` as its initial entry, and does not track
  repository code outside `book/`

**Scenario: Pull a remote-only edit**

- Given: a tracked chapter changed remotely after the last synchronized commit
  and its corresponding local text did not change
- When: the owner previews and confirms Pull
- Then: Kirjolab applies bounded edits to that chapter's existing `Y.Text`,
  records one logical revision, and advances the synchronized base

**Scenario: Block a three-way conflict**

- Given: the same retained base passage changed differently in Kirjolab and on
  GitHub
- When: the owner previews Pull or Publish
- Then: the preview identifies the conflict and confirmation cannot overwrite
  either version until the owner supplies a reviewed resolution

**Scenario: Publish directly after review**

- Given: tracked local Markdown differs from the synchronized base, the remote
  head still matches the preview, and the configured branch permits App writes
- When: the owner confirms the outgoing diff and commit message
- Then: Kirjolab creates one commit on that branch, advances it without force,
  and records the returned commit as the new synchronized base

**Scenario: Respect branch protection**

- Given: the configured branch rejects direct App writes
- When: the owner confirms Publish
- Then: Kirjolab reports the protected-branch failure, creates no fallback PR,
  and leaves project content and the synchronized base unchanged

## Current Milestone

- Accepted design: manual import, Pull, and reviewed direct Publish for bounded
  Markdown subtrees through a repository-scoped GitHub App.
- First implementation slice: import preview/confirmation and direct Publish
  preview/confirmation, including retained base state and conflict detection.
- Deferred: optional publish-through-branch-and-PR, binary assets, repository
  creation, multiple bindings per project, GitHub Enterprise Server, webhooks,
  background synchronization, and automatic conflict resolution.
