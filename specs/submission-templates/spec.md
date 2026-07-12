# Feature: Submission Templates

## Blueprint

### Context

Researchers need reproducible export presets for ordinary articles, preprints,
anonymous review, and compact journal submission.

### Architecture

- Project publication profiles select a bounded submission template and A4 or
  US Letter paper.
- Templates resolve deterministically to margins, line spacing, columns,
  title-page behavior, and anonymization.
- LaTeX and direct PDF export consume the same resolved geometry and spacing.
- Export manifests retain the selected profile.
- Settings are project-versioned and owner-managed.

## Contract

### Definition of Done

- [x] Project Settings exposes four labelled templates and paper size.
- [x] LaTeX output materializes template options and anonymous title behavior.
- [x] Direct PDF uses the selected paper size, margin, and line spacing.
- [x] Tests cover every preset and both page sizes.

### Regression Guardrails

- Never execute uploaded templates, TeX, scripts, or remote assets.
- Template changes must not mutate canonical Markdown or shared references.
- Anonymous review output must not silently inject an author identity.
