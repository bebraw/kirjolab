# ADR-255: Package the Gateway Model Companion

**Status:** Implemented

**Date:** 2026-11-18

**Amends:** [ADR-117](./ADR-117-scope-dotenv-loading-to-the-model-companion.md)
and [ADR-234](./ADR-234-run-codex-through-the-local-companion.md)

## Context

Researchers want to use models on institutional gateways reachable from their
workstations. Aalto's gateway requires its network or VPN and restricts browser
origins. A local process can access it over the VPN. The checkout companion
already provides a bounded browser-facing interface but requires a repository
checkout and can forward only to a loopback model service.

## Decision

Package the existing OpenAI-compatible forwarding backend as the
`kirjolab-model-companion` npm executable. The package uses Node and accepts an
explicit dotenv file. The checkout launcher also loads the Codex SDK when
configured for Codex.

Keep credential-free forwarding on loopback. A configured upstream API key
enables forwarding to one HTTPS completion URL with one named model. Require
the exact Kirjolab browser origin and an independent browser bearer token for
discovery and completion. Send the upstream key only to the configured gateway.
Publish the configured model on the companion's model-list route and accept it
on completion requests. The browser stores the pairing token in session storage.
The hosted Worker continues to serve the application while model requests use
the researcher's network connection.

## Consequences

Colleagues can run the companion through npm without installing the full
development toolchain. The same workflow supports existing local model
servers. Gateway users keep a local config, need gateway network access, and
enter the companion token in each browser session. Maintainers distribute a
separate npm artifact.

## Alternatives Considered

- A browser-direct gateway connection requires the institution to allow the
  deployed app's origin and each user's browser to reach the gateway.
- A shared relay requires an operator and hosting with institutional network
  access.
- A browser extension requires browser-specific packaging and distribution.
