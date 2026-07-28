import type { ResearchContextKey } from "./research-context";

export type ContextTabAction =
  | { readonly action: "activate"; readonly key: ResearchContextKey }
  | { readonly action: "close"; readonly key: ResearchContextKey };

export function contextTabAction(event: Event): ContextTabAction | null {
  const { contextAction: action, contextKey: key } = (event.currentTarget as HTMLButtonElement).dataset;
  return key && (action === "activate" || action === "close") ? { action, key: key as ResearchContextKey } : null;
}
