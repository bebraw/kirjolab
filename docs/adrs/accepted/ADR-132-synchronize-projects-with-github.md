# ADR-132: Synchronize Projects with Scoped GitHub Trees

**Status:** Accepted

**Date:** 2026-07-16

## Context

Researchers may already maintain a manuscript inside a GitHub repository whose
build system, demonstrations, tests, and deployment remain outside Kirjolab.
Copying Markdown into Kirjolab once would make later edits diverge, while
continuous bidirectional synchronization would hide external mutations and make
conflicts difficult to review.

Kirjolab already gives project files stable identities, collaborative Yjs text,
atomic logical revisions, comments anchored to Yjs positions, and neutral
revision diffs. A GitHub integration must preserve those authorities rather than
replacing them with a Git working tree or applying remote text around Yjs.

The first motivating repository is `bebraw/scalability_book`. Only its `book/`
subtree belongs in Kirjolab; its generator and other repository-owned code must
remain untouched. That subtree contains Markdown chapters but no `main.md`, so
import must not depend on Kirjolab-specific repository structure.

## Decision

Kirjolab projects may have one optional GitHub binding. The binding identifies
one GitHub App installation, immutable repository id, display owner and name,
branch, normalized repository-relative root path, tracked-path manifest, and
the last synchronized commit and project revision. Repository renames do not
change binding identity.

The GitHub App is installed only on repositories selected by the installer and
requests repository Contents access. Kirjolab additionally constrains every
operation to the binding's configured subtree; the GitHub permission boundary
is repository-wide because GitHub Apps cannot grant content access to an
arbitrary folder. Installation access tokens are minted only for an operation,
kept out of durable state and logs, and never sent to the browser. Connecting,
pulling, publishing, rebinding, and disconnecting are owner-only operations.

The App registration and private key are deployment-wide Kirjolab credentials;
users do not register their own Apps or upload private keys. Each Kirjolab owner
instead authorizes a separate GitHub user connection. OAuth and installation
callbacks consume one-time owner-scoped state, and every repository operation
revalidates that the connected GitHub user can access the selected installation
and repository. User and refresh tokens are encrypted at rest with a
deployment-specific server secret. Short-lived installation tokens are further
restricted to the selected immutable repository id.

Project setup discovers installations, repositories, and branches through the
connected user's access token, while canonical bindings retain immutable ids
rather than treating picker labels as authority.

Import creates a new project from a reviewed snapshot of the chosen branch and
subtree. Version 1 imports bounded UTF-8 Markdown files and durable folder
structure. Unsupported and unselected repository entries are reported but not
copied or tracked. The owner may select the project entry file in the preview;
otherwise Kirjolab follows ADR-133 by preferring root `main.md` and then the
first normalized Markdown path. Import does not synthesize source files.

Synchronization is manual. `Pull` and `Publish` first produce complete,
non-mutating previews and require a second explicit confirmation. Kirjolab does
not poll, subscribe to repository webhooks, or synchronize in the background.
Preview confirmation is revision-checked: a changed local project revision or
remote branch head invalidates the preview.

Pull compares the retained synchronized base, current GitHub branch head, and
current Kirjolab project. Remote-only changes may be applied atomically. Local-
only changes remain local. Concurrent changes to the same tracked text or
incompatible path operations become explicit conflicts and block the pull until
the owner chooses a result. Imported text is never parsed and reserialized;
unknown Markdown syntax remains ordinary canonical text. Accepted text changes
are applied as bounded edits to the existing `Y.Text`, not as delete-all and
insert-all replacement, so surviving Yjs identities, comments, and anchors are
preserved where the merge permits. One accepted pull creates one logical project
revision.

Publish defaults to one direct commit on the configured branch after the owner
reviews the outgoing diff and commit message. Kirjolab builds a new Git tree
from the current remote tree, creates one commit parented to the previewed head,
and advances the branch only as a non-forced fast-forward. It may add, update,
rename, or delete tracked Markdown paths inside the configured subtree, but it
never rewrites the branch, changes untracked paths, or mutates content outside
that subtree. A protected-branch rejection is surfaced without bypassing the
repository policy. Publishing through a new branch and pull request is an
optional later workflow, not the default or part of the first slice.

The synchronized base advances only after a confirmed pull or successful branch
update. Operations have durable idempotency identities so a timeout between the
GitHub mutation and local acknowledgement can be reconciled without producing a
second commit. Failed previews, conflicts, rejected branch updates, revoked app
access, and partial external failures leave canonical project content and the
previous synchronized base unchanged.

## Trigger

The `scalability_book` discussion established GitHub sync as the first external
project integration and narrowed the desired workflow to explicit import,
pull, and publish. Mandatory pull requests were rejected as too ceremonial for
routine publishing, making reviewed direct commits the intended default.

## Consequences

The implemented Pull path stores only an expiring revision- and remote-head-bound
preview. Confirmation re-reads GitHub, rejects remote movement, applies all safe
remote-only Markdown changes in one Durable Object transaction, advances the
retained base in that same transaction, and creates one project revision.
Local-only changes are intentionally left as divergence for a later Publish;
conflicts remain blocked until the owner reviews a resolution.

**Positive:**

- Existing GitHub manuscripts can use Kirjolab collaboration without moving
  unrelated repository code into the application.
- Explicit previews make every external mutation reviewable while keeping the
  common publish path lightweight.
- Three-way comparison detects divergence instead of silently overwriting local
  or remote work.
- Applying pulls through existing Yjs texts preserves surviving collaborative
  identities and anchors.
- Repository-scoped installation and short-lived server-side tokens avoid broad
  personal access tokens.

**Negative:**

- Kirjolab must implement bounded Git tree, commit, reference, conflict, and
  retry semantics in addition to its internal project history.
- A repository-scoped GitHub App can technically read or write beyond the
  selected folder, so subtree confinement remains an application invariant that
  requires dedicated tests.
- Direct publishing can trigger repository automation immediately and provides
  no GitHub review pause when the configured branch permits app writes.
- Version 1 does not synchronize project images, arbitrary binary files,
  symlinks, submodules, or executable files.

**Neutral:**

- GitHub history and Kirjolab project history remain separate histories joined
  by synchronized commit and revision markers.
- Branch protection and organization GitHub App policies may require repository
  administrator action or a later pull-request workflow.
- GitHub import uses Kirjolab's optional entry-file resolution without changing
  the repository's source structure.

## Alternatives Considered

### Require a pull request for every publish

This maximizes GitHub-native review but adds branch and PR ceremony to every
routine synchronization. Kirjolab already requires an explicit outgoing diff
review, and repositories that require PRs can enforce that through branch
protection or adopt a later optional PR workflow.

### Synchronize automatically through webhooks

Automatic pulls reduce staleness but make project mutations happen outside an
author's immediate review and introduce webhook delivery, retry, ordering, and
installation lifecycle complexity before the manual workflow is proven.

### Treat GitHub as the canonical project store

Making each edit a Git commit would bypass the existing Yjs coordination,
offline editing, comments, anchors, and atomic scholarly-resource history.
GitHub is an explicit interchange boundary, not Kirjolab's live document
authority.

### Grant access with a personal access token

Personal tokens are harder to constrain, rotate, audit, and revoke per
repository. A GitHub App provides installation-scoped repository selection and
short-lived operation tokens.

### Require or generate `main.md`

This would impose Kirjolab's composition convention on existing build systems
or create a second local-only tree. ADR-133 instead resolves a stable existing
Markdown file and lets the owner override it.
