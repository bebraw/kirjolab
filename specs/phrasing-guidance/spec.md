# Feature: Licensed Phrasing Guidance

## Blueprint

### Context

Kirjolab helps researchers perform common scholarly moves without redistributing
an unlicensed phrasebank. A compact reviewed inventory gives weaker local models
reliable conventional patterns, while contextual generation keeps the result
specific to the researcher's passage and subject to normal review.

### Architecture

- The distributable inventory and machine-readable source ledger are versioned
  content artifacts. Every release identifies its extraction version, review
  date, independently authored rhetorical taxonomy, and applicable attribution.
- Corpus sources are limited to CC0 and CC BY papers whose machine-readable
  licence and designated retrieval route are recorded. Unknown, custom, NC, ND,
  and SA licences fail validation.
- An accepted pattern is short, contains only typed reusable slots, and records
  recurrence across at least three articles, three independent author groups,
  and two publication venues. Automated recurrence is evidence only; each item
  carries an explicit human review decision and source-similarity assessment.
- Source records identify the article, authors, venue, DOI, licence, retrieval
  route, and the inventory patterns they support. The shipped ledger contains
  no source excerpts, titles-as-patterns, quotations, named concepts, or other
  content-bearing fragments.
- `phrase-passage` is a typed, evidence-optional assistant operation. It accepts
  one rhetorical purpose, the exact visible manuscript target, and zero or more
  purpose-matched vetted patterns. The model returns three to five complete
  contextual alternatives with short rationales.
- The operation can run without a matched pattern. It never retrieves corpus or
  third-party phrasebank content at runtime, and it does not expose a generic
  phrase search or direct insertion path.
- Alternatives remain browser-local until the researcher chooses one. Choosing
  an alternative creates an ordinary `revise-selection-v1` candidate with the
  captured source revision and evidence; applying remains a separate stale-base
  validated action.
- Attribution and source-ledger access remain available from the writing
  assistant wherever vetted patterns are used.

### Anti-Patterns

- Do not ingest, quote, classify, fixture, evaluate against, or reconstruct the
  University of Manchester Academic Phrasebank.
- Do not treat frequency, a compatible corpus licence, or attribution as
  sufficient approval for an individual pattern.
- Do not ship source-specific language, permit free-form inventory search, or
  send unrelated manuscript text to the model.
- Do not let generated phrasing bypass candidate review or stale-revision
  checks.

## Contract

### Definition of Done

- [x] A reviewed initial inventory covers qualifying a claim, contrasting
      findings, introducing evidence, and stating a limitation.
- [x] Every accepted pattern passes licence, provenance, recurrence, slot,
      review, and source-similarity validation.
- [x] CC BY sources have a shipped attribution notice and machine-readable
      ledger.
- [x] A researcher can select a rhetorical purpose and receive three to five
      contextual alternatives for the visible target.
- [x] A chosen alternative enters exact before-and-after candidate review and
      cannot directly mutate canonical Markdown.
- [x] The operation works from rhetorical purpose alone when no pattern applies.
- [x] Unit and browser tests cover inventory validation, prompt bounds,
      alternative parsing, selection, and stale-target behavior.

### Regression Guardrails

- Licence validation uses an explicit allowlist containing only `CC0-1.0` and
  `CC-BY-4.0`; a missing or newly encountered licence fails closed.
- Pattern ids, purpose ids, source ids, typed slots, and extraction versions are
  bounded and unique. Every source and pattern relationship is reciprocal.
- Each pattern has at least three supporting sources with disjoint normalized
  author groups and at least two venues.
- Source-similarity review is tied to the current extraction version and records
  that no accepted pattern contains a distinctive source fragment.
- The model receives at most five purpose-matched patterns and no corpus source
  text, article title, author, venue, DOI, retrieval URL, or attribution text.
- The provider response contains only three to five bounded alternatives with
  text and rationale. Duplicate or unchanged alternatives are rejected.
- A selected alternative persists only through the existing targeted candidate
  endpoint; candidate creation and apply retain conservative revision equality.

### Scenarios

**Scenario: Vetted patterns guide a contextual operation**

- Given: a current manuscript passage and a rhetorical purpose with reviewed
  patterns
- When: the researcher asks the local model for phrasing alternatives
- Then: the model receives only the passage, purpose, and bounded reusable
  patterns and returns three to five transient alternatives

**Scenario: Purpose has no applicable pattern**

- Given: a current manuscript passage and a valid rhetorical purpose whose
  inventory selection is empty
- When: the researcher requests alternatives
- Then: the local model works from the purpose alone under the same typed output
  contract

**Scenario: Researcher chooses one alternative**

- Given: transient alternatives captured against the current passage revision
- When: the researcher selects one alternative
- Then: Kirjolab opens an ordinary targeted revision candidate and leaves the
  manuscript unchanged until explicit apply

**Scenario: Inventory provenance drifts**

- Given: an inventory or source-ledger change
- When: validation finds a disallowed licence, missing reciprocal relationship,
  insufficient recurrence, stale similarity review, or absent attribution
- Then: the content gate fails and the inventory cannot be released
