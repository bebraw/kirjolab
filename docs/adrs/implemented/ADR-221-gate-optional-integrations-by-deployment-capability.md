# ADR-221: Gate Optional Integrations by Deployment Capability

**Status:** Implemented

**Date:** 2026-08-04

## Context

Kirjolab's hosted deployment can configure a GitHub App, while the Docker
Compose evaluation profile deliberately starts without GitHub credentials.
Rendering the same interactive integration controls in both deployments would
misrepresent unavailable behavior and let browser startup, focus refresh, or a
user action issue requests that can only fail after reaching the server.

The browser cannot determine integration availability safely from public
identifiers alone. GitHub requires a complete set of public identifiers,
private credentials, and an encryption key, and none of those values should be
projected into HTML merely to decide whether a control is usable. Conversely,
hiding a control is not an authorization or API boundary: clients can still
construct requests directly.

An integration may also become temporarily unavailable while retained project
bindings and encrypted connection state still exist. Configuration changes
must not silently turn capability detection into a destructive data lifecycle.

## Decision

Derive an immutable, typed deployment-capability object at the server
composition boundary from complete, validated server configuration. An
optional integration is available only when every required configuration value
is present and structurally valid. The first capability is GitHub.

Project only boolean availability values from that object into
server-rendered HTML bootstrap data. Do not expose configuration values,
missing-field details, credentials, or provider clients to the browser. Keep
the capability contract closed and typed rather than using an arbitrary feature
flag map.

When a capability is unavailable, server-rendered markup and browser
composition must leave its controls absent or inert. Browser owners must not
attach integration workflows, subscribe to their refresh triggers, or issue
requests to their endpoints. This is a presentation and request-generation
rule, not a security boundary.

Every optional-integration API independently enforces the same server-derived
capability before provider access or integration business logic and returns an
explicit `503` unavailable response when disabled. Authorization and ordinary
request validation continue to apply when the capability is available.

Capability disablement is non-destructive. Retained bindings, encrypted
connection state, synchronization bases, and project content remain untouched
and may be used again after valid configuration is restored. The Docker Compose
profile leaves GitHub configuration incomplete by default, so its GitHub
capability is false.

## Trigger

The account-free Compose profile made GitHub's deployment dependency visible:
the application could boot without GitHub configuration, but its HTML and
browser owners still assumed that the integration existed. Supporting that
profile required one explicit availability contract across server rendering,
browser composition, and direct API calls.

## Consequences

**Positive:**

- Deployments advertise only integrations they can actually serve.
- Disabled browser surfaces produce no predictable failing requests or
  background provider traffic.
- API behavior remains correct for non-browser clients because availability is
  enforced server-side.
- Temporary configuration loss does not destroy integration or project data.
- Future optional integrations can reuse one narrow boolean capability pattern
  without exposing their configuration schemas to the browser.

**Negative:**

- Each optional integration needs capability plumbing through server
  composition, bootstrap validation, markup, browser startup, and API routing.
- Availability is checked in both presentation and API layers because those
  layers protect different contracts.
- A deployment with partial configuration exposes the integration as
  unavailable until the complete configuration is corrected.

**Neutral:**

- ADR-132 continues to define GitHub synchronization once the integration is
  available; this decision governs whether that feature is installed in a
  deployment.
- ADR-220 continues to define the Compose evaluation boundary; this decision
  makes one omitted integration explicit inside that boundary.
- Capability booleans describe deployment availability, not per-user
  authorization, rollout percentages, or persisted feature state.

## Alternatives Considered

### Always render controls and rely on API errors

This would keep browser composition uniform, but it presents actions that the
deployment cannot perform and permits startup and focus-driven requests to fail
repeatedly. API errors remain necessary for direct callers, but they are not a
substitute for truthful presentation.

### Let the browser infer availability from configuration

Public identifiers do not prove that required private credentials and
encryption are configured. Projecting complete configuration would expose
secrets and couple the browser to provider-specific deployment details.

### Discover availability through an integration API request

This creates a failing or provider-shaped request merely to decide whether the
browser should expose the integration. A boolean already known during server
composition is smaller, deterministic, and available before client startup.

### Delete retained integration state when configuration disappears

Absence may be temporary during a restart, secret rotation, or deployment
change. Coupling configuration detection to deletion would make an operational
mistake irreversibly mutate user data.
