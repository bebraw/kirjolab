# ADR-120: Use Portable Writing Workflow Files

## Status

Implemented

## Context

Research diaries and similar author-managed writing workflows need durable,
collaborative state. Browser-local state would not travel with an export, while
new service-private tables would duplicate the existing project-file system.

## Decision

Represent author-managed writing workflows as conventional, uniquely named
Markdown project files. Guide surfaces may create, open, and derive bounded
summaries from these files, but the Markdown remains canonical.

## Consequences

- Workflow material remains portable, editable, collaborative, and versioned.
- Each workflow needs an explicit filename and a tolerant Markdown convention.
- Derived guide summaries cannot become the only representation of workflow state.

## Alternatives Considered

- Browser-local workflow state was rejected because it is neither collaborative nor portable.
- Dedicated database resources were rejected because they add a second authoring model for prose-like material.
