import { renderIcon } from "../ui/icons";

export function renderLibraryPdfRail(): string {
  return `<nav class="library-pdf-page-rail" aria-label="Private PDF controls">
              <div class="library-pdf-page-controls" aria-label="PDF page navigation">
                <button class="library-pdf-rail-button button-icon" id="previous-library-paper-page" type="button" aria-label="Previous PDF page" title="Previous page" data-touch-target="true">
                  ${renderIcon("chevronUp")}
                </button>
                <span id="library-paper-page-indicator">–<span class="sr-only"> PDF page</span></span>
                <button class="library-pdf-rail-button button-icon" id="next-library-paper-page" type="button" aria-label="Next PDF page" title="Next page" data-touch-target="true">
                  ${renderIcon("chevronDown")}
                </button>
              </div>
              <div class="library-pdf-annotation-tools" role="toolbar" aria-label="PDF annotation tools">
                <button class="library-pdf-rail-button button-icon" id="library-select-tool" type="button" aria-pressed="false" title="Select, edit, move, or delete an existing annotation" data-touch-target="true">
                  ${renderIcon("select")}<span class="sr-only">Select</span>
                </button>
                <button class="library-pdf-rail-button button-icon" id="library-text-tool" type="button" aria-pressed="true" title="Select text and save a quotation" data-touch-target="true">
                  ${renderIcon("text")}<span class="sr-only">Text</span>
                </button>
                <button class="library-pdf-rail-button button-icon" id="library-note-tool" type="button" aria-pressed="false" title="Tap the page to attach a private note" data-touch-target="true">
                  ${renderIcon("note")}<span class="sr-only">Note</span>
                </button>
                <div class="library-draw-rail-control">
                  <button class="library-pdf-rail-button button-icon" id="library-draw-tool" type="button" aria-pressed="false" title="Draw directly on the page with Apple Pencil or a mouse" data-touch-target="true">
                    ${renderIcon("draw")}<span class="sr-only">Draw</span>
                  </button>
                  <div class="library-ink-options" id="library-ink-options" role="group" aria-label="Drawing style" hidden>
                    <label class="library-ink-color-control" title="Ink color"><span class="sr-only">Ink color</span><input id="library-draw-color" type="color" value="#d33f49"></label>
                    <label class="library-width-control" title="Ink width"><span class="sr-only">Ink width</span><input id="library-draw-width" type="range" min="1" max="24" value="4" aria-orientation="vertical"><output id="library-draw-width-value" for="library-draw-width">4</output></label>
                    <button class="library-pdf-rail-button library-undo-drawing button-icon" id="undo-library-drawing" type="button" disabled title="Remove the latest drawing on this page">
                      ${renderIcon("undo")}<span class="sr-only">Undo latest drawing</span>
                    </button>
                  </div>
                </div>
                <span class="library-pdf-rail-divider" aria-hidden="true"></span>
                <button class="library-pdf-rail-button button-icon" id="export-library-annotated-pdf" type="button" disabled title="Download a copy with private notes and ink" data-touch-target="true">
                  ${renderIcon("download")}<span class="sr-only">Export annotated</span>
                </button>
                <button class="library-pdf-rail-button library-pdf-annotations-button button-icon" id="open-library-pdf-inspector" type="button" aria-label="Annotations" aria-expanded="false" aria-controls="library-highlight-composer" title="Open annotations" data-touch-target="true">
                  ${renderIcon("annotations")}<span class="sr-only">Annotations</span><span class="count-badge" id="library-highlight-count">0</span>
                </button>
              </div>
            </nav>`;
}
