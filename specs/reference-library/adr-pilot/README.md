# PDF citation-key rule pilot

This pilot replays three Kirjolab decisions about a new PDF draft's generated citation key. The [reference-library spec](../spec.md) and the [decision log](../../../docs/adrs/README.md) govern the product. The three YAML files in this directory are experiment inputs converted from the decision log at commit `403cd810`. They preserve the authored prose and the two partial-supersession links. The [rule vocabulary](./project-rules.yaml) defines the eight questions and their possible answers.

## Run the query

This replay used vibe-template commit `8b09487`. Install its locked dependencies with `npm ci` in that checkout, then run the commands below from the Kirjolab pilot root. The example assumes sibling checkouts. [Pinned template CLI](https://github.com/bebraw/vibe-template/blob/8b0948778278c31f054d0b6bf46d74d0916fc9fa/scripts/adr-rules.mjs)

```sh
TEMPLATE_CLI=../vibe-template/scripts/adr-rules.mjs
node "$TEMPLATE_CLI" --records specs/reference-library/adr-pilot pdf-citation-key-refinement
node "$TEMPLATE_CLI" --records specs/reference-library/adr-pilot --json
node "$TEMPLATE_CLI" --records specs/reference-library/adr-pilot --check
```

Run the CLI with the Node version and dependencies specified in the template checkout. It reads evidence relative to Kirjolab's root. The selected directory supplies its complete YAML log and vocabulary.

## Current answer

<!-- adr-rules:start -->

### `pdf-citation-key-refinement`

Current decision [ADR-154](implemented/ADR-154-refine-linked-pdf-reference-keys.yaml) · [Verification](../../../src/durable-objects/reference-library.workers.test.ts)

- Can a manual or explicitly reviewed metadata correction change a new PDF draft's generated key before its first project link? — Recompute the key from the corrected metadata using the unique-key allocator. The result may equal the old key.
- Can a manual or explicitly reviewed correction to an author or publication year change a PDF draft's generated key after its first project link? — Recompute the generated library key. The PDF remains refinable after its first project link.
- After all projects unlink a previously linked PDF, can a later manual or explicitly reviewed correction change its generated key? — Recompute the key on correction. The PDF remains refinable after unlinking.
- What happens to the PDF's generated key when a researcher only previews a metadata suggestion? — Keep the existing key during preview.
- Which identifier ties a project citation to the same library source across metadata corrections? — The library UUID remains the relational identity across corrections and alias changes.
- When a linked PDF key changes, what happens in a project whose alias exactly matches the old generated key and whose new alias is free? — On successful propagation, replace the alias and rewrite its canonical citations and derived bibliography in one project revision.
- When a linked PDF key changes, what happens to a project alias the researcher customized to a different value? — Preserve the project alias and its citations. The library key may still improve.
- When a linked PDF key changes, what happens if the matching generated project alias would collide with another alias on replacement? — Preserve the existing alias and its citations in that project. Other projects can accept the replacement independently.

History [ADR-076](implemented/ADR-076-assign-immutable-reference-keys.yaml) → [ADR-083](implemented/ADR-083-finalize-provisional-reference-keys.yaml) → [ADR-154](implemented/ADR-154-refine-linked-pdf-reference-keys.yaml)

<!-- adr-rules:end -->

## Compare the answers with product behavior

The library Worker test creates a PDF draft, edits its metadata, links it to a project, refines the linked key, unlinks the project, and refines the key again. The document-room test checks an available generated alias, a custom alias, and a collision. The API tests check that a changed key is sent to the project and that previewing a suggestion leaves metadata untouched until acceptance. Run these cases with Kirjolab's pinned toolchain:

```sh
npm run test:workers -- src/durable-objects/reference-library.workers.test.ts src/durable-objects/document-room.workers.test.ts -t 'keeps PDF-origin keys refinable after project linking|derives project aliases and bibliography from shared reference snapshots'
npm test -- src/api/reference-library.test.ts -t 'propagates a refined generated key to matching project aliases|previews Crossref metadata without mutation and applies only a reviewed fingerprint'
```

For a retrospective comparison, ask the query when a private key could first change, what first project use did to it at each revision, and what happens to a custom or colliding alias today. ADR-076 fixed keys at intake. ADR-083 permitted private PDF refinement up to the first link. ADR-154 permitted refinement after linking and unlinking. The earlier decisions have no answer for propagating a key change to an existing project, since they froze the key by that point. Read the implementation's present-day assertions alongside the historical decisions. [Original decision](../../../docs/adrs/implemented/ADR-076-assign-immutable-reference-keys.md) · [First amendment](../../../docs/adrs/implemented/ADR-083-finalize-provisional-reference-keys.md) · [Current decision](../../../docs/adrs/implemented/ADR-154-refine-linked-pdf-reference-keys.md)

In a blind replay, a model reviewer received five maintainer questions and only the text query output. It reconstructed all three revisions, identified the alias exceptions, and correctly left web captures and legacy PDF migrations unresolved. The reviewer found the linked-key question ambiguous about editing just one field. The question now says “an author or publication year.”

The cases cover new PDF drafts and actions that explicitly apply metadata. Web capture has its own decision history. ADR-154 also describes a narrower migration for older linked PDFs with fallback keys.
