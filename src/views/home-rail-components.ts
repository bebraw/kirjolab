import { renderIcon } from "../ui/icons";

export function renderProjectRailNavigation(): string {
  return `<div class="rail-mode-switcher">
          <div class="rail-mode-tabs" role="tablist" aria-label="Project navigation">
            <button class="rail-mode" id="show-files-rail" type="button" role="tab" aria-label="Files" aria-controls="files-rail-panel" aria-selected="true" title="Files">
              ${renderIcon("files", "rail-mode-icon")}
              <span class="rail-mode-label">Files</span>
            </button>
            <button class="rail-mode" id="show-research-rail" type="button" role="tab" aria-label="Research" aria-controls="research-rail-panel" aria-selected="false" title="Research">
              ${renderIcon("research", "rail-mode-icon")}
              <span class="rail-mode-label">Research</span>
            </button>
            <button class="rail-mode" id="show-comments-rail" type="button" role="tab" aria-label="Comments" aria-describedby="manuscript-comment-count" aria-controls="comments-rail-panel" aria-selected="false" title="Comments">
              ${renderIcon("comments", "rail-mode-icon")}
              <span class="rail-mode-label">Comments</span>
              <span class="count-badge rail-mode-count" id="manuscript-comment-count">0</span>
            </button>
            <button class="rail-mode" id="show-guide-rail" type="button" role="tab" aria-label="Writing guide" aria-controls="guide-rail-panel" aria-selected="false" title="Writing guide">
              ${renderIcon("guide", "rail-mode-icon")}
              <span class="rail-mode-label">Guide</span>
            </button>
          </div>
          <button class="collapse-source-rail" id="collapse-source-rail" type="button" aria-label="Collapse project rail" title="Collapse project rail">
            ${renderIcon("arrowLeft")}
          </button>
        </div>`;
}

export function renderProjectFileActions(): string {
  return `<div class="grid gap-3">
            <h1 class="text-xl font-semibold tracking-[-0.035em]">Files</h1>
            <div class="grid grid-cols-3 gap-1">
              <button class="button-secondary justify-center" id="new-project-file-rail" type="button" aria-label="Add file" title="Add file">
                ${renderIcon("fileAdd", "rail-action-icon")}
              </button>
              <button class="button-secondary justify-center" id="new-project-folder-rail" type="button" aria-label="Add folder" title="Add folder">
                ${renderIcon("folderAdd", "rail-action-icon")}
              </button>
              <button class="button-secondary justify-center" id="upload-project-images" type="button" aria-label="Add image" title="Add image">
                ${renderIcon("imageAdd", "rail-action-icon")}
              </button>
            </div>
          </div>`;
}
