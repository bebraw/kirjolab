# Feature: Private Research Sharing

## Blueprint

### Context

Citing a source must not reveal a researcher's PDFs, notes, tags, highlights,
or reading history. Some evidence still needs deliberate, reproducible sharing
into a collaborative paper.

### Architecture

- Library artifacts, web captures, notes, highlights, tags, and reading state
  are private by default. A project citation receives only a bibliographic
  snapshot and exact web-capture provenance.
- Canonical bibliographic fields can be manually corrected in a structured
  editor. Every corrected field receives manual provenance with actor and edit
  time; authoring tags remain separate from bibliographic metadata.
- Private organization uses distinct tags and collections plus unread/reading/
  read status, low/normal/high priority, and an optional one-to-five rating.
- Sharing is a separate owner action naming one project, reference, resource,
  and kind. The library captures an immutable bounded snapshot; the project
  pins it in a new project revision.
- Artifact sharing requires explicit `shareable` rights. Unknown and private
  rights fail closed.
- Active shares expose their pinned representation to authorized project
  members. Revocation removes future access and creates a new project revision;
  the stored snapshot remains available only to revision/milestone history.
- Project unlink, library archive, and permanent owner deletion are distinct.
  Unlink removes project relationships only. Archive hides private navigation.
  Permanent deletion requires a fresh dependency summary, removes private
  resources, and retains a minimal bibliographic tombstone.

### API Contracts

- `POST /api/workspaces/{id}/research-shares` requires a project-linked
  reference and explicitly pins one artifact, web capture, note, or highlight
  snapshot.
- `DELETE /api/workspaces/{id}/research-shares/{shareId}` revokes future access
  in both owner library and project head.
- `GET /api/workspaces/{id}/research-shares/{shareId}/content` streams only an
  active artifact or inert web-capture representation after workspace
  authorization; raw web bytes are always attachment-only.
- Project snapshots expose active shares only. Revoked snapshots remain in
  project storage for historical revision capture, not current access.
- Permanent library deletion compares the caller's reviewed project dependency
  list against current state before mutating.
- `PATCH /api/library/references/{id}` replaces reviewed canonical metadata;
  `/collections` and `/reading` update private organizational facets.

### Anti-Patterns

- Do not infer sharing from citing, opening, linking, or annotating a source.
- Do not expose owner library APIs to project members.
- Do not allow revocation to rewrite an immutable historical revision.
- Do not assume possession of a PDF grants redistribution rights.

### Validation

- Workers tests prove privacy separation, rights checks, explicit snapshot
  pinning, project revision changes, revocation, dependency revalidation, and
  tombstone preservation in a real Durable Object runtime.

## Current Milestone

- Implemented: explicit note/highlight/artifact/web-capture snapshots,
  rights-gated artifact sharing, inert web content, current-project access,
  forward-only revocation, archive, deletion impact, and bibliographic
  tombstones.
- Implemented: manual metadata editing with provenance, collections, reading
  status, priority, and rating.
- Revision/milestone retention consumes the pinned rows under ADR-061.
