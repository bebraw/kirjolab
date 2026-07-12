# Feature: Collaborative Manuscript Comments

## Blueprint

### Context

Collaborators need to discuss a passage without adding review syntax to the
canonical Markdown. A comment must follow surviving text edits, retain who
wrote it, remain inspectable after resolution, and appear in project history.
Live caret and selection visibility is related collaboration context but is
ephemeral rather than a scholarly resource.

### Architecture

- `DocumentRoom` stores comments in SQLite as stable resources with a bounded
  body, stable workspace-person author id, display label, open/resolved state,
  timestamps, and a file-qualified version 1 manuscript anchor.
- Comment creation verifies the current manuscript revision, file, range, and
  exact selected text before capturing Yjs relative positions and quote
  provenance.
- Resolution changes lifecycle state without deleting the comment. Both create
  and resolve operations create logical project-history revisions without
  advancing the manuscript concurrency revision.
- The browser resolves each anchor against live Yjs state, exposes changed or
  stale status, and navigates only a resolved range.
- A socket receives a server-owned ephemeral collaborator id. Its bounded
  current-revision selection is broadcast to peers and cleared on disconnect;
  it is never stored or added to history.

### API Contracts

- `POST /api/workspaces/{id}/comments` accepts `fileId`, `start`, `end`,
  `excerpt`, `sourceRevision`, and `body` and returns an attributed comment.
- `POST /api/workspaces/{id}/comments/{commentId}/resolve` returns the retained
  comment with `status: "resolved"`.
- The normal workspace snapshot includes open and resolved comments with
  immutable selectors and derived resolutions.

### Anti-Patterns

- Do not write comment text or lifecycle markers into Markdown.
- Do not trust a client-provided author or collaborator identity.
- Do not relocate a stale comment by fuzzy quote matching or original offsets.
- Do not persist collaborator selections or ordinary reading position.
- Do not delete a comment merely because it is resolved.

## Contract

### Definition of Done

- [x] A collaborator can select manuscript text and create a bounded comment.
- [x] Comments retain stable author identity and follow surviving Yjs edits.
- [x] Resolved comments remain visible and recoverable through revision history.
- [x] Comment actions leave canonical Markdown and its concurrency revision
      unchanged.
- [x] Peer selections are visible, revision-linked, server-attributed, and
      ephemeral.
- [x] Domain, Workers-runtime, and two-browser tests cover the boundaries.

### Regression Guardrails

- Comment bodies must be non-empty and no longer than 8,000 characters.
- Comment anchors must use the same version 1 relative-position contract as
  evidence and claim passage links.
- Only authenticated workspace members may create or resolve comments.
- Every comment mutation and its history snapshot must commit atomically.
- Selection messages must use exact keys, protocol version 1, safe integer
  offsets, and a valid current project file/revision.
- Invalid client metadata must never be persisted or rebroadcast.

### Scenarios

**Scenario: Comment follows an edit**

- Given: a comment is anchored to selected prose
- When: another collaborator inserts text before that prose
- Then: the comment resolves to the shifted passage with its original quote
  retained as provenance

**Scenario: Collaborator resolves a comment**

- Given: an open attributed comment
- When: an authorized member resolves it
- Then: source is unchanged and a later revision inspector still exposes the
  resolved comment

**Scenario: Peer selects manuscript text**

- Given: two synchronized collaborators share the current revision
- When: one selects a valid range
- Then: the other sees its file, range, and excerpt until it changes revision or
  the selecting socket disconnects
