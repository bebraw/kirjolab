import type { ScreeningRecordState, ScreeningStage } from "./review-screening";
import type { PrismaFlowData, ReviewExportAuthority } from "./review-export-types";

export function reviewPrismaData(authority: ReviewExportAuthority): PrismaFlowData {
  return {
    schemaVersion: "prisma-2020-flow-v1",
    reviewRevision: authority.revision,
    ...authority.synthesis.flow,
    exclusionReasons: {
      titleAbstract: exclusionReasons(authority.screening.records, "title-abstract"),
      fullText: exclusionReasons(authority.screening.records, "full-text"),
    },
  };
}

export function reviewPrismaSvg(data: PrismaFlowData): string {
  const boxes = [
    ["Records identified", data.identified],
    ["Duplicates removed", data.duplicatesRemoved],
    ["Records screened", data.titleAbstractScreened],
    ["Records excluded", data.titleAbstractExcluded],
    ["Full texts assessed", data.fullTextAssessed],
    ["Full texts excluded", data.fullTextExcluded],
    ["Studies included", data.included],
  ] as const;
  const nodes = boxes
    .map(([label, count], index) => {
      const y = 30 + index * 100;
      return `<g><rect x="40" y="${y}" width="360" height="64" rx="8"/><text x="220" y="${y + 27}" text-anchor="middle">${escapeXml(label)}</text><text x="220" y="${y + 49}" text-anchor="middle" font-weight="700">n = ${count}</text></g>`;
    })
    .join("");
  const arrows = boxes
    .slice(0, -1)
    .map((_box, index) => `<path d="M220 ${94 + index * 100} V${130 + index * 100}" marker-end="url(#arrow)"/>`)
    .join("");
  const description = `PRISMA flow for review revision ${data.reviewRevision}: ${data.identified} records identified, ${data.duplicatesRemoved} duplicates removed, and ${data.included} studies included.`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 730" role="img" aria-labelledby="title description"><title id="title">PRISMA study flow</title><desc id="description">${escapeXml(description)}</desc><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z"/></marker></defs><style>rect{fill:#fff;stroke:#334155;stroke-width:2}path{fill:none;stroke:#334155;stroke-width:2}text{font-family:system-ui,sans-serif;font-size:15px;fill:#0f172a}</style>${arrows}${nodes}</svg>\n`;
}

function exclusionReasons(records: readonly ScreeningRecordState[], stage: ScreeningStage): Readonly<Record<string, number>> {
  const reasons = new Map<string, number>();
  for (const record of records) {
    if (stage === "full-text" && record.finalInclusion.outcome === "exclude" && record.finalInclusion.decision) {
      const reason = record.finalInclusion.decision.criterionText || record.finalInclusion.decision.reason || "Unspecified";
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
      continue;
    }
    const state = stage === "title-abstract" ? record.titleAbstract : record.fullText;
    if (state.outcome !== "exclude") continue;
    const decision = [...state.decisions].reverse().find((candidate) => candidate.decision === "exclude");
    const reason =
      state.adjudication?.criterionText || state.adjudication?.reason || decision?.criterionText || decision?.reason || "Unspecified";
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  return Object.fromEntries([...reasons].sort(([left], [right]) => left.localeCompare(right)));
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
