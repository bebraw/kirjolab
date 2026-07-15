import {
  RESEARCH_ASSISTANT_KEY,
  RESEARCH_LIBRARY_KEY,
  RESEARCH_PREVIEW_KEY,
  type ResearchContextKey,
  type ResearchResourceKind,
  type ResearchResourceTarget,
} from "./research-context";

export type WorkspaceRail = "files" | "research" | "comments";
export type AuthoringMode = "write" | "map";
export type WorkspaceSurface = "authoring" | "context";
export type WorkspaceLayout = "split" | "editor" | "context" | "pdf";

export interface WorkspaceUiRouteState {
  readonly fileId?: string;
  readonly rail: WorkspaceRail;
  readonly mode: AuthoringMode;
  readonly surface: WorkspaceSurface;
  readonly layout?: WorkspaceLayout;
  readonly contextKey: ResearchContextKey;
  readonly page?: number;
  readonly annotationId?: string;
}

const ownedParameters = ["file", "rail", "mode", "surface", "layout", "context", "page", "annotation"] as const;
const resourceKinds = new Set<ResearchResourceKind>(["publication", "pdf", "library-pdf", "candidate"]);

export function readWorkspaceUiRoute(url: URL): WorkspaceUiRouteState {
  const parameters = url.searchParams;
  const contextKey = readContextKey(parameters.get("context")) ?? RESEARCH_PREVIEW_KEY;
  const pdfContext = contextKey.startsWith("pdf:") || contextKey.startsWith("library-pdf:");
  const fileId = readIdentifier(parameters.get("file"));
  const layout = readChoice(parameters.get("layout"), ["split", "editor", "context", "pdf"], undefined);
  const page = pdfContext ? readPage(parameters.get("page")) : undefined;
  const annotationId = contextKey.startsWith("pdf:") ? readIdentifier(parameters.get("annotation")) : null;
  return {
    ...(fileId ? { fileId } : {}),
    rail: readChoice(parameters.get("rail"), ["files", "research", "comments"], "files"),
    mode: readChoice(parameters.get("mode"), ["write", "map"], "write"),
    surface: readChoice(parameters.get("surface"), ["authoring", "context"], "authoring"),
    ...(layout ? { layout } : {}),
    contextKey,
    ...(page ? { page } : {}),
    ...(annotationId ? { annotationId } : {}),
  };
}

export function workspaceUiRouteUrl(current: URL, state: WorkspaceUiRouteState): string {
  const next = new URL(current);
  for (const parameter of ownedParameters) next.searchParams.delete(parameter);
  if (state.fileId) next.searchParams.set("file", state.fileId);
  if (state.rail !== "files") next.searchParams.set("rail", state.rail);
  if (state.mode !== "write") next.searchParams.set("mode", state.mode);
  if (state.surface !== "authoring") next.searchParams.set("surface", state.surface);
  if (state.layout && state.layout !== "split") next.searchParams.set("layout", state.layout);
  if (state.contextKey !== RESEARCH_PREVIEW_KEY) next.searchParams.set("context", state.contextKey);
  if (state.page && state.page > 1 && isPdfContext(state.contextKey)) next.searchParams.set("page", String(state.page));
  if (state.annotationId && state.contextKey.startsWith("pdf:")) next.searchParams.set("annotation", state.annotationId);
  return `${next.pathname}${next.search}${next.hash}`;
}

export function researchTargetFromContextKey(key: ResearchContextKey): ResearchResourceTarget | null {
  if (key === RESEARCH_PREVIEW_KEY || key === RESEARCH_LIBRARY_KEY || key === RESEARCH_ASSISTANT_KEY) return null;
  const separator = key.indexOf(":");
  const kind = key.slice(0, separator) as ResearchResourceKind;
  return { kind, id: key.slice(separator + 1) };
}

function readContextKey(value: string | null): ResearchContextKey | null {
  if (value === RESEARCH_PREVIEW_KEY || value === RESEARCH_LIBRARY_KEY || value === RESEARCH_ASSISTANT_KEY) return value;
  if (!value || value.length > 160) return null;
  const separator = value.indexOf(":");
  const kind = value.slice(0, separator) as ResearchResourceKind;
  const id = readIdentifier(value.slice(separator + 1));
  return resourceKinds.has(kind) && id ? `${kind}:${id}` : null;
}

function readIdentifier(value: string | null): string | null {
  return value && value.length <= 128 && !hasControlCharacter(value) ? value : null;
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
}

function readPage(value: string | null): number | undefined {
  if (!value || !/^\d{1,6}$/u.test(value)) return undefined;
  const page = Number.parseInt(value, 10);
  return page > 0 ? page : undefined;
}

function readChoice<const Value extends string, const Fallback extends Value | undefined>(
  value: string | null,
  choices: readonly Value[],
  fallback: Fallback,
): Value | Fallback {
  return choices.includes(value as Value) ? (value as Value) : fallback;
}

function isPdfContext(key: ResearchContextKey): boolean {
  return key.startsWith("pdf:") || key.startsWith("library-pdf:");
}
