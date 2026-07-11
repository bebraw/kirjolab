# Feature: Grounded Model Operations

## Blueprint

### Context

Kirjolab uses local-capable language models to propose inspectable scholarly
changes. The first complete operation revises one selected manuscript passage
using explicit annotations or claims while preserving a human review boundary.

### Architecture

- `revise-selection` captures one current exact passage, instruction, provider
  adapter/label, model name, and one to twelve typed, versioned evidence
  references before provider I/O.
- A provider-neutral browser contract isolates operation semantics from the
  initial OpenAI-compatible HTTP adapter.
- The initial adapter permits credential-free HTTP(S) loopback endpoints only,
  omits browser credentials, rejects redirects, aborts after 120 seconds, and
  reads at most 256 KiB of OpenAI-compatible JSON. The page CSP exposes the same
  IPv4, localhost, and IPv6 loopback boundary.
- Only the selected passage, instruction, and chosen evidence snapshots enter
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
- Each candidate can open one stable resource-keyed Context tab. Tab lifecycle
  and scroll remain local while the candidate and its provenance are shared
  authorized workspace state.
- Apply requires a pending, current, exact candidate and splices only the target
  range; reject never changes canonical source.
- The hosted Worker never attempts to reach a browser-local model endpoint.

### Anti-Patterns

- Do not send or persist a whole-document replacement for a passage operation.
- Do not accept untyped or unknown evidence ids.
- Do not reconstruct candidate evidence from mutable current resources alone.
- Do not apply stale, collapsed, or inexact targets.
- Do not let provider-specific response shapes enter the domain API.
- Do not add chat, RAG, embeddings, automatic citations, or direct model writes
  in this slice.

## Contract

### Definition of Done

- [x] A researcher can select prose, choose annotation/claim evidence, and add
      a bounded revision instruction.
- [x] The browser invokes a provider-neutral operation through the local
      OpenAI-compatible adapter.
- [x] A candidate persists a typed immutable base and targeted replacement.
- [x] Review shows original, replacement, and linked evidence without a raw
      whole-document proposal.
- [x] Apply changes only the verified selected range; reject changes no source.
- [x] Stale manuscript or evidence input creates or applies no candidate.
- [x] Unit, Workers-runtime, and browser tests cover the reviewed lifecycle.

### Regression Guardrails

- Provider requests must omit unrelated manuscript text and reject redirects
  outside the validated endpoint.
- Provider output, instructions, identifiers, and evidence sets remain bounded.
- Candidate provenance must be server-validated against known same-workspace
  resources and exact evidence versions.
- Candidate creation and application use conservative source-revision equality.
- Target identity resolves only through its Yjs-relative anchor; offsets and
  quotes remain provenance rather than navigation fallback.
- Apply and accepted status persist atomically and preserve surrounding Yjs
  identities through a range-only splice.
- Provider errors and candidate rejection leave canonical Markdown unchanged.

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
