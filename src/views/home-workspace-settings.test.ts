import { describe, expect, it } from "vitest";
import { renderWorkspaceSettingsDialog } from "./home-workspace-settings";

describe("renderWorkspaceSettingsDialog", () => {
  it("renders publication, synchronization, and lifecycle controls as one project-settings contract", () => {
    const html = renderWorkspaceSettingsDialog();

    expect(html).toContain('id="workspace-settings-dialog"');
    expect(html).toContain('id="workspace-settings-form"');
    expect(html).toContain('id="workspace-settings-title" maxlength="120" required');
    expect(html).toContain('id="workspace-entry-file"');
    expect(html).toContain('id="workspace-citation-style"');
    expect(html).toContain('id="workspace-citation-locale"');
    expect(html).toContain('id="workspace-submission-template"');
    expect(html).toContain('id="workspace-paper-size"');
    expect(html).toContain('id="save-workspace-template" type="button"');
    expect(html).toContain('id="archive-workspace" type="button" data-destructive="true"');
    expect(html).toContain('id="github-pull-review" aria-live="polite"');
    expect(html).toContain('id="confirm-github-pull" type="button" disabled');
    expect(html).toContain('id="github-publish-review" aria-live="polite"');
    expect(html).toContain('id="confirm-github-publish" type="button" disabled');
    expect(html).toContain('id="disconnect-github" type="button" data-destructive="true"');
    expect(html).toContain('id="delete-workspace" type="button" data-destructive="true"');
    expect(html).toContain('id="close-workspace-settings" type="button"');
  });
});
