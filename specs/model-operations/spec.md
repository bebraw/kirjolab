# Feature: Grounded Model Operations

## Blueprint

### Context

Kirjolab uses local-capable language models to propose inspectable scholarly
changes. Typed capabilities cover passage revision and evidence-backed claim
drafting, with clarity drilling, ideation, reference discovery, and structured
syntax exposed through the same operation framework as their contracts land.
All mutation operations preserve a human review boundary.

### Architecture

- One typed registry defines every assistant operation's presentation, target
  scopes, evidence requirement, action, and availability. The UI does not infer
  operation semantics from a generic prompt.
- A non-empty manuscript selection always resolves exactly. Otherwise the
  remembered Yjs-relative caret expands deterministically to the configured
  sentence, paragraph, or Markdown section, or remains an insertion point.
  The resolved target is previewed before provider I/O.

- `revise-selection` captures one current exact passage, instruction, provider
  adapter/label, model name, and one to twelve typed, versioned evidence
  references before provider I/O.
- A provider-neutral browser contract isolates operation semantics from the
  initial OpenAI-compatible HTTP adapter.
- `clarity-drill` first returns one bounded ambiguity and one focused question.
  Only after the researcher answers does a second typed request return two to
  four bounded passage rewrites with short rationales. The drill is transient;
  choosing an option creates an ordinary targeted revision candidate with the
  captured source revision and evidence rather than changing prose directly.
  Clarity candidates may have no research evidence because the researcher's
  answer and captured prose are their provenance; ordinary grounded revision
  continues to require selected evidence in the UI.
- `ideate` returns three to five distinct direction cards for the visible
  selection, paragraph, or Markdown section. Each card contains a bounded title,
  rationale, and complete target replacement draft. Ideas remain transient;
  promoting one creates an evidence-optional targeted candidate captured against
  the original source revision.
- `build-table` accepts separate caption, column, and pipe-delimited row fields
  instead of forcing complex requirements into one prompt. The model returns
  bounded structured cells with the requested dimensions; the client validates
  the shape and serializes portable GFM deterministically. The researcher sees
  the exact syntax and explicitly inserts or replaces it only while the captured
  manuscript revision and target still match.
- `find-references` lets the model formulate one bounded search query and a
  rationale from the visible claim, but never accepts model-authored citation
  records. The query is executed against configured scholarly metadata
  providers; only validated DOI-bearing provider results are displayed. Saving
  imports reviewed CSL JSON into the private Library, after which ordinary
  project-use and citation workflows apply.
- Model connection settings discover live model identifiers from the standard
  OpenAI-compatible `/models` route instead of hardcoding a catalog. Discovery
  is explicit, bounded, credential-free, loopback-only, and available through
  the same optional companion when provider CORS blocks direct browser access.
- Generation requests use JSON Schema response formats for passage revisions
  and claim drafts. The adapter accepts plain replacement text as a
  compatibility fallback, but rejects malformed or unexpected JSON envelopes.
- Reasoning effort is an explicit transient model setting. Focused writing
  operations default to `none` for responsive local inference, while low,
  medium, high, and provider-default behavior remain selectable.
- The initial adapter permits credential-free HTTP(S) loopback endpoints only,
  omits browser credentials, rejects redirects, aborts after 120 seconds, and
  reads at most 256 KiB of OpenAI-compatible JSON. The page CSP exposes the same
  IPv4, localhost, and IPv6 loopback boundary.
- When direct browser access is blocked by provider CORS or browser networking,
  the companion started by `npm run dev` exposes the same OpenAI-compatible path at
  `127.0.0.1:8790`. The user explicitly starts it with a fixed loopback
  upstream and exact allowed Kirjolab origin. It binds only IPv4 loopback,
  validates task shape, permits bounded CORS/private-network preflight, rejects
  redirects, and caps request and response bodies at 256 KiB.
- `npm run dev` supervises the Worker and, when an upstream is configured, the
  companion as one local session. It loads local operator configuration from
  the ignored project-root `.env`, strips every `KIRJOLAB_MODEL_*` value from
  the Worker child, disables Wrangler's automatic `.env` discovery, and shuts
  the sibling down when either process exits. Worker-local values remain in
  `.dev.vars`. A checked-in `.env.example` documents the supported variables,
  explicit process variables take precedence, and `npm run model:companion`
  remains a standalone troubleshooting path.
- Only the resolved passage, instruction, and chosen evidence snapshots enter
  the operation prompt; the adapter also sends the configured model identifier.
  No unrelated manuscript text is transmitted.
- The provider returns bounded replacement Markdown, never a complete document
  or a direct mutation.
- Candidate creation verifies current manuscript revision/exact text and every
  evidence reference/version, then persists a Yjs-relative target, immutable
  evidence snapshots, instruction, provider/model, and replacement.
- Append-only document-room migration 8 replaces the pre-launch
  whole-document candidate table and discards its derived rows; no legacy
  whole-document candidate is interpreted under the targeted contract.
- `POST /api/workspaces/{id}/candidates` accepts only the fixed
  `revise-selection-v1` operation shape. Apply and reject remain separate
  authorized candidate actions.
- Review presents before, after, and navigable evidence together.
- The operation UI is the permanent Writing assistant Context tab associated
  with the authoring workflow. Passage selection, instruction, and evidence are
  primary; endpoint and model connection fields remain available under
  secondary settings instead of occupying persistent chrome.
- The active manuscript caret or selection is retained as Yjs-relative
  positions. Editor chrome always reports its file and line, while the existing
  highlight layer paints the local target after textarea focus moves into
  Context. Switching files creates a new caret at that file's start.
- Each candidate can open one stable resource-keyed Context tab. Tab lifecycle
  and scroll remain local while the candidate and its provenance are shared
  authorized workspace state.
- Apply requires a pending, current, exact candidate and splices only the target
  range; reject never changes canonical source.
- `draft-claim` captures one to twelve current annotations, one bounded
  instruction, and a researcher-selected `supports`, `contradicts`, or `extends`
  relation before provider I/O.
- The provider returns one bounded proposition and optional working note under
  `draft-claim-v1`; it never chooses or changes the evidence relation.
- A claim-draft candidate persists immutable annotation snapshots, provider and
  model identity, instruction, relation, proposition, and note without a
  manuscript target.
- Applying a current claim draft revalidates every annotation version and
  atomically creates an ordinary claim, its evidence links, a project revision,
  and accepted candidate status. Rejection creates no claim.
- The hosted Worker never attempts to reach a browser-local model endpoint.

### Anti-Patterns

- Do not send or persist a whole-document replacement for a passage operation.
- Do not accept untyped or unknown evidence ids.
- Do not reconstruct candidate evidence from mutable current resources alone.
- Do not apply stale, collapsed, or inexact targets.
- Do not let provider-specific response shapes enter the domain API.
- Do not draft a claim from another claim, infer its evidence relation, return a
  batch of proposals in the first slice, or create a claim before review.
- Do not let the browser choose or override the companion's upstream, expose
  the companion on a non-loopback interface, or allow wildcard origins.
- Do not add chat, RAG, embeddings, automatic citations, or direct model writes
  in this slice.

## Contract

### Definition of Done

- [x] A researcher can select prose or target the sentence, paragraph, or
      section at the remembered caret, choose annotation/claim evidence, and
      add a bounded revision instruction.
- [x] The browser invokes a provider-neutral operation through the local
      OpenAI-compatible adapter.
- [x] An explicitly started local companion can bridge the same operation when
      direct browser-provider access is unavailable.
- [x] A candidate persists a typed immutable base and targeted replacement.
- [x] Review shows original, replacement, and linked evidence without a raw
      whole-document proposal.
- [x] Apply changes only the verified selected range; reject changes no source.
- [x] Stale manuscript or evidence input creates or applies no candidate.
- [x] Unit, Workers-runtime, and browser tests cover the reviewed lifecycle.
- [x] A researcher can draft one claim from selected annotations without a
      manuscript selection.
- [x] Review shows the proposed proposition, working note, chosen relation, and
      immutable source annotations.
- [x] Applying creates the normal claim and evidence links only when every
      annotation version is current; rejecting creates no claim.
- [x] Unit, Workers-runtime, and browser tests cover the claim-draft lifecycle.
- [x] A researcher can run a one-question clarity drill on the visible target,
      answer in their own words, and choose among two to four precise rewrites.
- [x] A chosen clarity rewrite enters the ordinary exact before/after candidate
      review and cannot bypass stale-target validation or explicit apply.
- [x] A researcher can compare three to five distinct directions for the current
      manuscript context and promote one complete draft into exact review.
- [x] A researcher can describe a 2–8-column, 1–100-row table through structured
      fields, preview deterministic GFM, and explicitly insert it at the caret or
      replace the visible selection.
- [x] A researcher can derive a focused query from the current claim, inspect
      DOI-verifiable provider records, and explicitly save one to the Library.

### Regression Guardrails

- Provider requests must omit unrelated manuscript text and reject redirects
  outside the validated endpoint.
- Provider output, instructions, identifiers, and evidence sets remain bounded.
- Candidate provenance must be server-validated against known same-workspace
  resources and exact evidence versions.
- Targeted revision evidence may be empty only for operation flows that declare
  evidence optional; every supplied reference must still be typed, unique,
  current, same-workspace, and captured immutably.
- Candidate creation and application use conservative source-revision equality.
- Target identity resolves only through its Yjs-relative anchor; offsets and
  quotes remain provenance rather than navigation fallback.
- Contextual actions must resolve the visible local authoring target and must
  never fall back to a stale numeric caret from another file.
- A non-empty researcher selection must override broader assistant scope; a
  collapsed caret must use the operation's declared deterministic scope.
- Apply and accepted status persist atomically and preserve surrounding Yjs
  identities through a range-only splice.
- Provider errors and candidate rejection leave canonical Markdown unchanged.
- The companion must require one exact origin and a fixed credential-free
  loopback upstream, and it must fail closed on invalid shape, size, route,
  method, media type, redirect, timeout, or network response.
- Model discovery must derive `/models` from the configured completion route,
  return at most 256 bounded unique identifiers, and never broaden the allowed
  upstream origin.
- Structured revision JSON may contain only `replacement`; structured claim
  JSON may contain only `text` and `note`. A provider-created generic wrapper
  must never be inserted into manuscript prose.
- Claim drafts must use annotations only, contain one to twelve unique evidence
  snapshots, and retain the researcher-selected relation unchanged.
- Claim propositions are required and bounded to 2,000 characters; working
  notes are optional and bounded to 8,000 characters.
- Claim-draft acceptance must be atomic and must fail without changing candidate
  or claim state when any source annotation is stale or missing.
- Clarity diagnosis must ask exactly one question and produce no rewrite. The
  follow-up must contain the captured target, question, and bounded researcher
  answer and return only two to four typed rewrites.
- Ideation must return three to five typed ideas, each with a title, concrete
  direction, and complete bounded replacement. An unchosen idea is never
  persisted and a chosen draft never writes directly to canonical prose.
- Table generation must never trust model-authored Markdown. Returned caption,
  columns, rows, cell bounds, and dimensions are validated before deterministic
  serialization; insertion fails after any intervening manuscript revision.
- Reference-query output may contain only search terms and a rationale. Titles,
  authors, dates, venues, abstracts, URLs, and DOI identities must come from a
  validated external metadata response, and no result is saved automatically.

### Scenarios

**Scenario: Evidence grounds a selected revision**

- Given: synchronized prose and at least one current annotation or claim
- When: the researcher requests a revision and the local provider responds
- Then: Kirjolab stores a pending targeted candidate with the exact evidence
  basis and shows a focused review

**Scenario: Researcher applies a reviewed replacement**

- Given: a pending candidate still matches its source revision and target
- When: the researcher applies it
- Then: only the target passage is replaced and the candidate becomes accepted

**Scenario: Operation base changes while the model works**

- Given: a provider request is in flight
- When: the manuscript or selected claim version changes before persistence
- Then: candidate creation fails as stale and no candidate or source mutation is
  stored

**Scenario: Provider does not allow direct browser access**

- Given: the researcher explicitly starts the companion with a fixed local
  provider and exact Kirjolab origin
- When: the browser sends the typed operation to the companion endpoint
- Then: the companion validates and forwards only that bounded request and the
  normal candidate review/apply boundary remains unchanged

**Scenario: Annotations become a reviewed claim draft**

- Given: one or more current project annotations and a researcher-selected
  evidence relation
- When: the local provider returns one proposition and optional note
- Then: Kirjolab stores a pending claim-draft candidate with immutable evidence
  snapshots and creates no canonical claim

**Scenario: Researcher accepts a current claim draft**

- Given: a pending draft whose annotations still match their captured versions
- When: the researcher applies it
- Then: one normal claim and its evidence links are created atomically and the
  candidate becomes accepted

**Scenario: Claim evidence changes before acceptance**

- Given: a pending claim draft
- When: a selected annotation changes or disappears before apply
- Then: acceptance fails as stale and neither claim nor evidence link is created

**Scenario: Fuzzy language becomes a reviewable revision**

- Given: a visible sentence, paragraph, section, or explicit selection
- When: the researcher answers the drill's single clarification question and
  chooses one proposed wording
- Then: Kirjolab opens an ordinary targeted candidate with the original passage,
  chosen replacement, captured provenance, and no canonical source change

**Scenario: One direction advances from ideation**

- Given: a current manuscript section and an optional set of evidence resources
- When: the researcher generates directions and promotes one idea
- Then: the chosen complete draft opens as a targeted candidate while the other
  transient ideas and canonical manuscript remain unchanged

**Scenario: Structured table becomes portable syntax**

- Given: a visible insertion target and valid structured table requirements
- When: the local provider returns the same bounded table shape and the
  researcher approves the rendered GFM
- Then: Kirjolab inserts only the validated deterministic syntax if the captured
  manuscript base is still current

**Scenario: A claim yields verifiable reference candidates**

- Given: a visible manuscript claim and an available scholarly metadata provider
- When: the model formulates a query and the provider returns DOI-bearing records
- Then: Kirjolab labels the provider, links each DOI for verification, and saves
  nothing until the researcher explicitly imports a chosen record to Library
