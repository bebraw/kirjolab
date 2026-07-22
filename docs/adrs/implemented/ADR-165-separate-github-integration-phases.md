# ADR-165: Separate GitHub Integration Phases

**Status:** Implemented

**Date:** 2026-07-22

**Amends:** [ADR-132](./ADR-132-synchronize-projects-with-github.md)

## Context

ADR-132 defines three explicit GitHub workflows: importing a new workspace,
pulling remote changes into an existing workspace, and publishing local changes.
The first implementation placed import routing, workspace synchronization,
transport contracts, authorization adapters, error projection, and snapshot
materialization in one API module. That module accumulated three unrelated
dependents and duplicated repository-identity checks across pull and publish.

Import has a catalog/workspace-creation lifecycle, while Pull and Publish act on
an existing Document Room binding. They share GitHub transport and safe error
contracts, but neither workflow should depend on the other's orchestration.

## Decision

Keep the GitHub server integration in three source boundaries:

- `github-import.ts` owns import preview and confirmed workspace creation;
- `github-sync.ts` owns Pull, Publish, connection-state, and disconnect routing
  for an existing workspace;
- `github-sync-contracts.ts` owns the remote-client and authorizer interfaces,
  GitHub client construction, operation-id validation, and safe error mapping.

Callers import the narrow capability they invoke. The shared contract module
must not own workspace or Document Room orchestration. Pull and Publish reuse one
authorized repository-snapshot check so immutable repository identity is
validated consistently.

## Consequences

**Positive:**

- Import changes no longer make ongoing workspace synchronization appear
  coupled, and vice versa.
- Tests can replace one shared remote-client contract across both workflows.
- Repository identity and error projection have one implementation.
- Each orchestration function stays small enough to review independently.

**Negative:**

- The GitHub API implementation spans three modules instead of one.
- Shared contracts must remain behavior-free or they can become another broad
  integration facade.

**Neutral:**

- Routes, authorization, preview semantics, and Durable Object authorities are
  unchanged from ADR-132.

## Alternatives Considered

### Keep one API module and extract only local functions

This lowers individual function complexity but retains file-level coupling:
import callers still depend on workspace synchronization declarations and every
change presents one large review surface.

### Give import and synchronization separate GitHub clients

This makes the workflows independent at the cost of duplicating authorization,
error safety, operation identities, and test doubles. Those are genuine shared
boundary contracts rather than workflow behavior.
