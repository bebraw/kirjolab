# Feature: Agent Skill Baseline

## Blueprint

### Context

Kirjolab should retain agent workflows that directly support its architecture
without vendoring large platform-documentation snapshots already available from
connected tools.

### Architecture

- **Codex skill root:** `.codex/skills/`
- **Mirrored skill root:** `.github/skills/`
- **Cloudflare knowledge and account layer:** connected Cloudflare MCP
- **Worker implementation skill:** `workers-best-practices`
- **Cloudflare CLI skill:** `wrangler`
- **Durable Object skill:** `durable-objects`
- **Other specialized Cloudflare skills:** added with the capability that needs
  them

### Anti-Patterns

- Do not vendor broad Cloudflare documentation snapshots when the connected MCP
  supplies current retrieval.
- Do not treat the MCP as a replacement for local Worker, Wrangler, or Durable
  Object implementation workflows.
- Do not retain product-specific skills for capabilities Kirjolab does not use.
- Do not let the `.codex/skills/` and `.github/skills/` baseline diverge.

## Contract

### Definition of Done

- [ ] Both skill roots include `workers-best-practices`, `wrangler`, and
      `durable-objects`.
- [ ] Broad and unused Cloudflare skill bundles are absent from both roots.
- [ ] Agent guidance routes current Cloudflare documentation, API discovery,
      and account operations through the connected MCP.
- [ ] Product-specific skills are introduced only with the capability that
      needs them.

### Regression Guardrails

- The baseline must not reintroduce `cloudflare`, `agents-sdk`, or
  `cloudflare-email-service` without an explicit architecture change.
- The three retained skill copies must remain available while Kirjolab uses
  Cloudflare Workers and Durable Objects.
- Removing a skill must not implicitly remove or change runtime behavior.

### Verification

- **Codex skills:** `test -f .codex/skills/workers-best-practices/SKILL.md &&
test -f .codex/skills/wrangler/SKILL.md && test -f
.codex/skills/durable-objects/SKILL.md`
- **Mirrored skills:** `test -f
.github/skills/workers-best-practices/SKILL.md && test -f
.github/skills/wrangler/SKILL.md && test -f
.github/skills/durable-objects/SKILL.md`
- **Pruned bundles:** confirm `cloudflare`, `agents-sdk`, and
  `cloudflare-email-service` are absent from both roots
- **Documentation check:** `npm run format:check`

### Scenarios

**Scenario: Agent needs current Cloudflare product information**

- Given: the Cloudflare MCP is connected
- When: an agent needs current documentation or API details
- Then: the agent retrieves them through the MCP instead of relying on a
  vendored platform snapshot

**Scenario: Agent changes a Durable Object**

- Given: Durable Objects are a core Kirjolab persistence boundary
- When: an agent authors or reviews Durable Object code
- Then: the agent uses the retained `durable-objects` skill alongside current
  MCP documentation

**Scenario: Kirjolab adopts another Cloudflare product**

- Given: a new capability needs specialized implementation guidance
- When: that capability is approved
- Then: Kirjolab adds only the relevant skill instead of restoring the complete
  Cloudflare bundle
