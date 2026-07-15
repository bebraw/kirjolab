export type AssistantOperationId = "revise-selection" | "draft-claim" | "clarity-drill" | "ideate" | "find-references" | "build-table";

export type AssistantTargetScope = "caret" | "selection" | "sentence" | "paragraph" | "section";

export interface AssistantOperationDefinition {
  readonly id: AssistantOperationId;
  readonly label: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly instructionLabel: string;
  readonly defaultInstruction: string;
  readonly actionLabel: string;
  readonly scopes: readonly AssistantTargetScope[];
  readonly defaultScope: AssistantTargetScope | null;
  readonly evidence: "required" | "annotations" | "optional" | "none";
  readonly enabled: boolean;
}

export interface ResolvedAssistantTarget {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly scope: AssistantTargetScope;
}

const definitions: readonly AssistantOperationDefinition[] = [
  {
    id: "revise-selection",
    label: "Revise passage",
    eyebrow: "Manuscript target",
    title: "Draft a reviewable revision",
    description: "Uses the visible editor target and chosen evidence. Review the exact replacement in Context before applying it.",
    instructionLabel: "Revision instruction",
    defaultInstruction: "Improve clarity while preserving the claim and citation syntax.",
    actionLabel: "Draft revision",
    scopes: ["sentence", "paragraph", "section"],
    defaultScope: "sentence",
    evidence: "required",
    enabled: true,
  },
  {
    id: "draft-claim",
    label: "Draft evidence-backed claim",
    eyebrow: "Selected annotations",
    title: "Draft a reviewable claim",
    description: "Uses only chosen annotation snapshots. Review the proposition and note in Context before creating a claim.",
    instructionLabel: "Research instruction",
    defaultInstruction: "Draft one precise claim supported by the selected annotations.",
    actionLabel: "Draft claim",
    scopes: [],
    defaultScope: null,
    evidence: "annotations",
    enabled: true,
  },
  {
    id: "clarity-drill",
    label: "Drill unclear writing",
    eyebrow: "Focused clarification",
    title: "Clarify one fuzzy claim at a time",
    description: "Identifies an unclear sentence, asks one focused question, and turns the agreed meaning into a reviewable revision.",
    instructionLabel: "Clarity goal",
    defaultInstruction: "Find the least concrete claim and help me state exactly what I mean.",
    actionLabel: "Start drill",
    scopes: ["sentence", "paragraph", "section"],
    defaultScope: "sentence",
    evidence: "optional",
    enabled: true,
  },
  {
    id: "ideate",
    label: "Ideate",
    eyebrow: "Writing directions",
    title: "Generate focused possibilities",
    description: "Produces distinct ideas grounded in the surrounding manuscript; a chosen idea can become a reviewable draft.",
    instructionLabel: "Ideation prompt",
    defaultInstruction: "Suggest concrete directions that deepen the argument without repeating the current text.",
    actionLabel: "Generate ideas",
    scopes: ["caret", "selection", "paragraph", "section"],
    defaultScope: "section",
    evidence: "optional",
    enabled: false,
  },
  {
    id: "find-references",
    label: "Find references",
    eyebrow: "Verifiable sources",
    title: "Find sources for the current claim",
    description: "Derives a focused query from the manuscript target, then returns records that can be verified before citation.",
    instructionLabel: "Search focus",
    defaultInstruction: "Find primary or authoritative sources that directly support or challenge this claim.",
    actionLabel: "Find references",
    scopes: ["sentence", "selection", "paragraph"],
    defaultScope: "sentence",
    evidence: "none",
    enabled: false,
  },
  {
    id: "build-table",
    label: "Build table or syntax",
    eyebrow: "Structured authoring",
    title: "Create complex manuscript syntax",
    description: "Collects structured requirements and produces validated syntax for insertion at the caret or replacement of a selection.",
    instructionLabel: "Content guidance",
    defaultInstruction: "Create a concise table from the structured fields below.",
    actionLabel: "Build syntax",
    scopes: ["caret", "selection"],
    defaultScope: "caret",
    evidence: "optional",
    enabled: false,
  },
] as const;

const definitionById = new Map(definitions.map((definition) => [definition.id, definition]));

export function assistantOperationDefinitions(): readonly AssistantOperationDefinition[] {
  return definitions;
}

export function assistantOperationDefinition(value: string): AssistantOperationDefinition {
  return definitionById.get(value as AssistantOperationId) ?? definitions[0]!;
}

export function assistantTargetScopeLabel(scope: AssistantTargetScope): string {
  return {
    caret: "Insert at caret",
    selection: "Selected text",
    sentence: "Sentence at target",
    paragraph: "Paragraph at target",
    section: "Section at target",
  }[scope];
}

export function resolveAssistantTarget(
  source: string,
  selectionStart: number,
  selectionEnd: number,
  requestedScope: AssistantTargetScope,
): ResolvedAssistantTarget {
  const start = clampIndex(selectionStart, source.length);
  const end = clampIndex(selectionEnd, source.length);
  const selection = { start: Math.min(start, end), end: Math.max(start, end) };
  if (selection.start !== selection.end) return target(source, selection.start, selection.end, "selection");
  if (requestedScope === "caret" || requestedScope === "selection") return target(source, selection.start, selection.start, "caret");
  if (requestedScope === "paragraph") return paragraphTarget(source, selection.start);
  if (requestedScope === "section") return sectionTarget(source, selection.start);
  return sentenceTarget(source, selection.start);
}

function sentenceTarget(source: string, caret: number): ResolvedAssistantTarget {
  const paragraph = paragraphTarget(source, caret);
  const localCaret = Math.min(Math.max(caret - paragraph.start, 0), paragraph.text.length);
  const boundary = /[.!?](?:["')\]]*)\s+/gu;
  let start = 0;
  let end = paragraph.text.length;
  for (const match of paragraph.text.matchAll(boundary)) {
    const next = (match.index ?? 0) + match[0].length;
    if (next <= localCaret) start = next;
    else {
      end = (match.index ?? 0) + match[0].trimEnd().length;
      break;
    }
  }
  while (start < end && /\s/u.test(paragraph.text[start] ?? "")) start += 1;
  while (end > start && /\s/u.test(paragraph.text[end - 1] ?? "")) end -= 1;
  return target(source, paragraph.start + start, paragraph.start + end, "sentence");
}

function paragraphTarget(source: string, caret: number): ResolvedAssistantTarget {
  const before = source.slice(0, caret);
  const after = source.slice(caret);
  const previousBreak = before.search(/\n\s*\n(?![\s\S]*\n\s*\n)/u);
  const nextBreak = after.search(/\n\s*\n/u);
  let start = previousBreak < 0 ? 0 : previousBreak + (before.slice(previousBreak).match(/^\n\s*\n/u)?.[0].length ?? 0);
  let end = nextBreak < 0 ? source.length : caret + nextBreak;
  while (start < end && /\s/u.test(source[start] ?? "")) start += 1;
  while (end > start && /\s/u.test(source[end - 1] ?? "")) end -= 1;
  return target(source, start, end, "paragraph");
}

function sectionTarget(source: string, caret: number): ResolvedAssistantTarget {
  const headings = [...source.matchAll(/^ {0,3}(#{1,6})\s+.+$/gmu)].map((match) => ({
    start: match.index ?? 0,
    level: match[1]?.length ?? 6,
  }));
  let headingIndex = -1;
  for (let index = 0; index < headings.length; index += 1) {
    if ((headings[index]?.start ?? source.length) <= caret) headingIndex = index;
    else break;
  }
  if (headingIndex < 0) {
    const firstHeading = headings[0]?.start ?? source.length;
    return target(source, 0, firstHeading, "section");
  }
  const heading = headings[headingIndex];
  if (!heading) return target(source, 0, source.length, "section");
  const next = headings.slice(headingIndex + 1).find((candidate) => candidate.level <= heading.level);
  let end = next?.start ?? source.length;
  while (end > heading.start && /\s/u.test(source[end - 1] ?? "")) end -= 1;
  return target(source, heading.start, end, "section");
}

function target(source: string, start: number, end: number, scope: AssistantTargetScope): ResolvedAssistantTarget {
  return { start, end, text: source.slice(start, end), scope };
}

function clampIndex(value: number, length: number): number {
  return Math.min(Math.max(Number.isFinite(value) ? Math.trunc(value) : 0, 0), length);
}
