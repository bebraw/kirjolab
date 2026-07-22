import { renderIcon } from "../ui/icons";

export function renderPreferencesMenu(): string {
  return `<details class="preferences-menu ui-menu" id="preferences-menu" data-settings-menu>
            <summary class="preferences-trigger" aria-label="Open preferences" title="Preferences">
              ${renderIcon("settings")}
              <span class="hidden sm:inline">Settings</span>
            </summary>
            <div class="preferences-panel ui-menu-panel" aria-label="Preferences">
              <header><p class="eyebrow">Personal preferences</p><h2>Settings</h2><p>Stored in this browser and reused across projects.</p></header>
              <section class="preferences-section" aria-labelledby="appearance-preference-heading">
                <div><h3 id="appearance-preference-heading">Appearance</h3><p>Follow your device or keep one theme.</p></div>
                <label class="sr-only" for="theme-preference">Appearance</label>
                <select class="field" id="theme-preference" aria-label="Appearance">
                  <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
                </select>
              </section>
              <section class="preferences-section" aria-labelledby="writing-preference-heading">
                <div><h3 id="writing-preference-heading">Writing</h3><p>Use modal Vim keybindings in the source editor.</p></div>
                <button class="preference-toggle" id="vim-toggle" type="button" aria-pressed="false" title="Enable Vim keybindings"><span>Vim mode</span><span class="editor-mode-status" id="vim-mode-status" role="status" aria-live="polite" hidden>NORMAL</span></button>
              </section>
              <section class="preferences-section" aria-labelledby="citation-suggestions-heading">
                <div><h3 id="citation-suggestions-heading">Citation suggestions</h3><p>Choose which references appear while completing citation keys.</p></div>
                <label class="sr-only" for="citation-completion-scope">Citation suggestion scope</label>
                <select class="field" id="citation-completion-scope" aria-label="Citation suggestion scope">
                  <option value="project">Project references</option><option value="library">Project and private library</option>
                </select>
              </section>
              <section class="preferences-section" aria-labelledby="diagnostics-preference-heading">
                <div><h3 id="diagnostics-preference-heading">Diagnostics</h3><p>Include this version when reporting an error or suspected cache issue.</p></div>
                <button class="application-version-copy" id="copy-application-version" type="button" aria-label="Copy application version"><code id="application-version">Loading…</code><span>Copy</span></button>
              </section>
              ${renderModelPreferences()}
            </div>
          </details>`;
}

export function renderModelPreferences(): string {
  return `<section class="preferences-model" aria-labelledby="model-preference-heading">
                <div><h3 id="model-preference-heading">Local model</h3><p>Configure the OpenAI-compatible connection used by Writing assistant.</p></div>
                <div class="preferences-model-grid">
                  <label class="field-label">Connection
                    <select class="field" id="llm-connection">
                      <option value="direct">Direct browser connection</option>
                      <option value="companion">Local companion</option>
                    </select>
                  </label>
                  <label class="field-label preferences-endpoint">Endpoint
                    <input class="field" id="llm-endpoint" type="url" value="http://127.0.0.1:1234/v1/chat/completions">
                  </label>
                  <label class="field-label">Model
                    <select class="field" id="llm-model">
                      <option value="">Find loaded models</option>
                    </select>
                  </label>
                  <label class="field-label">Reasoning
                    <select class="field" id="llm-reasoning-effort">
                      <option value="none">Off · fastest</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="provider-default">Provider default</option>
                    </select>
                  </label>
                  <button class="button-secondary justify-center" id="discover-llm-models" type="button">Find loaded models</button>
                </div>
                <p class="preferences-model-status ui-status" id="preferences-model-status" role="status" aria-live="polite">Connection details stay on this device.</p>
              </section>`;
}
