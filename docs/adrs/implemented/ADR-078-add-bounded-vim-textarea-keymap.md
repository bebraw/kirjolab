# ADR-078: Add a Bounded Vim Textarea Keymap

**Status:** Implemented

**Date:** 2026-07-13

## Context

Researchers who use Vim rely on modal navigation and editing commands to keep
their hands on the keyboard. Kirjolab's native textarea preserves a simple Yjs
and browser-input boundary, but it offers only platform-standard keybindings.

Replacing the textarea with a full editor would reverse ADR-077 and require a
new document, selection, accessibility, and collaboration integration. A
complete Vim emulator is also a large compatibility surface: command-line
mode, mappings, registers, macros, search, marks, and repeat behavior would be
misleading if only partially reproduced without an explicit boundary.

## Decision

Add an opt-in, browser-local Vim keymap as a command adapter over the existing
textarea. Standard editing remains the default. Enabling Vim starts in Normal
mode, exposes a compact Normal/Insert/Visual status beside the toggle, and
persists only the enabled preference in local storage.

The first supported command set is intentionally explicit:

- Normal motions: `h`, `j`, `k`, `l`, arrow keys, `w`, `b`, `e`, `0`, `$`,
  `gg`, `G`, and numeric counts.
- Insert entry: `i`, `a`, `I`, `A`, `o`, and `O`; `Escape` or `Ctrl-[` returns
  to Normal mode.
- Editing: `x`, `X`, `D`, `dd`, `cc`, `yy`, `p`, and `P` with one unnamed
  characterwise or linewise register.
- Visual mode: `v`, the supported motions, and `d`, `x`, `c`, or `y`.

Commands produce ordinary textarea values, selections, and bubbling input
events so the existing Yjs binding remains authoritative. Modified browser
shortcuts, Tab navigation, and key events during IME composition bypass the
adapter. Unsupported printable keys in Normal or Visual mode are consumed
rather than inserted as manuscript text.

## Consequences

**Positive:**

- Vim users gain useful modal navigation and editing without a new dependency
  or collaboration model.
- The keymap can be disabled instantly and does not affect other users or
  project state.
- Pure command-state tests can verify text and selection behavior separately
  from browser event wiring.

**Negative:**

- This is a documented subset, not full Vim emulation; search, command-line
  mode, macros, mappings, marks, dot-repeat, and Vim undo are not included.
- Programmatic textarea edits depend on the existing Yjs history and browser
  shortcuts rather than implementing a separate Vim undo tree.
- New commands must preserve both Vim expectations and textarea/Yjs offsets.

**Neutral:**

- Mouse text selection enters Visual mode while the keymap is enabled.
- The preference is device/browser specific and does not synchronize.

## Alternatives Considered

### Replace the textarea with CodeMirror and its Vim extension

This would offer broader Vim compatibility, but it adds an editor framework
and requires replacing the established native input, selection, highlighting,
and Yjs boundary.

### Add a full custom Vim emulator immediately

Full compatibility is substantially larger than the requested editing aid and
would create a long-lived emulation project before actual command usage is
known.

### Enable Vim commands for every user

Modal editing changes the meaning of ordinary typing. Making it the default
would surprise researchers who expect a standard textarea.
