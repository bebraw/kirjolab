# ADR-234: Run Codex Through the Local Companion

**Status:** Implemented

**Date:** 2026-09-04

**Amends:** [ADR-039](../implemented/ADR-039-require-reviewable-model-operations.md),
[ADR-115](../implemented/ADR-115-discover-and-constrain-local-models.md),
[ADR-117](../implemented/ADR-117-scope-dotenv-loading-to-the-model-companion.md)

## Context

Kirjolab's Writing assistant already sends bounded OpenAI-compatible requests
from the browser to either a credential-free loopback provider or an explicitly
started local companion. The companion fixes the upstream, validates request
and response bounds, and keeps model traffic outside the hosted Worker. Model
results remain typed candidates that require separate review and application.

Codex can use a person's existing ChatGPT subscription or an OpenAI API key
through Codex-owned local authentication. Its TypeScript SDK controls a local
Codex process and supports structured output, but it is a server-side Node
capability rather than a Cloudflare Worker or browser library. Reusing the
researcher's normal Codex home would also inherit personal instructions,
skills, plugins, MCP servers, hooks, rules, and credential-store behavior that
do not belong in a bounded scholarly-generation adapter.

SlideOtter demonstrated a loopback OpenAI-compatible Codex gateway with a
dedicated file-authenticated home, an empty request directory, disabled tools,
and a fixed model. Kirjolab can retain those isolation controls without adding
a second local HTTP hop because it already owns the browser-facing companion.

## Decision

Extend the existing local companion with an explicit `codex` backend alongside
its existing `openai-compatible` forwarding backend. Exactly one backend is
selected at process startup. The browser continues to use `/v1/models` and
non-streaming `/v1/chat/completions`; the hosted Worker never receives model
prompts or Codex credentials.

The Codex backend will:

- use the pinned `@openai/codex-sdk` from the server-side companion only;
- require one allowlisted model and a separately authenticated, regular
  file-backed Codex home;
- reject normal user/repository Codex configuration, custom skills, plugins,
  MCP configuration, hooks, and rules from that home;
- force `HOME`, `USERPROFILE`, and `CODEX_HOME` to the dedicated directory and
  pass the child only an explicit environment allowlist;
- create a fresh SDK thread in a private empty temporary directory per request,
  with read-only sandboxing, approvals disabled, history persistence disabled,
  and executable, network, browser, plugin, MCP, and multi-agent features off;
- map Kirjolab messages and JSON Schema to a bounded prompt and SDK output
  schema, then return the existing OpenAI-compatible response envelope;
- map `none` reasoning to Codex `minimal`, preserve `low`, `medium`, and `high`,
  and use `medium` when the browser requests provider-default behavior;
- enforce one active generation, the existing request/response limits, a
  deterministic final-response byte limit, and abort/cleanup on timeout or
  shutdown; and
- expose only the configured model through `/v1/models`.

Because this backend consumes authenticated remote model allowance, require a
high-entropy companion bearer token for every Codex model-list and completion
request in addition to the existing exact browser-origin boundary. The token
is configured only in the companion environment, entered explicitly in the
browser, retained only in tab-scoped session storage, sent as an Authorization
header, and never persisted into a workspace, localStorage, logs, or Worker
configuration. Browser preflight remains origin-gated and credential-free.

Present the connection as **Codex via local companion**. Do not describe Codex
as a local model: the process and authentication are local, while selected
passages, instructions, and evidence are sent to OpenAI under the active Codex
account's policy and usage limits.

## Trigger

The user asked whether SlideOtter's newly implemented Codex gateway would fit
Kirjolab, accepted the companion-integrated direction, and requested a branch,
ADR, implementation, and review pull request.

## Consequences

**Positive:**

- Researchers can use Codex-authenticated models without placing an OpenAI API
  key in Kirjolab or routing research text through the hosted Worker.
- Existing typed prompts, schemas, candidate provenance, and review-before-apply
  behavior remain the model-operation authority.
- One companion process owns browser authorization, lifecycle, and Codex
  execution instead of chaining two loopback proxies.
- A dedicated synthetic home and request directory keep ordinary agent context
  away from scholarly generation.

**Negative:**

- The Codex SDK adds a platform-native CLI dependency to normal installs.
- Codex setup requires a separate login, model choice, bearer token, and local
  companion configuration.
- Tab-scoped token storage requires re-entry in a new browser tab or session.
- Codex can take longer than small local models and consumes account-scoped
  usage; configured models can still be unavailable to a particular account.

**Neutral:**

- The original credential-free OpenAI-compatible provider path remains the
  default and does not gain bearer-token requirements.
- Fresh SDK threads suppress prompt history but may still leave Codex-owned
  runtime metadata in the dedicated home.
- Codex system or machine-administrator configuration outside the dedicated
  home remains a trusted residual input rather than a claimed isolation layer.

## Alternatives Considered

### Chain Kirjolab's Companion to a Separate Codex Gateway

This would reuse SlideOtter's HTTP adapter more literally, but it requires two
local servers, two lifecycle boundaries, bearer injection between them, and
translation of Kirjolab's temperature and reasoning fields. The existing
companion is already the correct browser-facing process boundary.

### Run Codex in the Hosted Worker

Rejected because the SDK controls a local process and Codex-owned local
authentication. Workers cannot launch that process or access the researcher's
local credential state.

### Reuse the Researcher's Normal Codex Home

Rejected because personal instructions, skills, plugins, MCP servers, hooks,
rules, keyring behavior, and history would silently change a narrowly scoped
writing operation and broaden credential exposure.

### Use the OpenAI API Directly From Kirjolab

This remains a possible separate hosted-provider decision, but it requires API
credentials and different billing and policy semantics. It does not satisfy
the requested Codex-login integration.
