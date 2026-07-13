# ADR-084: Separate Source Capture from Refinement

**Status:** Implemented

**Date:** 2026-07-13

## Context

The Library's primary intake goal is to let a researcher collect a PDF or web
link immediately and refine it later. PDF intake already follows that model,
but website intake exposes optional title, author, publisher, and publication
date overrides before capture. Those fields duplicate the metadata editor on
the resulting Library record and make a simple collection action look like a
bibliographic form.

Removing the fields without changing capture behavior would make sparse or
failed pages impossible to collect because the API previously required the
researcher to supply a title. It would also leave a URL-derived citation ID
permanent even when later refinement supplies better author and year metadata.

## Decision

Primary Library intake will accept one artifact at a time: either a PDF file or
a website URL. Website capture no longer accepts intake-time bibliographic
overrides. It extracts bounded metadata when available and otherwise uses the
normalized final URL as an explicit placeholder title, accompanied by a
diagnostic that asks the researcher to refine the record later.

New web-source reference keys are provisional under the lifecycle established
by ADR-083. Recapture and reviewed or manual metadata updates may improve the
key while the source remains private-only. Its first project link permanently
finalizes the key. Existing web-source keys remain final after migration.

This decision partially supersedes ADR-060's requirement for identifying
metadata overrides on failed captures. Its versioned capture, security,
privacy, and project-pinning constraints remain in force.

## Consequences

**Positive:**

- Collecting a source requires only the source itself.
- Sparse, offline, and unsupported pages still become refinable Library records.
- Later metadata can improve a private-only web source's citation ID.

**Negative:**

- A newly collected source may display its URL as its title until refinement.
- Intake no longer offers a one-step way to correct extracted website metadata.

**Neutral:**

- Metadata refinement remains available on every Library record.
- Immutable web snapshots still retain retrieval metadata and diagnostics.

## Alternatives Considered

### Keep overrides behind progressive disclosure

This hides visual weight initially but preserves two places to edit the same
metadata and suggests that refinement is part of capture.

### Reject pages without extracted titles

This keeps every record bibliographically presentable at creation but prevents
the collect-first workflow precisely when automated extraction is weakest.

### Derive a human-looking title from the URL path

This may look friendlier but would fabricate bibliographic metadata. Showing
the normalized URL makes the placeholder's origin explicit.
