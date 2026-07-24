# ADR-168: Instantiate From Existing Projects

**Status:** Implemented

**Date:** 2026-07-24

## Context

Kirjolab already lets an owner promote a project into a persistent personal
template and later use that template to create projects. This is useful for a
maintained reusable starting point, but it adds an unnecessary naming and
lifecycle step when a researcher wants a one-off copy of an existing project's
current authored structure.

Complete project duplication is not an appropriate substitute. It preserves
research relationships, binary assets, collaboration state, and revision-facing
identity, while project-template creation must retain the privacy boundary
established by ADR-112.

## Decision

The New project flow will list active projects available to the researcher as
starting points alongside built-in and personal templates. Selecting an
existing project lazily derives the same bounded, content-free preview used by
stored templates.

Creation from an existing project will read its current authorized snapshot,
project it through `ProjectTemplateSeed`, and immediately instantiate an
independent project from that sanitized seed. The transient seed is not stored
in the personal-template catalog and no live relationship is retained.

The creation contract accepts either `templateId` or `sourceWorkspaceId`, never
both. Source access is checked again when the project is created so a stale
browser catalog cannot bypass current authorization.

## Trigger

Researchers want to reuse an existing project's structure directly while
creating a project, without first promoting and maintaining a personal
template.

## Consequences

**Positive:**

- One-off structural reuse takes one selection in the existing New project
  browser.
- Direct reuse retains ADR-112's exclusion of private research, binaries,
  collaboration, and history.
- Persistent personal templates remain available for intentionally maintained
  starting points.

**Negative:**

- Preview and creation read the source project separately, so the source may
  change between those operations.
- Existing-project previews require a lazy authorized project request instead
  of arriving with the template catalog.

**Neutral:**

- The resulting project is equivalent to template instantiation and has an
  independent revision-zero history.
- Archived projects are omitted from the browser but remain unaffected.

## Alternatives Considered

### Automatically save every project as a personal template

Rejected because it would duplicate every project into a second durable
catalog, consume the bounded personal-template allowance, and create unclear
template lifecycle expectations.

### Use complete project duplication

Rejected because duplication intentionally retains state that the sanitized
template boundary excludes.

### Require explicit promotion first

This remains useful for maintained templates, but it was rejected as the only
workflow because one-off reuse should not create a persistent template record.
