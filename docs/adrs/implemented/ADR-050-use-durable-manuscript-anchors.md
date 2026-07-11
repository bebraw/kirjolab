# ADR-050: Use Durable Manuscript Anchors

**Status:** Implemented; model-candidate replacement scope superseded by [ADR-056](./ADR-056-persist-grounded-passage-revisions.md)

**Date:** 2026-07-10

## Context

Kirjolab connects PDF annotations and claims to selected manuscript passages.
The first implementation validated an exact source excerpt at creation and then
stored permanent numeric offsets. Those offsets describe one document version,
not the passage itself. Any insertion or deletion before the range can make a
link navigate to unrelated prose while still appearing valid to the researcher.

Yjs relative positions can follow a range through concurrent editing. A
referenced range can still be deleted, collapse, or become unavailable, and
existing rows contain only offsets and an exact excerpt. Quote and context are
valuable evidence of what was selected, but using them to relocate a scholarly
relationship can silently attach it to repeated or moved prose. An unavailable
relative anchor must therefore become explicitly stale rather than invoke a
second navigation identity.

The public representation therefore needs to distinguish immutable selector
evidence from a current, derived resolution. A current offset may be useful for
navigation, but it must not look like durable link identity.

Whole-document operations create a second anchor hazard. Model candidates
intentionally carry complete proposed Markdown, but materializing one by
deleting all current `Y.Text` and inserting the proposal gives even unchanged
prose new Yjs identities. Durable anchors therefore constrain replacement
semantics as well as link storage and resolution.

## Decision

Represent every annotation-passage and claim-passage relationship with a
versioned `ManuscriptAnchorSelector` and a derived
`ManuscriptAnchorResolution`.

New link requests carry the source revision, requested start/end offsets, and
exact selected text. `DocumentRoom` accepts the request only when the revision
is still current, the range is non-empty and in bounds, and the current source
slice equals the supplied exact text. It derives surrounding prefix and suffix
context on the server rather than trusting caller-supplied context.

Store new selectors as version 1 with:

- base64url-encoded Yjs relative start and end positions
- start association `0` and end association `-1`
- immutable exact text, prefix, and suffix
- the original requested range
- the revision at which the selector was anchored

The public selector contract is:

```ts
interface ManuscriptAnchorSelector {
  version: 1;
  relativeStart: string | null;
  relativeEnd: string | null;
  exact: string;
  prefix: string;
  suffix: string;
  originalRange: { start: number; end: number };
  anchoredRevision: number;
}
```

Resolve a version 1 anchor only through both stored Yjs relative positions. If
they decode into the manuscript `Y.Text` and produce an in-bounds,
non-collapsed range, return that range even when its current text differs from
the captured exact text. If either position is unavailable, resolves outside
the source type, or produces an invalid or collapsed range, return `stale`.

Exact text, prefix, suffix, original offsets, and anchored revision remain
immutable provenance. They may explain and display the relationship, but they
must never become runtime offset, quote, fuzzy, nearest, or first-match
navigation fallback. A resolved range reports whether its current text still
exactly matches the captured quote.

The public resolution contract is:

```ts
type ManuscriptAnchorResolution =
  | {
      status: "resolved";
      start: number;
      end: number;
      text: string;
      exactMatch: boolean;
    }
  | { status: "stale" };
```

Passage-link resources expose the immutable selector and current resolution.
They do not expose mutable current `start` or `end` values at the top level.
Consumers navigate only a `resolved` result and present changed or stale states
explicitly.

Because the offset-only schema has no real user data yet, perform a one-time
conservative backfill when adding anchor columns. Derive relative positions for
a legacy row only when its stored range is valid and its excerpt still equals
the current materialized source slice. Every public selector uses version 1; a
row that cannot receive verified relative positions keeps null endpoints and
resolves explicitly to `stale`. Runtime resolution never falls back to its old
offsets or excerpt.

Preserve surviving Yjs identities when an operation proposes a whole new
manuscript string. Candidate application and every other whole-document
replacement must find the longest common prefix and non-overlapping common
suffix between the current and proposed source, then delete and insert only the
differing middle as one `Y.Text` transaction. Never implement replacement as
delete-all followed by insert-all: that discards the Yjs items under unchanged
prose and makes anchors stale even when their passages survived verbatim.

[ADR-056](./ADR-056-persist-grounded-passage-revisions.md) supersedes the
whole-document model-candidate assumption above: model revisions now persist a
Yjs-anchored passage target and splice only that verified range. The anchor
identity rules and minimal-splice requirement for operations that genuinely
replace a complete document remain in force.

## Trigger

A strict review found that stored passage offsets were treated as permanent
even though collaborative edits could move them to unrelated text. This broke
the intended traceable path from evidence and claims into authored prose.

## Consequences

**Positive:**

- Links normally follow their selected manuscript range through concurrent
  insertions and deletions around it.
- Deleted, collapsed, or unavailable passages become visible stale states
  instead of silent navigation errors.
- Immutable selector evidence remains distinguishable from transient current
  offsets.
- Existing passage links remain readable without fabricating richer historical
  data.
- Whole-document proposals preserve anchor identities in their unchanged prefix
  and suffix.

**Negative:**

- The pre-adoption passage-link API shape changes without transitional
  top-level offsets; an already-open development tab must reload with the
  matching client bundle.
- Each passage link stores more metadata and is resolved against current source
  when represented.
- Yjs relative-position encoding becomes part of the persisted version 1
  selector format.
- A passage whose relative range survives but whose text changes needs an
  explicit `exactMatch: false` presentation rather than a binary valid/invalid
  interpretation.
- A link becomes stale when its relative positions cannot resolve even if a
  unique copy of its exact quote still exists elsewhere.
- Backfilled legacy rows record migration-time anchoring rather than the
  unavailable revision at which the historical link was originally created.
- A common-prefix/suffix splice is intentionally not a general diff; unchanged
  islands inside the replaced middle may still receive new Yjs identities.

**Neutral:**

- Resolved numeric offsets remain available for immediate browser selection,
  but only inside the derived resolution.
- The anchor does not mutate Markdown or embed provenance syntax in the
  manuscript.
- Exact quote/context and original offsets are audit metadata, not alternate
  navigation algorithms.
- ADR-056 replaces complete proposed Markdown for model candidates with a
  targeted passage replacement while retaining this ADR's Yjs anchor rules.
- This strengthens the passage-link representation introduced with annotations
  and claims without changing those resource identities or relationship types.

## Alternatives Considered

### Adjust every stored offset after each edit

This would preserve a simple public shape but requires interpreting concurrent
CRDT operations as imperative offset transforms for every link. It duplicates
Yjs positioning semantics and is difficult to make atomic across reconnects and
replays.

### Fall back to exact quote and context

Text selectors can recover some deleted or unavailable relative ranges, but a
match may be repeated or may represent prose copied to a different context.
Using it for navigation would create a second identity rule and could silently
reattach scholarly provenance.

### Pick the nearest or first quote match

This keeps navigation available more often but can connect evidence or a claim
to the wrong prose without warning. That is unacceptable for a provenance
relationship.

### Keep runtime offset compatibility for old rows

This would keep more rows navigable, but an offset can point to unrelated prose
after any earlier edit. The one-time verified backfill is a bounded migration;
unconvertible rows retain null endpoints and remain stale instead of carrying
that risk forever.
