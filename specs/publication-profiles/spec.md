# Feature: Project Publication Profiles

## Blueprint

### Context

One scholarly project may target different publication conventions without
changing its canonical Markdown or shared references.

### Architecture

- Each project stores a publication profile containing a supported citation
  style and locale.
- The initial citation styles are APA, Chicago author-date, and IEEE numeric.
- Preview and the unified export pipeline read the same profile.
- Export manifests record the profile; LaTeX materialization selects the
  matching pinned citation command and bibliography style.
- Profile changes create project revisions and survive milestones, restore,
  duplication, and source-bundle export.
- The profile is presentation state. It never mutates `:cite[...]`, citation
  aliases, or canonical shared bibliographic metadata.

### Security and Validation

- Only project owners can change publication profiles.
- APIs accept only exact supported style and locale values.
- Arbitrary CSL, templates, scripts, URLs, and file paths are not accepted by
  this bounded profile endpoint.

## Contract

### Definition of Done

- [x] Project Settings exposes citation style and locale.
- [x] Preview visibly distinguishes supported author-date and numeric styles.
- [x] LaTeX output and export manifests carry the selected profile.
- [x] Project history and duplication preserve the profile.
- [x] Automated tests cover formatting, export, validation, and durable history.

### Regression Guardrails

- Markdown and shared references must remain identical when a profile changes.
- Preview and export must never silently fall back from a valid stored profile.
- Legacy projects and historical revisions default to APA with `en-US`.
