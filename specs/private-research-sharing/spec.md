# Feature: Private Research Sharing

## Blueprint

### Context

Citing a source must not reveal a researcher's notes, tags, highlights, or
reading history. Authenticated project collaboration does need direct access to
the PDFs attached to linked references, while manuscript bearer links must not
gain that access. A separate explicit sharing action may publish one immutable
annotated PDF copy for a recipient without an account.

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
- Standalone annotated-PDF sharing is a separate owner action naming one
  Library artifact. It creates an immutable copy containing that PDF's saved
  highlights, comments, page notes, and drawings. Later private edits require
  another explicit share; the existing link's bytes do not change. The storage,
  capability, and backup boundary is recorded in
  [ADR-249](../../docs/adrs/implemented/ADR-249-share-immutable-annotated-pdf-copies.md).
- The owner can recover, open, copy, and revoke existing PDF links. Anyone with
  an active link can read or download its copy without signing in. Revocation
  or permanent source deletion removes future access; already downloaded
  copies cannot be recalled. Library archive and project unlink do not revoke
  these independently created links.
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

- `GET /api/library/pdfs/{artifactId}/shares` lists that owner's active links
  as `{ shares }`, containing each link's id, name, creation time, and
  recoverable URL. `POST` creates a new annotated copy through the same owner
  boundary and returns `{ share }`. Both use non-cacheable responses. At most
  20 active shares may exist for one artifact; creation enforces that limit
  atomically and reads at most the existing 25 MB source PDF limit. A PDF with
  no saved annotations may still be shared as a snapshot.
- Snapshot rendering uses the source PDF's authoritative current objects under
  [ADR-250](../../docs/adrs/implemented/ADR-250-resolve-current-pdf-objects-before-editing.md).
  A malformed or unsupported structure fails before a sharing copy or token is
  published. Existing copies remain immutable; corrected rendering takes effect
  when the owner explicitly creates a new copy.
- Snapshot creation reads only the selected artifact's highlights and markups,
  independently of Library navigation limits. More than 10,000 combined
  annotations or an artifact-and-annotation input exceeding the 4 MiB
  serialized-input bound fails with `413`; no saved feedback is silently
  omitted.
- `DELETE /api/library/pdfs/{artifactId}/shares/{id}` revokes one owner-matching
  link and returns `204`. Creation and revocation require an exact same-origin
  mutation request. Access is revoked before removing the generated R2 copy;
  cleanup failure reports a retryable error without reactivating the link.
- Permanent reference deletion nulls its PDF-share tokens in the same
  transaction that removes the artifacts. Cleanup digests survive artifact
  deletion. After that deletion and at the start of later authenticated
  PDF-share API operations, cleanup retries at most 100 pending rows. Failed
  deletions remain pending; only successful R2 deletion marks a row cleaned.
- `GET` and `HEAD /share/pdf/{token}` and its `/document.pdf` route validate
  the 43-character, 256-bit bearer independently from project share tokens,
  require an active share and source artifact, and expose only the shared copy.
  `?download=1` on the PDF route requests attachment disposition; the ordinary
  route supports inline viewing and byte ranges. Responses are non-cacheable
  and do not disclose owner identity, artifact keys, or other Library content.
  Partial responses include finite, exact `Content-Range` offsets and lengths
  even when R2 exposes an undefined `suffix` property on an offset range.
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
- Do not treat a manuscript read-only or edit bearer as project membership or
  use it to authorize a reference-PDF endpoint. Standalone PDF links have their
  own capability and immutable copy.
- Do not expose owner library APIs to project members.
- Do not allow revocation to rewrite an immutable historical revision.
- Do not assume possession of a PDF grants redistribution rights.

### Validation

- Workers and browser tests prove member-only linked-PDF access, public bearer
  exclusion, private-resource separation, explicit snapshot pinning for the
  remaining resource kinds, revocation, and tombstone preservation.
- Standalone share coverage proves owner isolation, recoverable links, explicit
  annotation snapshots, unchanged bytes after later note edits, public reading
  and download, range/HEAD handling, and loss of access after revocation or
  permanent source deletion. Portable snapshots omit the share capabilities.
- The browser sharing workflow exercises a multi-page source containing stale
  compressed definitions. An independent PDF reader checks every downloaded
  page and the final-page annotation; Workers tests verify exact range response
  headers against the actual R2 binding.

## Current Milestone

- Implemented: linked-reference PDF access for authenticated members; public
  read-only and edit links remain manuscript-only.
- Implemented: separate revocable links to immutable annotated PDF copies for
  unauthenticated reading or download.
- Implemented: explicit note/highlight/web-capture snapshots, inert web
  content, forward-only revocation, archive, deletion impact, and
  bibliographic tombstones. Historical artifact pins remain revision data.
- Implemented: manual metadata editing with provenance, collections, reading
  status, priority, and rating.
- Implemented: a simplified private-PDF project-use state in which reference
  linkage grants member reading and highlights retain independent sharing.
- Revision/milestone retention consumes the pinned rows under ADR-061.
