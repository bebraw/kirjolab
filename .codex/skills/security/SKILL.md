---
name: security
description: Review or shape work involving trust boundaries, authentication, authorization, secrets, sensitive data, validation, or misuse resistance.
---

# Security

Identify the trust boundary, protected asset, attacker capability, and concrete failure path before recommending controls. Distinguish vulnerabilities from hardening opportunities and hygiene.

Prioritize credential exposure, missing authorization, injection, unsafe defaults, sensitive logging or storage, and local-development paths likely to be copied into clones. Prefer small mitigations that are easy to keep correct; do not introduce enterprise infrastructure without a demonstrated need and approval.

For each finding, state the conditions, impact, evidence, severity, and smallest effective mitigation. Route durable security behavior into the relevant spec, architecture rule, ADR, configuration, or quality gate.
