# ADR-171: Delegate GitHub App Signing

**Status:** Implemented

**Date:** 2026-07-25

**Amends:** ADR-132, ADR-165

## Context

Kirjolab authenticated its GitHub App by parsing PEM keys, wrapping PKCS#1
material as PKCS#8, encoding DER values, constructing JWT claims, and signing
RS256 tokens with Web Crypto. This security-sensitive implementation and its
format-specific tests were project-owned even though GitHub App authentication
is a standard protocol.

The broader GitHub client still enforces Kirjolab-specific response-size
bounds, repository and path constraints, injected request transport, stable
error projection, and installation-token caching. Replacing that complete
boundary with a general SDK would trade explicit safeguards for a larger
abstraction.

## Decision

Use pinned `@octokit/auth-app` only to create GitHub App JWTs and handle
supported private-key formats.

Keep the installation access-token exchange in Kirjolab's bounded,
request-scoped transport. Do not use the package's installation authentication
flow in Cloudflare Workers because its module-level pending-request
coordination could retain request-bound I/O across Worker requests.

Keep repository operations, response reading, error projection, authorization,
resource bounds, path normalization, and domain types in Kirjolab. Adoption of
one Octokit authentication primitive does not make Octokit the repository
domain client.

## Consequences

**Positive:**

- Project-owned JWT construction, ASN.1/DER encoding, and PEM conversion are
  removed from production code.
- PKCS#1 and PKCS#8 key handling follows the maintained GitHub authentication
  implementation.
- Kirjolab retains the transport and domain checks that make GitHub operations
  safe in a Worker.

**Negative:**

- A small authentication responsibility brings several transitive packages
  into the production dependency graph.
- GitHub authentication behavior now depends on the pinned package version and
  must be reviewed deliberately during upgrades.
- The integration cannot use the package's complete installation-token
  convenience path without first resolving its Worker request-isolation
  behavior.

**Neutral:**

- Installation token lifetime and cache ownership are unchanged.
- The GitHub API surface and user-visible synchronization workflow are
  unchanged.

## Alternatives Considered

### Keep the custom signer

This minimizes dependencies but leaves uncommon key parsing, binary encoding,
and cryptographic protocol details as Kirjolab maintenance.

### Use Octokit's complete installation authentication flow

This removes more request code, but its module-level concurrency map is a poor
fit for Cloudflare's rule that request-bound promises must not cross request
contexts. Kirjolab also needs its existing bounded response reader and error
projection.

### Replace the GitHub integration with an Octokit client

This could reduce some endpoint assembly but would require rebuilding explicit
size limits, domain mappings, transport injection, and typed failure behavior
around a much broader SDK surface.
