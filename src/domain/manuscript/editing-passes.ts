import { buildManuscriptMap, manuscriptParagraphs } from "./manuscript-map";

export type EditingPass = "structure" | "order" | "clarity" | "evidence" | "length";

export interface EditingCue {
  readonly message: string;
  readonly detail: string;
  readonly from: number;
  readonly to: number;
}

const sectionOrder = new Map([
  ["introduction", 1],
  ["literature review", 2],
  ["background", 2],
  ["methods", 3],
  ["method", 3],
  ["results", 4],
  ["discussion", 5],
  ["conclusion", 6],
  ["conclusions", 6],
]);

export function runEditingPass(source: string, pass: EditingPass): readonly EditingCue[] {
  if (pass === "structure") {
    return buildManuscriptMap(source).cues.map((cue) => ({
      message: cue.message,
      detail: cue.kind.replaceAll("-", " "),
      from: cue.from,
      to: cue.to,
    }));
  }
  if (pass === "order") return orderCues(source);
  if (pass === "clarity") return clarityCues(source);
  if (pass === "evidence") return evidenceCues(source);
  return lengthCues(source);
}

function orderCues(source: string): readonly EditingCue[] {
  const sections = buildManuscriptMap(source).sections;
  const cues: EditingCue[] = [];
  let last: { rank: number; title: string } | null = null;
  for (const section of sections) {
    const rank = sectionOrder.get(section.title.toLocaleLowerCase());
    if (rank === undefined) continue;
    if (last && rank < last.rank) {
      cues.push({
        message: `Review whether “${section.title}” belongs after “${last.title}”`,
        detail: "conventional section order",
        from: section.from,
        to: section.to,
      });
    }
    last = { rank, title: section.title };
  }
  return cues;
}

function clarityCues(source: string): readonly EditingCue[] {
  return manuscriptParagraphs(source).flatMap((paragraph) => {
    const cues: EditingCue[] = [];
    if (paragraph.words > 120)
      cues.push({
        message: "Review this dense paragraph for one clear theme",
        detail: `${paragraph.words} words`,
        from: paragraph.from,
        to: paragraph.to,
      });
    if (/^(?:This|These|Those|It)\b/u.test(paragraph.text))
      cues.push({
        message: "Check whether the opening reference names its subject explicitly",
        detail: "implicit opening",
        from: paragraph.from,
        to: paragraph.to,
      });
    return cues;
  });
}

function evidenceCues(source: string): readonly EditingCue[] {
  return manuscriptParagraphs(source)
    .filter(
      (paragraph) =>
        paragraph.words >= 8 &&
        paragraph.citations === 0 &&
        /\b(?:findings?|found|observed|reported|results?|stud(?:y|ies)|research|shows?|demonstrat(?:e|es|ed))\b/iu.test(paragraph.text),
    )
    .map((paragraph) => ({
      message: "Review the evidence basis for this assertion",
      detail: "research-language cue without an inline citation",
      from: paragraph.from,
      to: paragraph.to,
    }));
}

function lengthCues(source: string): readonly EditingCue[] {
  const map = buildManuscriptMap(source);
  return [
    ...map.sections
      .filter((section) => section.words > 1_200)
      .map((section) => ({
        message: `Review whether “${section.title}” should be divided`,
        detail: `${section.words} section words`,
        from: section.from,
        to: section.to,
      })),
    ...manuscriptParagraphs(source)
      .filter((paragraph) => paragraph.words > 250)
      .map((paragraph) => ({
        message: "Review whether this paragraph should be divided",
        detail: `${paragraph.words} paragraph words`,
        from: paragraph.from,
        to: paragraph.to,
      })),
  ];
}
