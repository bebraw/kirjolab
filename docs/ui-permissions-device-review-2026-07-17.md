# UI Permissions and Device Review — 2026-07-17

**Status:** No new high- or medium-priority product issue was found. Read-only
and edit bearer links stayed within their intended capabilities, revoked
cleanly, and remained usable at narrow touch viewports.

This audit follows
[`ui-review-follow-up-2026-07-17.md`](./ui-review-follow-up-2026-07-17.md) and
focuses on sharing boundaries and constrained layouts rather than repeating
the four paper-authoring workflows.

## Verification setup

- Used the persistent `UX Round 2 — Novice Recovery` project in the running
  local application through Chrome CDP.
- Created separate read-only and edit bearer links in isolated browser
  contexts.
- Exercised a malformed shared-output query, live edit synchronization,
  source restoration, link revocation, mobile touch emulation, and narrow
  reflow.
- Revoked both links after the checks. No bearer token is recorded in this
  document.

## Permission boundary results

| Scenario                  | Result | Evidence                                                                                                                                                                    |
| ------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read-only link            | Passed | The surface exposed rendered PDF, composed Markdown, and project files without an editor, Library, research notes, project settings, or sharing controls.                   |
| Malformed output selector | Passed | A traversal-shaped `view` value fell back to the rendered-output view; it did not expose another file, private data, or an editable control.                                |
| Edit link                 | Passed | The surface exposed only the authored Markdown editor and rendered PDF. Library, research, membership, project settings, and sharing controls were absent.                  |
| Live edit synchronization | Passed | A temporary edit saved as a new revision and appeared in the owner view. Restoring the original source produced the following revision and was confirmed in the owner view. |
| Read-only revocation      | Passed | Reloading the revoked URL returned the generic 404 surface without the project title or content.                                                                            |
| Edit-link revocation      | Passed | Reloading the revoked URL returned the generic 404 surface without project content or an editor.                                                                            |

The shared pages also state their capability boundaries directly: the
read-only page says that editing and private research are unavailable, while
the edit page says that private research, members, and project administration
remain unavailable.

## Constrained-layout results

- At a `390 × 844` CSS-pixel mobile viewport with touch enabled, the edit page
  had no horizontal overflow. The editor remained fully inside the viewport.
- At a `320 × 800` narrow viewport with touch enabled, the page continued to
  reflow without horizontal overflow; the editor retained 21-pixel side
  margins and a 278-pixel usable width.
- The visible `Edit` tab and `Open PDF` action were 38 pixels tall. This is
  above the WCAG 2.2 target-size minimum, though below the more generous
  44-pixel platform convention. It is an observation, not a reported defect,
  because the controls were isolated, legible, and operable in this pass.

## Verification limits

- Local development identifies same-origin requests as the local owner, so a
  live anonymous request to private owner APIs would not reproduce the
  production identity boundary. This pass therefore verifies that shared UI
  surfaces do not offer private controls; production-like authorization
  remains covered by automated tests rather than this local browser session.
- Chrome's keyboard zoom shortcut did not change page metrics through this CDP
  connection. The 320-pixel viewport provides a comparable reflow stress, but
  it is not a claim of complete 400% browser-zoom coverage.
- Touch was emulated. This does not replace testing with VoiceOver, a physical
  iPad, or Apple Pencil input.
- The in-app browser controller could not initialize because its runtime tried
  to redefine a protected `process` property. Chrome CDP remained healthy and
  was used for the full audit; this was a tooling limitation, not an
  application failure.

## Conclusion

The sharing UI has a clear least-capability split: read-only links inspect
project outputs, edit links change authored Markdown, and neither surface
offers private research or administration. Revocation removes both forms of
access without retaining project details in the response. The constrained
layout checks found no responsive blocker.

The highest-value remaining manual coverage is assistive-technology and
physical-device testing, especially VoiceOver reading order, software-keyboard
behavior around the editor, and touch or Pencil selection at real device
scale.
