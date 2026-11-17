import { renderIcon } from "../ui/icons";

export function renderPreviewNavigationRestore(location: "library" | "pdf"): string {
  const rail = location === "pdf";
  const id = rail ? "restore-pdf-navigation" : "restore-preview-navigation";
  const classes = rail ? "library-pdf-rail-button button-icon" : "button-secondary";
  return `<button class="${classes} preview-navigation-restore" id="${id}" type="button" data-preview-navigation-restore data-touch-target="true" aria-controls="app-header" aria-label="Show top navigation" title="Show top navigation" hidden>
    ${renderIcon("chevronDown")}<span${rail ? ' class="sr-only"' : ""}>Show nav</span>
  </button>`;
}
