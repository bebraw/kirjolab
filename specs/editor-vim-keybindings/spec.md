# Feature: Editor Vim Keybindings

## Blueprint

### Context

Vim-oriented researchers should be able to navigate and revise Markdown with a
familiar modal command set without changing Kirjolab's native collaborative
textarea or affecting standard-editor users.

### Architecture

- **Default:** Vim keybindings are off and the textarea behaves normally.
- **Preference:** The enabled flag is browser-local under
  `kirjolab:vim-keybindings`; mode, counts, pending commands, and register data
  are ephemeral.
- **Command model:** `src/client/vim-keybindings.ts` is a pure state transition
  over textarea value and selection snapshots.
- **Browser adapter:** handled edits update the same textarea and dispatch an
  input event through the existing Yjs binding.
- **Feedback:** the authoring toolbar exposes a pressed Vim toggle and a compact
  live Normal/Insert/Visual indicator.

### Supported Commands

- Motions: `h`, `j`, `k`, `l`, arrows, `w`, `b`, `e`, `0`, `$`, `gg`, `G`, and
  counts.
- Insert: `i`, `a`, `I`, `A`, `o`, `O`, `Escape`, and `Ctrl-[`.
- Changes: `x`, `X`, `D`, `dd`, `cc`, `yy`, `p`, and `P`.
- Visual: `v`, supported motions, `d`, `x`, `c`, `y`, and `Escape`.

### Anti-Patterns

- Do not describe the bounded command set as complete Vim emulation.
- Do not intercept IME composition, Tab focus navigation, or modified browser
  shortcuts.
- Do not store Vim mode, registers, or pending commands in Yjs or project state.
- Do not mutate the highlighted mirror instead of the textarea.
- Do not add an editor dependency without superseding ADR-077 and ADR-078.

## Contract

### Definition of Done

- [x] Standard textarea editing remains the default.
- [x] Users can enable and disable Vim keybindings from the editor toolbar.
- [x] Normal, Insert, and Visual modes expose clear status.
- [x] Supported commands preserve line, word, and selection boundaries.
- [x] Vim edits flow through the existing collaborative input path.
- [x] Browser-local preference survives reload without entering project state.
- [x] Unit and browser tests cover commands, mode changes, persistence, and Yjs
      updates.

### Regression Guardrails

- Disabling Vim restores ordinary typing immediately.
- Normal-mode printable commands never leak into manuscript text.
- IME composition and modified browser shortcuts are never intercepted.
- File switches and remote updates continue using the active Yjs text.
- The mode indicator must not crowd the compact desktop workspace.

### Scenarios

**Scenario: Researcher enables Vim**

- Given: the editor uses standard textarea behavior
- When: the researcher presses the Vim toggle
- Then: the textarea receives focus in Normal mode and the preference is stored

**Scenario: Researcher changes a line**

- Given: Vim is enabled in Normal mode
- When: the researcher enters `dd`
- Then: the current line is removed through the ordinary collaborative input
  path and the editor remains in Normal mode

**Scenario: Researcher returns to standard editing**

- Given: Vim is enabled
- When: the researcher disables it
- Then: printable keys use native textarea behavior with no modal interception
