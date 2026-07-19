# ADR-153: Keep Build Week Media Capture Local

**Status:** Implemented

**Date:** 2026-07-19

## Context

ADR-070 removed the drifting README screenshot and kept screenshot tooling out
of the template baseline. The Build Week submission has a different, concrete
production need: fifteen current application images with ordered captions,
fixed dimensions, synthetic data, and a strict upload-size limit.

The first refreshed set was captured through an ignored one-off script. That
proved the workflow but left its selectors, data seeding, caption manifest,
share-link cleanup, and validation unavailable to the next refresh. Committing
the generated images would make review history unnecessarily large, while
putting capture into CI would restore the recurring cost rejected by the earlier
README decisions.

## Decision

We will keep one project-specific, manual Build Week media command:
`npm run media:build-week`.

The command will:

- reuse the pinned Playwright dependency and connect only to a loopback Chrome
  DevTools endpoint, defaulting to `http://127.0.0.1:9222`
- create and close its own isolated browser context without inspecting or
  closing pre-existing tabs or the debug Chrome process
- start the existing temporary-persistence end-to-end Worker, refuse to reuse
  an occupied capture port, seed only synthetic project and review data, revoke
  temporary bearer links, and stop the Worker after capture
- keep one ordered manifest as the authority for filenames and captions
- generate a self-contained synthetic PDF instead of depending on ignored
  fixture files
- capture into temporary staging, validate the complete set, and replace the
  ignored upload directory only after validation succeeds
- validate exact filenames, caption lengths, PNG dimensions, RGB color data,
  profile metadata, unique content, and the five-megabyte upload limit
- leave reusable output only in `.generated/build-week-media/`

The command remains outside local CI, remote CI, routine development, README
media, and the reusable template baseline. Its pure tooling tests still run
through the existing tooling-test gate. ADR-070 continues to govern the absence
of a committed README screenshot; this ADR supersedes only its broader ban on
all repository screenshot helpers.

## Trigger

The user explicitly asked to preserve and commit the scripts used to produce
the refreshed Build Week submission media.

## Consequences

**Positive:**

- Future UI changes can produce the same ordered media story without rebuilding
  the workflow from terminal history.
- Synthetic isolation, link revocation, staged replacement, and validation are
  enforced by the command instead of remembered manually.
- Captions and capture order have one committed source of truth.

**Negative:**

- The repository carries a sizeable contest-specific browser script.
- Capture still requires a separately launched local debug Chrome instance and
  takes longer than routine checks.
- UI selector changes can require maintenance even though the application
  behavior remains correct.

**Neutral:**

- Generated media and captions remain ignored local production artifacts.
- The decision adds no dependency, CI job, committed screenshot, or template
  update pack.

## Alternatives Considered

### Keep the workflow only under `.generated/`

This was rejected because ignored scripts disappear across clean clones and do
not provide a reliable future refresh path.

### Commit the generated PNG files

This was rejected because the submission assets are replaceable production
output and would add large binary churn to source history.

### Capture media in CI

This was rejected because a GUI CDP session is intentionally manual, and
recurring screenshot automation would reintroduce the cost and churn rejected
by the README screenshot decisions.

### Generalize the workflow into the template baseline

This was rejected because the shot sequence and synthetic data describe
Kirjolab's Build Week submission rather than a reusable starter capability.
