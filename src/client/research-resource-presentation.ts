import type { ManuscriptAnchorResolution } from "../domain/workspace";

export function anchorActionLabel(resolution: ManuscriptAnchorResolution): string {
  if (resolution.status === "stale") return "Linked passage is stale";
  return resolution.exactMatch ? "Open linked passage" : "Open changed passage";
}

export function anchorMatchState(resolution: ManuscriptAnchorResolution): "exact" | "changed" | "unavailable" {
  if (resolution.status === "stale") return "unavailable";
  return resolution.exactMatch ? "exact" : "changed";
}

export function modelEvidenceKey(kind: "annotation" | "claim", id: string): string {
  return `${kind}:${id}`;
}

export function accessibleEvidenceExcerpt(value: string): string {
  const compact = value.replace(/\s+/gu, " ").trim();
  return compact.length <= 80 ? compact : `${compact.slice(0, 77)}…`;
}
