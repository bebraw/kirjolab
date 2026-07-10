# Feature: Evidence-Backed Claims

## Blueprint

### Context

Annotations preserve what a source says; claims preserve what the researcher
concludes. Kirjolab must connect these resources without conflating them and
must show where a claim enters authored prose.

### Architecture

- `ClaimResource` has a stable UUID, proposition text, optional note, and
  timestamps.
- `ClaimEvidenceLink` connects an annotation to a claim with `supports`,
  `contradicts`, or `extends`.
- `ClaimPassageLink` connects a claim to an exact current Markdown range through
  `used-in`.
- `DocumentRoom` persists all three in its workspace-local SQLite database.
- Creating a claim requires one to twenty distinct annotation relationships.
- Replacing a claim updates its text, note, and complete evidence set in one
  storage operation without changing source annotations.
- Deleting a claim removes its links through foreign-key cascades and leaves
  annotations and manuscript source unchanged.
- Search and the knowledge projection expose claims and both directions of
  their typed provenance.
- The editorial rail provides keyboard-operable create, edit, delete, evidence,
  and manuscript-link actions within the existing visual system.

### API Contracts

- `POST /api/workspaces/{id}/claims` accepts `text`, `note`, and `evidence` and
  returns the created claim representation.
- `PUT /api/workspaces/{id}/claims/{claimId}` replaces the same mutable fields.
- `DELETE /api/workspaces/{id}/claims/{claimId}` returns an empty successful
  response after removing the claim.
- `POST /api/workspaces/{id}/claim-links` accepts `claimId`, source offsets, and
  the exact excerpt and returns a claim-passage link.
- All endpoints use the existing workspace authorization boundary.

### Anti-Patterns

- Do not store a claim as an annotation comment or a Markdown mutation.
- Do not store untyped evidence id arrays.
- Do not accept duplicate annotation relationships for one claim.
- Do not accept a manuscript link whose excerpt no longer matches source.
- Do not delete annotations or authored prose when deleting a claim.
- Do not let a model create canonical claims without candidate review.

## Contract

### Definition of Done

- [x] A researcher can create a claim from selected annotations and one evidence
      relationship type.
- [x] A researcher can edit the proposition, note, and evidence set.
- [x] A researcher can delete a claim without deleting its annotations.
- [x] A claim can link to an exact selected manuscript passage.
- [x] Search returns claims by proposition, note, and connected annotation text.
- [x] Connections expose `supports`, `contradicts`, `extends`, and claim
      `used-in` edges as navigable resource actions.
- [x] Guards reject missing, duplicate, excessive, or malformed evidence.
- [x] Durable Object tests prove atomic replacement and cascade behavior.
- [x] Browser coverage proves the annotation-to-claim-to-prose workflow.

### Regression Guardrails

- Claim proposition text is required and bounded to 2,000 characters.
- Claim notes are optional and bounded to 8,000 characters.
- Evidence sets contain one to twenty distinct known annotations.
- Evidence relations remain within the versioned initial vocabulary.
- Claim-passage offsets must match current materialized Markdown exactly.
- Snapshot and client guards validate claims and their links before rendering.
- Claim mutations cannot modify annotation, PDF, or Markdown records as a side
  effect.

### Scenarios

**Scenario: Evidence becomes a claim**

- Given: one or more PDF annotations are selected
- When: the researcher writes a proposition and chooses `supports`
- Then: Kirjolab creates a stable claim and typed evidence links without
  changing the annotations

**Scenario: Claim evidence is revised**

- Given: a claim has existing evidence
- When: the researcher replaces its text, note, or evidence selection
- Then: the complete claim representation changes atomically and no source
  annotation changes

**Scenario: Claim enters authored prose**

- Given: a claim and a current manuscript selection
- When: the researcher links the two
- Then: a `used-in` relationship records the exact range and both resources
  remain navigable

**Scenario: Claim is removed**

- Given: a claim has evidence and manuscript links
- When: the researcher deletes the claim
- Then: only the claim and its links disappear
