# ADR-051: Reconcile BibTeX and Version SQLite Migrations

**Status:** Implemented

**Date:** 2026-07-10

## Context

Kirjolab keeps BibTeX as portable authored source and stores publication rows as
stable working-memory resources. The first reference-library slice projected
entries only during explicit import. Direct collaborative edits to the
bibliography—including the default seeded entry—could therefore render and
export correctly while remaining absent or stale in publication search,
navigation, and relationships.

Re-projecting an entry also has provenance consequences. Explicit Crossref
enrichment writes accepted fields into canonical BibTeX and labels the
publication `crossref`. A later reconciliation of identical canonical values
must not relabel that resource or churn its update timestamp, while an authored
change must become visibly `bibtex`-sourced.

The same document room has accumulated schema creation, conditional column
checks, and data backfills without a durable record of which transformations
ran. The catalog and access Durable Objects also initialize schema
imperatively. `CREATE TABLE IF NOT EXISTS` is safe for first creation but cannot
order or audit later schema and data evolution. A failed deployment must be able
to retry a migration without exposing partially transformed per-object state.

Canonical-to-projection reconciliation and schema evolution are both durable
materialization boundaries. Each needs an ordered, transactional, replay-safe
contract.

## Decision

### Reconcile Every Canonical Bibliography Change

After every causally new Yjs update that changes bibliography text, parse the
complete canonical BibTeX and materialize every complete entry returned by the
supported parser. Apply the same reconciliation after imports and explicit
Crossref enrichment. Manual typing, remote collaboration, seeded bibliography,
and API operations therefore share one projection path.

Project these values from each entry:

- case-preserved citation key and entry type
- title, ordered authors, year, and venue
- normalized DOI, URL, and abstract

Choose an existing publication deterministically: first match the citation key
case-insensitively; only when no key matches, match the normalized non-empty
DOI. Preserve the matched internal publication UUID. Create a new UUID only
when neither identity hint matches.

Compare every projected value exactly, including ordered authors. When the
projection is unchanged, leave the row untouched so its metadata-source
provenance and `updatedAt` timestamp survive. When canonical BibTeX changes any
projected value, update the stable resource, set its provenance to `bibtex`, and
advance its timestamp.

Explicit accepted Crossref enrichment remains `crossref`-sourced. Fetch and
validate external metadata before entering the document transaction, then
materialize the accepted values into canonical BibTeX and the matching
publication together. The subsequent projection observes identical values and
therefore preserves the explicit Crossref provenance and timestamp.

Treat publication resources as monotonic scholarly working memory. An entry's
absence from the current canonical BibTeX does not delete its publication row.
Removal means “not currently authored in this bibliography,” not “erase this
known publication.” A later archive, merge, or deletion workflow must be an
explicit resource operation with relationship-aware policy.

Imports, enrichment, and any other complete bibliography replacement must
materialize the smallest common-prefix/suffix `Y.Text` splice rather than
delete-all/insert-all. Commit the merged Yjs state, readable Markdown and
BibTeX, revision, and all publication projection writes in one synchronous
SQLite transaction. A projection failure must not leave canonical bibliography
and resource rows describing different accepted states.

### Version Every Durable Object SQLite Schema

Give every SQLite-backed Durable Object class an ordered, named, append-only
migration list and a private `_kirjolab_migrations` ledger containing a positive
integer version, stable name, and application timestamp:

```sql
_kirjolab_migrations(
  version INTEGER PRIMARY KEY CHECK (version > 0),
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
)
```

Migration definitions must have strictly increasing unique positive safe-integer
versions and stable trimmed names of at most 200 characters. When an existing
ledger version has a different name, fail closed because already-applied history
was edited. Never reorder, rename, remove, or change an applied migration;
append a new migration instead.

During Durable Object initialization, inspect the ledger and apply each pending
migration in order. Run the migration callback and its ledger insert in the same
`transactionSync` operation. If either fails, neither is committed, object
initialization fails, and the pending migration is retried on a later
activation. Migration callbacks are synchronous and perform no external I/O.

Use the ledger for schema creation and data evolution in `DocumentRoom`,
`WorkspaceCatalog`, and `WorkspaceAccess`; do not leave ad hoc column probes or
unrecorded backfills beside it. Represent the manuscript-anchor column/backfill
work and initial projection of already-canonical bibliography as named data
migrations. This ensures pre-existing rooms gain verified relative anchors and
publication resources even if no later edit happens.

The per-instance SQL ledger is distinct from Wrangler's Durable Object class
migrations. Wrangler creates or renames namespace classes; the application
ledger evolves each instance's SQLite contents.

## Trigger

A strict review found that canonical bibliography edits and the default
bibliography did not populate publication resources, while schema evolution
depended on repeated `IF NOT EXISTS` statements and one-off column inspection.
The manuscript-anchor slice added the first stateful data backfill and made an
explicit migration lifecycle necessary.

## Consequences

**Positive:**

- Publication search and navigation reflect every syntactically complete
  canonical BibTeX entry, regardless of how it was authored.
- Stable publication UUIDs survive case-only keys, reimports, DOI matches, and
  metadata edits.
- Unchanged Crossref data retains truthful provenance and timestamps.
- Removing authored BibTeX cannot silently erase working-memory resources or
  their future relationships.
- Document text, Yjs state, revision, and publication projection cannot commit
  as mismatched states.
- Schema and data transformations are ordered, auditable, retryable, and fail
  closed when applied history changes.

**Negative:**

- A bibliography-changing collaborative update reparses the complete supported
  BibTeX source and compares all complete entry projections.
- While a researcher is typing an incomplete entry, its resource projection
  intentionally lags until the parser recognizes a complete entry.
- Monotonic publication storage can retain obsolete, duplicate, or no-longer-
  cited resources until explicit library management exists.
- Key-first identity matching can preserve a resource when an author reuses a
  citation key for substantially changed metadata; the deterministic rule is
  visible but not a semantic deduplication guarantee.
- Append-only migrations add code and activation-time work, especially for data
  backfills in older rooms.

**Neutral:**

- BibTeX remains canonical; publication rows remain durable supporting
  resources rather than a replacement bibliography.
- Crossref network I/O remains outside SQLite transactions and requires an
  explicit user action.
- Projection is monotonic but not immutable: canonical edits update a stable
  resource and record `bibtex` as the latest metadata source.
- Wrangler namespace migrations continue alongside, not inside, the
  per-instance application ledger.

## Alternatives Considered

### Project Only During Import

This keeps normal Yjs writes cheaper but allows manually edited, remote, and
seeded canonical BibTeX to drift indefinitely from resource navigation.

### Rebuild the Publication Table After Every Edit

Rebuilding is straightforward but changes UUIDs, drops provenance and
timestamps, and can break relationships to publications. Reconciliation
preserves stable working-memory identity.

### Delete Resources Missing from Current BibTeX

This makes the projection set-shaped but conflates removing an authored entry
with deleting accumulated scholarly knowledge. It would require cascade and
relationship policy that this slice does not define.

### Always Rewrite Matched Rows as BibTeX

This is simpler than comparing projections but erases explicit Crossref
provenance and churns timestamps after every no-op reconciliation.

### Continue with Idempotent DDL and Column Probes

`IF NOT EXISTS` can bootstrap tables, but it does not record ordered data
transformations, detect edited history, or make a transformation and its
completion record atomic.

### Use a Separate Migration Service

A central service could scan all Durable Objects, but it adds discovery,
deployment, and coordination machinery. Per-instance migrations during guarded
initialization fit the current document, catalog, and access atoms.
