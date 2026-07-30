import { renderIcon } from "../ui/icons";

export function renderLibraryPdfRail(): string {
  return `<nav class="library-pdf-page-rail" aria-label="Private PDF controls">
              <div class="library-pdf-page-controls" aria-label="PDF page navigation">
                <button class="library-pdf-rail-button button-icon" id="previous-library-paper-page" type="button" aria-label="Previous PDF page" title="Previous page" data-touch-target="true">
                  ${renderIcon("chevronUp")}
                </button>
                ${renderPdfPageIndicator("library-paper-page-indicator")}
                <button class="library-pdf-rail-button button-icon" id="next-library-paper-page" type="button" aria-label="Next PDF page" title="Next page" data-touch-target="true">
                  ${renderIcon("chevronDown")}
                </button>
                <button class="library-pdf-rail-button button-icon" id="toggle-library-paper-continuous" type="button" aria-pressed="false" title="Use continuous scrolling" data-touch-target="true">
                  ${renderIcon("continuousPages")}<span class="sr-only" data-pdf-display-label>Continuous scroll</span>
                </button>
              </div>
              <div class="library-pdf-reading-tools" role="toolbar" aria-label="PDF reading tools">
                <button class="library-pdf-rail-button button-icon" id="open-library-pdf-search" type="button" aria-label="Search this PDF" title="Search this PDF" data-touch-target="true">
                  ${renderIcon("search")}<span class="sr-only">Search PDF</span>
                </button>
                <button class="library-pdf-rail-button button-icon" id="open-library-pdf-navigation" type="button" aria-label="Open PDF contents and thumbnails" title="Contents and thumbnails" data-touch-target="true">
                  ${renderIcon("pages")}<span class="sr-only">PDF navigation</span>
                </button>
                <button class="library-pdf-rail-button button-icon" id="library-pdf-zoom-out" type="button" aria-label="Zoom out" title="Zoom out" data-touch-target="true">${renderIcon("zoomOut")}</button>
                <button class="library-pdf-rail-button button-icon" id="library-pdf-fit-mode" type="button" aria-label="Change PDF fit mode" title="Fit width" data-touch-target="true">${renderIcon("fit")}<span class="sr-only" data-pdf-fit-label>Fit width</span></button>
                <button class="library-pdf-rail-button button-icon" id="library-pdf-zoom-in" type="button" aria-label="Zoom in" title="Zoom in" data-touch-target="true">${renderIcon("zoomIn")}</button>
                <button class="library-pdf-rail-button button-icon" id="library-pdf-rotate" type="button" aria-label="Rotate clockwise" title="Rotate clockwise" data-touch-target="true">${renderIcon("rotate")}</button>
                <button class="library-pdf-rail-button button-icon" id="library-pdf-spread" type="button" aria-label="Use two-page view" title="Two-page view" aria-pressed="false" data-touch-target="true">${renderIcon("spread")}</button>
              </div>
              <library-pdf-annotation-toolbar id="library-pdf-annotation-toolbar">
                <div class="library-pdf-annotation-tools" role="toolbar" aria-label="PDF tools">
                <button class="library-pdf-rail-button button-icon" id="library-select-tool" type="button" aria-pressed="false" title="Select and copy text, or edit an existing annotation" data-touch-target="true">
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
                <button class="library-pdf-rail-button button-icon" id="download-library-original-pdf" type="button" disabled title="Download the original PDF" data-touch-target="true">
                  ${renderIcon("guide")}<span class="sr-only">Download original PDF</span>
                </button>
                <button class="library-pdf-rail-button button-icon" id="export-library-annotated-pdf" type="button" disabled title="Download a copy with private notes and ink" data-touch-target="true">
                  ${renderIcon("download")}<span class="sr-only">Export annotated</span>
                </button>
                <button class="library-pdf-rail-button library-pdf-annotations-button button-icon" id="open-library-pdf-inspector" type="button" aria-label="Annotations" aria-expanded="false" aria-controls="library-highlight-composer" title="Open annotations" data-touch-target="true">
                  ${renderIcon("annotations")}<span class="sr-only">Annotations</span><span class="count-badge" id="library-highlight-count">0</span>
                </button>
                <button class="library-pdf-rail-button button-icon" id="open-library-pdf-references" type="button" aria-label="References" aria-expanded="false" aria-controls="library-highlight-composer" title="Open references" data-touch-target="true">
                  ${renderIcon("research")}<span class="sr-only">References</span>
                </button>
                </div>
              </library-pdf-annotation-toolbar>
            </nav>`;
}

export function renderPdfPageIndicator(id: string): string {
  return `<span class="context-page-indicator pdf-page-jump" id="${id}">
                  <button class="pdf-page-jump-display" type="button" aria-label="Go to a specific PDF page" title="Go to page">
                    <span data-pdf-page-current>–</span> / <span data-pdf-page-total>–</span>
                  </button>
                  <input class="pdf-page-jump-input" type="number" min="1" inputmode="numeric" aria-label="PDF page number" hidden>
                </span>`;
}
