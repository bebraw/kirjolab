# Feature: Project Revision History

## Blueprint

### Context

A paper is more than its current `main.md`. Submission and publication states
must retain the composed file tree, citation aliases, pinned sources, evidence,
and project settings exactly as they existed, while ordinary collaboration
continues to use a narrow source revision for stale-selection checks.

### Architecture

- `DocumentRoom` owns an append-only logical history sequence in SQLite. The
  sequence is distinct from the manuscript concurrency revision.
- One browser-local XState actor coordinates timeline loading and mutually
  exclusive inspect, compare, milestone, branch, and restore operations. It
  owns only active-operation identity, request generation, and transient
  failure state; retained revisions, fetched projections, confirmation prompts,
  navigation, and server mutations remain outside the actor.
- Every retained snapshot stores the exact Yjs update plus workspace settings
  and the rows for project files, references, research shares, PDFs,
  annotations, claims, manuscript comments, and their typed relationships in
  the same transaction as the logical mutation.
- A materialized review artifact and its immutable provenance pin are project
  state and therefore participate in project history, restore, comparison, and
  revision seeding. The live many-to-many project-review link ledger is
  operational access state outside revision snapshots.
- Consecutive manuscript updates within 30 seconds refresh one untagged working
  checkpoint instead of creating one full snapshot per keystroke. A milestone
  freezes that checkpoint; the next edit starts another revision. Explicit
  project and resource operations never enter this coalescing path.
- Existing projects receive one adoption snapshot. History rows and milestone
  rows are excluded from snapshot payloads so retention does not recurse.
- Milestone names are project-unique, immutable tags over one exact revision.
- Historical projections are read-only and omit internal Yjs and raw SQLite
  representations. They expose composed source and the retained scholarly
  resources needed for inspection.
- Restore replaces the coordination state and captured resource tables, then
  records a new head. It never deletes the target or intervening revisions.
  Connected browsers receive a server-owned `reset` control and reload from an
  empty local Yjs document so newer CRDT operations cannot merge back in.
- Restoring an older project revision restores the materialized review files
  and pins captured there but never reactivates, removes, or otherwise rewrites
  a live project-review link.
- A revision seed creates a new owner-controlled workspace with revision zero,
  rewrites project-scoped research-share identity to the new workspace, and
  does not copy collaborators or milestones.
- Diffs join files and PDFs by stable id. Text files report added/removed lines,
  path changes are renames, and composed `main.md` is compared at both
  endpoints. The composed comparison also reports before, after, and delta
  word counts under `kirjolab-prose-v1`. PDFs report name, media type, size,
  and fingerprint changes.
- Logical history and named milestones are retained indefinitely. This slice
  exposes no automatic pruning or milestone mutation.

### API Contracts

- `GET /api/workspaces/{id}/history` returns up to the 500 most recent revision
  summaries while retaining older rows in storage.
- `GET /api/workspaces/{id}/history/{revision}` returns one read-only snapshot.
- `GET /api/workspaces/{id}/history/compare?from={a}&to={b}` returns neutral
  file, composed-text, publication word-count, and binary identity changes.
- `POST /api/workspaces/{id}/history/{revision}/milestones` creates one
  immutable owner-only milestone.
- `POST /api/workspaces/{id}/history/{revision}/restore` restores as a new
  owner-only head.
- `POST /api/workspaces/{id}/history/{revision}/seed` creates and returns a new
  owner-only workspace summary.

### Regression Guardrails

- Resource-only mutations must create logical history without invalidating a
  current manuscript selection or model candidate.
- Fine-grained manuscript updates must coalesce only while the latest automatic
  checkpoint is untagged and no more than 30 seconds old.
- A document mutation and its logical snapshot must commit atomically.
- Restore failure must retain the prior live Yjs document and head state.
- Milestone creation must reject duplicate names without changing the target.
- Historical reads and comparisons must not mutate the live project.
- Closing or reopening History invalidates late timeline, inspection, and
  comparison responses. A mutation that the server has already accepted still
  completes its required refresh, reload, or navigation consequence.
- Comment creation and resolution must create distinct resource revisions while
  leaving the manuscript concurrency revision unchanged.
- Restore must preserve every older revision and milestone.
- Seed must not inherit workspace membership or point research shares at the
  source workspace id.
- Seed may retain historical materialized review artifacts and their provenance
  pins, but it must not copy the source project's live review links or grant
  access to any review.
- Stored SQL identifiers are fixed application table/column names; revision
  payloads must never create arbitrary SQL structure.

## Current Milestone

- Implemented: atomic logical snapshots, history list and read-only inspector,
  immutable milestones, restore-as-new-head, revision seeds, rename-aware text
  and composed diffs, publication word deltas, binary identity comparison,
  owner/member authorization, reset-safe collaboration, Workers tests, and
  browser coverage. Revision projections include attributed open and resolved
  manuscript comments.
- Deferred: pagination beyond 500 summaries, owner-directed eligible-history
  deletion, deduplicated snapshot storage, PDF page-count/dimension extraction,
  and richer semantic Markdown diff rendering.
