# Feature: Editor Indentation

## Blueprint

### Context

Researchers should be able to indent Markdown without Tab moving focus out of
the source editor. The behavior should feel familiar to users of configurable
code editors while preserving Kirjolab's native collaborative textarea.

### Architecture

- **Default:** Tab inserts spaces to the next two-column tab stop.
- **Preference:** Indentation style (`spaces` or `tabs`) and tab size (1–8) are
  browser-local under `kirjolab:editor-indentation` and apply across projects.
- **Command model:** A pure indentation transition owns insertion, selected-line
  indentation, and current/selected-line outdent offsets.
- **Browser adapter:** Handled edits update the native textarea, preserve its
  selection direction, set its visual tab size, and dispatch a bubbling input
  event through the existing Yjs binding.
- **Precedence:** Visible source completion accepts Tab first. Vim Normal and
  Visual modes retain keyboard authority; standard editing and Vim Insert mode
  use configured indentation.

### Anti-Patterns

- Do not store indentation preferences in project or Yjs state.
- Do not update the highlight mirror instead of the authoritative textarea.
- Do not intercept modified shortcuts or key events during IME composition.
- Do not take Tab away from a visible source-completion choice.

## Contract

### Definition of Done

- [x] Tab remains inside the source editor and defaults to two spaces.
- [x] Settings allow spaces or literal tab characters and a tab size from 1–8.
- [x] Preferences survive reload and apply across projects in the same browser.
- [x] Selected lines indent with Tab and outdent with Shift+Tab.
- [x] Indentation flows through the collaborative textarea input path.
- [x] Completion and Vim-mode precedence remain intact.

### Regression Guardrails

- A visible completion continues accepting Tab rather than inserting whitespace.
- Vim Normal and Visual modes do not receive standard indentation edits.
- Vim Insert mode uses the configured standard indentation behavior.
- Literal tabs render at the configured width.
- File switches and remote updates continue using the active Yjs text.

### Scenarios

**Scenario: Researcher presses Tab with defaults**

- Given: no indentation preference has been saved
- When: the researcher presses Tab in the source editor
- Then: spaces are inserted up to the next two-column tab stop and focus stays
  in the editor

**Scenario: Researcher chooses tabs**

- Given: indentation is configured to use tabs
- When: the researcher presses Tab in standard editing or Vim Insert mode
- Then: one literal tab character is inserted and rendered at the configured
  tab size

**Scenario: Researcher outdents lines**

- Given: one or more indented lines are selected
- When: the researcher presses Shift+Tab
- Then: one leading tab or up to one configured level of spaces is removed from
  each selected line
