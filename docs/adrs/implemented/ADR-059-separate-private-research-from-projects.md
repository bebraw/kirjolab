# ADR-059: Separate Private Research From Project State

**Status:** Partially superseded by
[ADR-155](../accepted/ADR-155-authorize-linked-pdfs-by-project-membership.md)

**Date:** 2026-07-11

## Context

A shared reference library makes a researcher's accumulated notes, tags, PDFs,
highlights, and reading state reusable across projects. Those materials may
contain private interpretations, unfinished ideas, licensed documents, or a
broader reading history that should not become visible merely because one paper
is cited in a collaborative project.

Projects still need reproducible citations and explicit evidence sharing. If a
project reads directly from mutable private state, later edits, revocation, or
deletion can silently change past revisions or break milestone history.

ADR-043 authorizes project members, while ADR-040 stores PDFs and annotations
inside workspace scope. A user-level library needs a separate ownership and
sharing contract.

## Decision

Library PDFs, web snapshots, highlights, notes, researcher tags, and reading
state will be private to their owner by default. Citing a source exposes to
project collaborators only the bibliographic record and snapshot required to
understand and render that citation.

Researchers must explicitly share additional source content, highlights, or
notes into a project. Project revisions pin the shared representation and its
provenance at the time sharing was authorized. Project-specific citations,
claims, and links from evidence into manuscript prose remain project state.

Revoking a share stops future access to and updates from the private library
resource. It does not rewrite content already pinned into authorized project
revisions. Permanent owner deletion removes the private artifact and
annotations; project and milestone history retains only tombstoned
bibliographic and locator provenance required to explain existing citations or
evidence links.

Removing a source from a project only removes project relationships. Archiving
a library source hides it from ordinary navigation while preserving private
content and existing provenance. Permanent deletion is an owner-only library
action that must summarize dependencies across current projects and milestones.

If accepted, this decision partially supersedes ADR-040 and ADR-042 where they
place all PDF, annotation, and resource state under a workspace room or
workspace-scoped R2 prefix. Project authorization from ADR-043 remains in force
for project-owned state and explicitly shared snapshots.

## Trigger

The UI review established a shared reference library and then explicitly chose
privacy by default with selective sharing into collaborative papers.

## Consequences

**Positive:**

- Citing one source cannot expose a researcher's complete notes, attachments,
  tags, or reading history.
- Explicit project snapshots make past revisions reproducible after library
  metadata changes or sharing revocation.
- Project unlink, library archive, and permanent deletion have distinct,
  explainable effects.

**Negative:**

- Storage and APIs must enforce owner-private resources, explicit share records,
  and project snapshots across separate authorization domains.
- Revocation cannot retract content already incorporated into an authorized
  immutable project revision.
- Tombstoned evidence preserves explanation but cannot reopen deleted private
  artifacts.
- Sharing and archival export must enforce source rights and cannot assume that
  a researcher may redistribute every attached document.

**Neutral:**

- Collaborators may have different private annotations for the same stable
  source identity.
- A future team-owned library would require its own ownership decision rather
  than weakening the personal-library default.

## Alternatives Considered

### Make all library material visible to project collaborators

This is simple but exposes unrelated research history and potentially licensed
or sensitive source material whenever a publication is cited.

### Keep all research material project-scoped

This avoids cross-boundary authorization but prevents reuse and recreates the
per-paper duplication rejected by ADR-058.

### Let projects reference live private resources without snapshots

Live references save storage but make historical output change when the owner
edits, revokes, or removes the underlying material.

### Remove shared content retroactively on revocation

This maximizes owner control but rewrites collaborative history and makes past
milestones and evidence audits unreliable.
