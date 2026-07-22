export function renderWorkspaceSettingsDialog(): string {
  return `<dialog class="new-workspace-dialog ui-dialog" id="workspace-settings-dialog">
      <form class="p-5" id="workspace-settings-form">
        <p class="eyebrow">Project settings</p>
        <h2 class="mt-1 text-xl font-semibold tracking-[-0.035em]">Manage this project</h2>
        <label class="field-label mt-5">Project title<input class="field" id="workspace-settings-title" maxlength="120" required></label>
        <label class="field-label mt-4">Entry file<select class="field" id="workspace-entry-file"></select></label>
        <p class="mt-2 text-xs leading-5 text-app-text-soft">Preview, statistics, and publication exports compose from this file.</p>
        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <label class="field-label">Citation style<select class="field" id="workspace-citation-style">
            <option value="apa">APA</option><option value="chicago-author-date">Chicago author-date</option><option value="ieee">IEEE numeric</option>
          </select></label>
          <label class="field-label">Citation locale<select class="field" id="workspace-citation-locale">
            <option value="en-US">English (US)</option><option value="en-GB">English (UK)</option><option value="fi-FI">Finnish</option>
          </select></label>
          <label class="field-label">Submission template<select class="field" id="workspace-submission-template">
            <option value="article">Standard article</option><option value="preprint">Preprint</option>
            <option value="anonymous-review">Anonymous review</option><option value="journal-two-column">Journal two-column</option>
          </select></label>
          <label class="field-label">Paper size<select class="field" id="workspace-paper-size"><option value="a4">A4</option><option value="letter">US Letter</option></select></label>
        </div>
        <p class="mt-2 text-xs leading-5 text-app-text-soft">These settings affect preview and exports without changing the manuscript.</p>
        <div class="mt-5 flex flex-wrap gap-2">
          <button class="button-primary" type="submit">Save title</button>
          <button class="button-secondary" id="save-workspace-template" type="button">Save as template</button>
          <button class="button-secondary" id="duplicate-workspace" type="button">Duplicate</button>
          <button class="button-secondary" id="archive-workspace" type="button" data-destructive="true">Archive</button>
        </div>
        <section class="mt-6 border-t border-app-line pt-5">
          <p class="eyebrow">GitHub sync</p>
          <p class="mt-2 text-sm leading-6 text-app-text-soft" id="github-sync-status">Checking connection…</p>
          <div class="mt-4" id="github-pull-review" aria-live="polite"></div>
          <div class="mt-3 flex flex-wrap gap-2">
            <button class="button-secondary" id="preview-github-pull" type="button">Preview pull</button>
            <button class="button-primary" id="confirm-github-pull" type="button" disabled>Pull changes</button>
          </div>
          <label class="field-label mt-4">Commit message<input class="field" id="github-publish-message" maxlength="900" value="Publish from Kirjolab"></label>
          <div class="mt-3" id="github-publish-review" aria-live="polite"></div>
          <div class="mt-4 flex flex-wrap gap-2">
            <button class="button-secondary" id="preview-github-publish" type="button">Preview publish</button>
            <button class="button-primary" id="confirm-github-publish" type="button" disabled>Publish commit</button>
            <button class="button-secondary" id="disconnect-github" type="button" data-destructive="true">Disconnect</button>
          </div>
        </section>
        <section class="mt-6 border-t border-app-line pt-5">
          <p class="eyebrow">Danger zone</p>
          <p class="mt-2 text-sm leading-6 text-app-text-soft">Permanent deletion removes project revisions, collaborators, project PDFs, and project links. Private library references remain.</p>
          <button class="button-secondary mt-3" id="delete-workspace" type="button" data-destructive="true">Delete permanently</button>
        </section>
        <div class="mt-5 flex justify-end"><button class="button-secondary" id="close-workspace-settings" type="button">Close</button></div>
      </form>
    </dialog>`;
}
