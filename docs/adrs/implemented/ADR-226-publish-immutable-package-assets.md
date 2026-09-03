# ADR-226: Hand Off Private Package Candidates as Immutable Release Assets

**Status:** Implemented

**Date:** 2026-08-19

## Context

ADR-223 permits a deterministic private paper-import tarball for the maintained
Slideotter adapter but did not define a durable binary handoff. The `0.1.1`
release record exposed why a checksum alone is insufficient: its documented
Node.js 24.15.0 and npm 11.12.1 provenance named a 52,048-byte build, while the
recorded 51,907-byte artifact and SHA-256 were actually produced by Node.js
26.7.0 and npm 11.19.0. Extracted contents happened to match, but downstream CI
could not reproduce or retrieve the claimed bytes safely.

The public pack script ran nested bare `npm` commands. npm's lifecycle recorded
the Node executable that launched it, but its child `PATH` could resolve a
different Node and npm pair. Actions artifacts are retention-bound, and a
mutable release asset or branch URL does not provide an immutable supply-chain
boundary.

## Decision

Keep an append-only JSON manifest for every paper-import candidate under
`packaging/paper-import/releases/`. Each manifest pins schema, package name and
version, tarball filename, byte count, exact Node.js and npm versions, and
SHA-256. Release manifests remain outside the packed file allowlist so recording
the digest cannot change the artifact it identifies. Historical manifests state
the toolchain that actually produced their bytes; corrections ship as a new
package patch rather than relabelling an existing artifact.

Make `npm run paper-import:pack` the only canonical pack command. It resolves
`npm_node_execpath` and `npm_execpath` from the launching npm lifecycle, executes
both build and pack through those explicit binaries, and fails before accepting
an artifact unless the toolchain matches the current release manifest. It then
compares npm's package identity, filename and size plus the emitted byte count
and SHA-256 with the checked manifest. The command never updates the manifest;
review and `apply_patch` remain the separate approval step for new bytes.

Provision the current release manifest's exact Node.js runtime into the GitHub
Actions tool cache before restoring the repository-pinned Node.js runtime as the
active `PATH`. Package verification locates the secondary runtime through
`RUNNER_TOOL_CACHE`; the rest of the quality gate continues to run on the
repository pin.

Enable GitHub immutable releases for this repository. Hand a reviewed private
candidate to the named consumer as an asset on a namespaced release tag such as
`paper-import-v0.1.2`. Create the release as a draft, attach the exact locally
verified tarball, and publish only after local and pull-request checks pass.
Publication locks the tag and asset and supplies GitHub's release attestation;
downstream CI downloads the versioned asset and independently checks the
manifest SHA-256. This narrow binary transport does not publish to the npm
registry, remove `private: true`, or promise public API stability.

## Consequences

**Positive:**

- Maintained consumers can download one stable reviewed byte sequence instead
  of rebuilding from an ambient toolchain or relying on an expiring artifact.
- The checked manifest makes package identity, exact build tools, size, and
  digest independently reviewable before external state is created.
- Immutable tags, assets, and release attestations prevent replacement after
  publication.

**Negative:**

- Any defect found after publication requires a new package version and
  release; an immutable candidate cannot be repaired in place.
- Maintainers must preserve the exact release Node.js and npm installations in
  addition to the repository's broader development npm-major policy.
- A manual GitHub release remains an external operation that must happen only
  after the repository candidate is final and verified.

**Neutral:**

- Source remains single-owned in Kirjolab and the candidate remains a private
  `0.x` package with no npm registry credentials or publication workflow.
- Normal development and CI may continue using supported npm 11 patch versions;
  only candidate artifact production is pinned to the manifest's exact pair.

## Alternatives Considered

### Commit tarballs to the repository

Rejected because binary release history would permanently inflate Git while a
release asset already supplies a digest, stable download URL, and attestation.

### Use GitHub Actions artifacts

Rejected because retention and deletion make them unsuitable as the permanent
location consumed by downstream CI.

### Publish the candidate to npm

Rejected because ADR-186's registry, credentials, provenance, and public
contract gates remain intentionally unmet. Immutable GitHub asset transport is
limited to the named maintained consumer.

### Let the pack command rewrite its expected manifest

Rejected because a wrong or compromised toolchain could bless its own output.
Manifest refresh and artifact verification must remain two separate reviewed
steps.
