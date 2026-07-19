# Feature: Private Research Sharing

## Blueprint

### Context

Citing a source must not reveal a researcher's notes, tags, highlights, or
reading history. Authenticated project collaboration does need direct access to
the PDFs attached to linked references, while public bearer links must not gain
that access.

### Architecture

- Notes, highlights, tags, collections, reading state, and unlinked library
  artifacts are private by default. A project citation receives a
  bibliographic snapshot and exact web-capture provenance.
- Canonical bibliographic fields can be manually corrected in a structured
  editor. Every corrected field receives manual provenance with actor and edit
  time; authoring tags remain separate from bibliographic metadata.
- Private organization uses distinct tags and collections plus unread/reading/
  read status, low/normal/high priority, and an optional one-to-five rating.
- Sharing is a separate owner action naming one project, reference, resource,
  and kind. The library captures an immutable bounded snapshot; the project
  pins it in a new project revision.
- Linking a bibliographic reference authorizes current authenticated project
  members to stream every PDF currently attached to that owner-library record.
  The stream is resolved from the owner library at request time and does not
  copy bytes or expose the artifact object key.
- Saved private highlights expose their own share or revoke action only after
  the bibliographic reference is linked. Sharing the PDF does not share its
  highlights, and sharing a highlight does not share the PDF.
- Artifact-rights metadata does not gate member reading. It remains
  library-owned for future export or redistribution policy.
- Active shares expose their pinned representation to authorized project
  members. Revocation removes future access and creates a new project revision;
  the stored snapshot remains available only to revision/milestone history.
- Project unlink, library archive, and permanent owner deletion are distinct.
  Unlink removes project relationships only. Archive hides private navigation.
  Permanent deletion requires a fresh dependency summary, removes private
  resources, and retains a minimal bibliographic tombstone.

### API Contracts

- `GET /api/workspaces/{id}/reference-pdfs` returns safe metadata only for PDFs
  attached to linked owner-library references, after membership authorization.
- `GET /api/workspaces/{id}/reference-pdfs/{artifactId}` revalidates membership,
  the project-reference edge, and artifact ownership before streaming bytes.
- `POST /api/workspaces/{id}/research-shares` requires a project-linked
  reference and explicitly pins one web capture, note, or highlight snapshot.
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

- Do not infer private-note or annotation sharing from citing, opening, linking,
  or annotating a source.
- Do not treat a public read-only or edit bearer as project membership or add a
  reference-PDF endpoint beneath either public route.
- Do not expose owner library APIs to project members.
- Do not allow revocation to rewrite an immutable historical revision.
- Do not assume possession of a PDF grants redistribution rights.

### Validation

- Workers and browser tests prove member-only linked-PDF access, public bearer
  exclusion, private-resource separation, explicit snapshot pinning for the
  remaining resource kinds, revocation, and tombstone preservation.

## Current Milestone

- Implemented: linked-reference PDF access for authenticated members; public
  read-only and edit links remain manuscript-only.
- Implemented: explicit note/highlight/web-capture snapshots, inert web
  content, forward-only revocation, archive, deletion impact, and
  bibliographic tombstones. Historical artifact pins remain revision data.
- Implemented: manual metadata editing with provenance, collections, reading
  status, priority, and rating.
- Implemented: a simplified private-PDF project-use state in which reference
  linkage grants member reading and highlights retain independent sharing.
- Revision/milestone retention consumes the pinned rows under ADR-061.
