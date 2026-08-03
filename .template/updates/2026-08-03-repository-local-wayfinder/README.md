# Add Repository-Local Wayfinding

Use this update when a downstream project needs to preserve discovery for a large, uncertain initiative across agent sessions without adopting an issue tracker or a broader planning suite.

## Apply

1. Inspect the target project's existing planning skills and durable documentation conventions.
2. Add `.codex/skills/wayfinder/`, retaining its MIT license, source revision, explicit-invocation policy, and UI metadata where supported.
3. Register Wayfinder in the target repo's agent guidance as an explicit workflow for efforts that are both multi-session and too unclear to specify responsibly.
4. Document `docs/wayfinding/<effort>.md` as an optional working-context path.
5. Adapt the promotion rules so lasting decisions point to the target project's architecture records and feature contracts.
6. Keep temporary research and prototypes outside the repository unless the user approves another lasting artifact.
7. Run the target repo's skill validation and normal quality checks.

## Fallback

If the patch does not apply because the target repo uses different skill or documentation paths, copy the Wayfinder directory manually and translate only these integration points:

- project-local skill root;
- architecture, decision-record, and feature-spec paths;
- agent-guidance registration; and
- the repository-local wayfinding map path.

Do not add GitHub Issues, labels, tracker setup, or companion skills as part of this update. If the target already has a durable discovery format, adapt Wayfinder to that format rather than adding `docs/wayfinding/` alongside it.

## Verify

- Confirm the skill is not invoked implicitly.
- Confirm the skill creates no external tracker state.
- Confirm one map is the default artifact for each effort.
- Confirm lasting architecture and feature decisions graduate into the target repo's durable documents.
- Confirm the upstream revision and MIT license remain recorded.
- Run the skill validator and the target repo's normal quality gate.
