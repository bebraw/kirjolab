const ICONS = {
  account: '<circle cx="12" cy="8" r="3.25"></circle><path d="M5.5 20c.45-4 2.65-6 6.5-6s6.05 2 6.5 6"></path>',
  annotations: '<path d="M5 5h14v11H9l-4 4Z"></path><path d="M9 9h6M9 12.5h4"></path>',
  chevronDown: '<path d="m7 10 5 5 5-5"></path>',
  chevronUp: '<path d="m7 14 5-5 5 5"></path>',
  close: '<path d="m7 7 10 10M17 7 7 17"></path>',
  comments: '<path d="M4 5.25h16v11.5H9l-5 3z"></path>',
  download: '<path d="M12 4v11m-4-4 4 4 4-4M5 19h14"></path>',
  draw: '<path d="m5 19 3.5-.8L18 8.7 15.3 6 5.8 15.5Z"></path><path d="m13.8 7.5 2.7 2.7"></path>',
  fileAdd: '<path d="M6 3.75h8l4 4v12.5H6z"></path><path d="M14 3.75v4h4"></path><path d="M9 14h6M12 11v6"></path>',
  files: '<path d="M3.5 6.75h6l2 2h9v9.5h-17z"></path>',
  folderAdd: '<path d="M3.5 6.75h6l2 2h9v9.5h-17z"></path><path d="M9 13.5h6M12 10.5v6"></path>',
  imageAdd:
    '<rect x="3.5" y="5" width="17" height="14" rx="1.5"></rect><circle cx="8.25" cy="9.25" r="1.5"></circle><path d="m5.5 17 4.25-4.25 3 3 2-2 3.75 3.25"></path><path d="M18.5 2.75v4M16.5 4.75h4"></path>',
  guide: '<path d="M5 4h14v16H5z"></path><path d="M8 8h8M8 12h5M8 16h7"></path>',
  note: '<path d="M5 4h14v12H9l-4 4Z"></path><path d="M9 8h6M9 12h4"></path>',
  research:
    '<path d="M5 5.5h5.25A2.75 2.75 0 0 1 13 8.25v10.25a3.25 3.25 0 0 0-3.25-3.25H5z"></path><path d="M19 5.5h-3.25A2.75 2.75 0 0 0 13 8.25v10.25a3.25 3.25 0 0 1 3.25-3.25H19z"></path>',
  select: '<path d="m6 3 11 9-6 1.5L9 19Z"></path>',
  settings:
    '<circle cx="12" cy="12" r="3"></circle><path d="M19 13.5v-3l-2.1-.7a7.5 7.5 0 0 0-.7-1.7l1-2-2.1-2.1-2 1a7.5 7.5 0 0 0-1.7-.7L10.5 2h-3l-.7 2.1a7.5 7.5 0 0 0-1.7.7l-2-1L1 5.9l1 2a7.5 7.5 0 0 0-.7 1.7L-1 10.5v3l2.1.7a7.5 7.5 0 0 0 .7 1.7l-1 2L3 20l2-1a7.5 7.5 0 0 0 1.7.7l.8 2.3h3l.7-2.1a7.5 7.5 0 0 0 1.7-.7l2 1 2.1-2.1-1-2a7.5 7.5 0 0 0 .7-1.7z" transform="translate(2)"></path>',
  text: '<path d="M5 6h14M12 6v12M8.5 18h7"></path><path class="library-pdf-icon-accent" d="M5 20h14"></path>',
  undo: '<path d="M9 7 5 11l4 4"></path><path d="M5.5 11H14a5 5 0 0 1 5 5"></path>',
} as const;

export type IconName = keyof typeof ICONS;

export function renderIcon(name: IconName, className?: string): string {
  const classAttribute = className ? ` class="${escapeAttribute(className)}"` : "";
  return `<svg${classAttribute} viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
