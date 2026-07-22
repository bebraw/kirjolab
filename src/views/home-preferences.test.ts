import { describe, expect, it } from "vitest";
import { renderIcon } from "../ui/icons";
import { renderPreferencesMenu } from "./home-preferences";

describe("renderPreferencesMenu", () => {
  it("renders the settings trigger and stable preference state hooks", () => {
    const html = renderPreferencesMenu();

    const trigger = html.slice(html.indexOf("<summary"), html.indexOf("</summary>"));
    expect(html).toContain('id="preferences-menu" data-settings-menu');
    expect(trigger).toContain('aria-label="Open preferences" title="Preferences"');
    expect(trigger).toContain(renderIcon("settings"));
    expect(html).toContain('id="theme-preference" aria-label="Appearance"');
    expect(html).toContain('id="vim-toggle" type="button" aria-pressed="false"');
    expect(html).toContain('id="citation-completion-scope" aria-label="Citation suggestion scope"');
    expect(html).toContain('id="copy-application-version" type="button" aria-label="Copy application version"');
    expect(html).toContain('id="llm-connection"');
    expect(html).toContain('id="llm-endpoint" type="url" value="http://127.0.0.1:1234/v1/chat/completions"');
    expect(html).toContain('id="llm-model"');
    expect(html).toContain('id="llm-reasoning-effort"');
    expect(html).toContain('id="preferences-model-status" role="status" aria-live="polite"');
  });
});
