# ADR-089: Require a Fail-Closed Production Release

**Status:** Implemented

**Date:** 2026-07-13

## Context

Kirjolab already implements Cloudflare Access verification and owner/member
authorization, but its committed Wrangler variables select loopback-local
authentication. A generic `wrangler deploy` can therefore upload a Worker that
is safely unusable rather than demonstrably ready, and the repository has no
single production preflight, smoke, version, or rollback workflow.

The first hosted deployment will contain private manuscripts and research
sources. Secure runtime code is insufficient if deployment configuration can
silently omit the protected hostname or matching Access claims.

## Decision

Production deployment will run through a repository-owned preflight command.
It will require an HTTPS custom hostname, an exact Cloudflare Access team
domain, an application audience, and `AUTH_MODE=access`; reject loopback,
`workers.dev`, blank, and placeholder values; and complete a strict Wrangler
dry run before upload.

Local development will remain an explicit loopback-only command and may keep
the local Wrangler defaults. The production command will supply all hosted
variables together so a deploy cannot retain a mixed local/hosted identity
configuration.

The release runbook will require authenticated owner smoke checks,
unauthenticated denial, storage reads, log inspection, deployed-version
inspection, and a known rollback command. Dashboard evidence must confirm the
custom hostname is protected by the Access application.

## Trigger

The application is being prepared for its first production use on Cloudflare.

## Consequences

**Positive:**

- A normal production command fails before upload when identity or hostname
  configuration is unsafe.
- Local development remains credential-free and loopback-only.
- Deployment, smoke, and rollback evidence become repeatable release work.

**Negative:**

- The operator must create the Access application, custom hostname, and R2
  bucket before the first deploy.
- Dashboard configuration cannot be completely proven by a local dry run and
  remains an explicit manual launch check.

**Neutral:**

- The Access team domain and audience are configuration rather than application
  secrets, but they remain deployment inputs instead of source defaults.

## Alternatives Considered

### Change the shared Wrangler defaults to Access

This would make local development require a separate file and still would not
prove that a custom hostname or matching Access application exists.

### Trust the Access edge policy without Worker validation

This would make an accidentally exposed Worker origin vulnerable to spoofed
identity. Kirjolab retains its independent JWT verification.

### Build application-owned login before launch

Passwords or magic links would add credential, session, email, and recovery
surface without improving tomorrow's private Access-protected deployment.
