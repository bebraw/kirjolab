export const previewNavigationStorageKey = "kirjolab:preview-navigation-hidden";

export interface PreviewNavigationPresentation {
  readonly label: string;
  readonly title: string;
}

export function storedPreviewNavigationHidden(value: string | null): boolean {
  return value === "true";
}

export function previewNavigationPresentation(hidden: boolean): PreviewNavigationPresentation {
  return hidden ? { label: "Show nav", title: "Show top navigation" } : { label: "Hide nav", title: "Hide top navigation" };
}
