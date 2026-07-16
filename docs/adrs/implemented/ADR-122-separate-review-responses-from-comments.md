# ADR-122: Separate Review Responses from Comments

## Status

Implemented

## Context

Collaborator comments follow live manuscript ranges and resolve through project
discussion. External reviewer feedback instead arrives as a submission artifact
and requires a formal response even when no exact passage changes.

## Decision

Keep external review work in a conventional `reviewer-response.md` project file.
Do not translate it into collaborative comment resources. Generate response
letters as disposable exports from the Markdown matrix.

## Consequences

- Review work remains portable and can outlive a particular submission system.
- Reviewer-item status is explicit author state rather than inferred from edits.
- The response matrix and collaborator comments have intentionally separate lifecycles.

## Alternatives Considered

- Reusing manuscript comments was rejected because their range and resolution semantics do not fit external reviews.
- Dedicated submission tables were rejected because they would make the response record service-dependent.
