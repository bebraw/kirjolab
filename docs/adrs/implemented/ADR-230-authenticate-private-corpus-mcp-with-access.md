# ADR-230: Authenticate Private Corpus MCP with Access

**Status:** Implemented

**Date:** 2026-08-24

## Context

ADR-228 put the hosted Research Corpus behind Cloudflare Access but deferred an
MCP-compatible authorization flow. A browser Access session is insufficient for
standard remote MCP clients, while Access service tokens do not carry the user
email identity from which Kirjolab derives an owner-scoped Library key. Merely
protecting `/mcp` with a self-hosted Access application therefore leaves client
connection and owner selection operationally ambiguous.

Cloudflare Access Managed OAuth can expose the standard authorization metadata
and authorization-code flow expected by compatible non-browser clients. Access
continues to enforce the existing application policy and presents the origin
with the same signed user assertion after authorization.

## Decision

Enable Managed OAuth on the corpus's private Access application. MCP clients
connect to the protected `/mcp` URL, complete Access's user authorization flow,
and rely on Access to place the resulting signed user assertion in
`Cf-Access-Jwt-Assertion` for the Worker.

Keep origin authentication unchanged: verify the Access issuer, corpus
application audience, signature, lifetime, non-empty subject, and user email
before deriving the email-scoped owner key. Configure the Access application
with user-based Allow policies. Do not authorize Access service tokens because
the service has no approved mapping from a machine identity to a user's corpus.

Restrict dynamic-client redirect URIs to the approved clients. Enable localhost
or loopback redirects only when a selected desktop or CLI client requires them.
Use a short OAuth access-token lifetime with a longer Access grant session so
refresh re-evaluates policy without requiring a long-lived bearer credential.

Allow `cloudflared access login` and a session-scoped `Cf-Access-Token` header as
a fallback for user-operated clients that support custom headers but not
Managed OAuth. This fallback remains a user identity and must not be persisted
in repository configuration.

This decision partially supersedes ADR-228's deferral only for the current
private Access deployment. A corpus-owned public authorization server,
multi-tenant authorization, and service identity-to-owner mapping remain
deferred.

## Trigger

Review found that the hosted MCP endpoint had no documented client flow and
that the existing Access assertion parser correctly rejected service-token
claims without a user email.

## Consequences

**Positive:**

- Compatible remote MCP clients can use a standard browser-mediated user flow.
- Browser and MCP requests retain one signed user identity and owner mapping.
- Access policies, token lifetime, and revocation remain the hosted control
  plane.

**Negative:**

- Managed OAuth is Cloudflare-specific deployment configuration.
- Clients must support RFC 8707 or custom Access headers through the documented
  `cloudflared` fallback.
- Machine-to-machine corpus access remains unsupported.

**Neutral:**

- The Worker remains an OAuth-protected resource, not an authorization server.
- Local loopback authentication remains unchanged for development.

## Alternatives Considered

### Accept Access service tokens as corpus owners

A service token has no approved relationship to a user's private Library.
Inventing one from token claims risks selecting the wrong owner and makes
revocation and delegation semantics implicit.

### Build a corpus-owned OAuth authorization server

This adds grants, consent, client registration, refresh, revocation, and
multi-tenant policy before a public deployment is approved. Access already
provides the required private user flow.

### Require every MCP client to shell out to `cloudflared`

This works for controlled clients but is not the standard remote MCP flow and
adds token plumbing. It remains a fallback rather than the primary contract.
