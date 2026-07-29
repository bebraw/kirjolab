import { describe, expect, it } from "vitest";
import { renderIcon } from "../ui/icons";
import { renderModelPreferences, renderPreferencesMenu } from "./home-preferences";

describe("renderPreferencesMenu", () => {
  it("renders the settings trigger and stable preference state hooks", () => {
    const html = renderPreferencesMenu();

    const trigger = html.slice(html.indexOf("<summary"), html.indexOf("</summary>"));
    expect(html).toContain('id="preferences-menu" data-settings-menu');
    expect(trigger).toContain('aria-label="Open preferences" title="Preferences"');
    expect(trigger).toContain(renderIcon("settings"));
    expect(html).toContain('id="theme-preference" aria-label="Appearance"');
    expect(html).toContain('<theme-preference-control class="contents" id="theme-preference-control">');
    expect(html).toContain('id="vim-toggle" type="button" aria-pressed="false"');
    expect(html).toContain('<editor-indentation-control id="editor-indentation-control">');
    expect(html).toContain('id="editor-indentation-style"');
    expect(html).toContain('id="editor-tab-size" type="number" min="1" max="8" step="1" value="2"');
    expect(html).toContain('id="citation-completion-scope" aria-label="Citation suggestion scope"');
    expect(html).toContain('id="copy-application-version" type="button" aria-label="Copy application version"');
    expect(html).toContain(renderModelPreferences());
  });
});

describe("renderModelPreferences", () => {
  it("renders the complete local-model connection contract", () => {
    const html = renderModelPreferences();

    expect(html).toContain('<model-provider-settings id="model-provider-settings">');
    expect(html).toContain('aria-labelledby="model-preference-heading"');
    expect(html).toContain('id="llm-connection"');
    expect(html).toContain('<option value="direct">Direct browser connection</option>');
    expect(html).toContain('<option value="companion">Local companion</option>');
    expect(html).toContain('id="llm-endpoint" type="url" value="http://127.0.0.1:1234/v1/chat/completions"');
    expect(html).toContain('id="llm-model"');
    expect(html).toContain('id="llm-reasoning-effort"');
    expect(html).toContain('<option value="provider-default">Provider default</option>');
    expect(html).toContain('id="discover-llm-models" type="button">Find loaded models</button>');
    expect(html).toContain('id="preferences-model-status" role="status" aria-live="polite"');
  });
});
