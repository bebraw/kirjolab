export const RESEARCH_PREVIEW_KEY = "preview" as const;
export const RESEARCH_LIBRARY_KEY = "library" as const;
export const RESEARCH_ASSISTANT_KEY = "assistant" as const;

export type ResearchResourceKind = "publication" | "pdf" | "candidate";
export type ResearchResourceKey = `${ResearchResourceKind}:${string}`;
export type ResearchContextKey =
  | typeof RESEARCH_PREVIEW_KEY
  | typeof RESEARCH_LIBRARY_KEY
  | typeof RESEARCH_ASSISTANT_KEY
  | ResearchResourceKey;

export interface ResearchResourceTarget {
  readonly kind: ResearchResourceKind;
  readonly id: string;
}

export interface PreviewResearchTab {
  readonly kind: "preview";
  readonly key: typeof RESEARCH_PREVIEW_KEY;
  readonly scrollTop: number;
}

export interface LibraryResearchTab {
  readonly kind: "library";
  readonly key: typeof RESEARCH_LIBRARY_KEY;
  readonly scrollTop: number;
}

export interface AssistantResearchTab {
  readonly kind: "assistant";
  readonly key: typeof RESEARCH_ASSISTANT_KEY;
  readonly scrollTop: number;
}

interface ResourceResearchTab {
  readonly id: string;
  readonly key: ResearchResourceKey;
  readonly pinned: boolean;
  readonly scrollTop: number;
}

export interface PublicationResearchTab extends ResourceResearchTab {
  readonly kind: "publication";
}

export interface CandidateResearchTab extends ResourceResearchTab {
  readonly kind: "candidate";
}

export interface PdfResearchTab extends ResourceResearchTab {
  readonly kind: "pdf";
  readonly page: number;
  readonly focusedAnnotationId: string | null;
}

export type ResearchResourceTab = PublicationResearchTab | PdfResearchTab | CandidateResearchTab;
export type ResearchContextTab = PreviewResearchTab | LibraryResearchTab | AssistantResearchTab | ResearchResourceTab;

export interface ResearchContextState {
  readonly activeKey: ResearchContextKey;
  /** Preview, Library, and Writing assistant are always first, followed by pinned tabs and at most one unpinned tab. */
  readonly tabs: readonly ResearchContextTab[];
}

export interface ResearchContextAuthorization {
  readonly publicationIds: ReadonlySet<string>;
  readonly pdfIds: ReadonlySet<string>;
  readonly candidateIds: ReadonlySet<string>;
}

export interface PdfResearchLocation {
  readonly page?: number;
  readonly focusedAnnotationId?: string | null;
}

export function createResearchContext(): ResearchContextState {
  return {
    activeKey: RESEARCH_PREVIEW_KEY,
    tabs: [
      { kind: "preview", key: RESEARCH_PREVIEW_KEY, scrollTop: 0 },
      { kind: "library", key: RESEARCH_LIBRARY_KEY, scrollTop: 0 },
      { kind: "assistant", key: RESEARCH_ASSISTANT_KEY, scrollTop: 0 },
    ],
  };
}

export function researchResourceKey(target: ResearchResourceTarget): ResearchResourceKey {
  return `${target.kind}:${target.id}`;
}

export function openResearchResource(state: ResearchContextState, target: ResearchResourceTarget): ResearchContextState {
  const key = researchResourceKey(target);
  const existing = state.tabs.find((tab) => tab.key === key);
  if (existing) return state.activeKey === key ? state : { ...state, activeKey: key };

  const pinnedTabs = state.tabs.filter((tab) => isPermanentTab(tab) || tab.pinned);
  return {
    activeKey: key,
    tabs: [...pinnedTabs, createResourceTab(target, key)],
  };
}

export function activateResearchTab(state: ResearchContextState, key: string): ResearchContextState {
  const target = state.tabs.find((tab) => tab.key === key);
  if (!target || state.activeKey === target.key) return state;
  return { ...state, activeKey: target.key };
}

export function setResearchTabPinned(state: ResearchContextState, key: string, pinned: boolean): ResearchContextState {
  const targetIndex = state.tabs.findIndex((tab) => tab.key === key);
  const target = state.tabs[targetIndex];
  if (!target || isPermanentTab(target) || target.pinned === pinned) return state;

  if (pinned) {
    return {
      ...state,
      tabs: replaceTab(state.tabs, targetIndex, { ...target, pinned: true }),
    };
  }

  const replaceableTab = state.tabs.find((tab) => !isPermanentTab(tab) && !tab.pinned);
  const replacedActiveTab = replaceableTab?.key === state.activeKey;
  const retainedTabs = state.tabs.filter((tab) => isPermanentTab(tab) || (tab.pinned && tab.key !== key));
  const unpinnedTarget = { ...target, pinned: false };
  return {
    activeKey: replacedActiveTab ? unpinnedTarget.key : state.activeKey,
    tabs: [...retainedTabs, unpinnedTarget],
  };
}

export function closeResearchTab(state: ResearchContextState, key: string): ResearchContextState {
  const index = state.tabs.findIndex((tab) => tab.key === key);
  const target = state.tabs[index];
  if (!target || isPermanentTab(target)) return state;

  const tabs = state.tabs.filter((tab) => tab.key !== key);
  return {
    // A resource tab always has Preview or another resource immediately before it.
    activeKey: state.activeKey === key ? state.tabs[index - 1]!.key : state.activeKey,
    tabs,
  };
}

export function setResearchTabScroll(state: ResearchContextState, key: string, scrollTop: number): ResearchContextState {
  const normalizedScrollTop = normalizeScrollTop(scrollTop);
  const targetIndex = state.tabs.findIndex((tab) => tab.key === key);
  const target = state.tabs[targetIndex];
  if (!target || target.scrollTop === normalizedScrollTop) return state;
  return {
    ...state,
    tabs: replaceTab(state.tabs, targetIndex, { ...target, scrollTop: normalizedScrollTop }),
  };
}

export function setPdfResearchLocation(state: ResearchContextState, key: string, location: PdfResearchLocation): ResearchContextState {
  const targetIndex = state.tabs.findIndex((tab) => tab.key === key);
  const target = state.tabs[targetIndex];
  if (!target || target.kind !== "pdf") return state;

  const page = location.page === undefined ? target.page : normalizePage(location.page);
  const focusedAnnotationId = location.focusedAnnotationId === undefined ? target.focusedAnnotationId : location.focusedAnnotationId;
  if (target.page === page && target.focusedAnnotationId === focusedAnnotationId) return state;

  return {
    ...state,
    tabs: replaceTab(state.tabs, targetIndex, { ...target, page, focusedAnnotationId }),
  };
}

export function reconcileResearchContext(state: ResearchContextState, authorization: ResearchContextAuthorization): ResearchContextState {
  const tabs = state.tabs.filter((tab) => isAuthorized(tab, authorization));
  if (tabs.length === state.tabs.length) return state;

  return {
    activeKey: tabs.some((tab) => tab.key === state.activeKey) ? state.activeKey : RESEARCH_PREVIEW_KEY,
    tabs,
  };
}

function createResourceTab(target: ResearchResourceTarget, key: ResearchResourceKey): ResearchResourceTab {
  const common = { id: target.id, key, pinned: false, scrollTop: 0 };
  if (target.kind === "pdf") return { ...common, kind: "pdf", page: 1, focusedAnnotationId: null };
  return target.kind === "publication" ? { ...common, kind: "publication" } : { ...common, kind: "candidate" };
}

function replaceTab(tabs: readonly ResearchContextTab[], index: number, replacement: ResearchContextTab): readonly ResearchContextTab[] {
  return [...tabs.slice(0, index), replacement, ...tabs.slice(index + 1)];
}

function normalizeScrollTop(scrollTop: number): number {
  return Number.isFinite(scrollTop) ? Math.max(0, scrollTop) : 0;
}

function normalizePage(page: number): number {
  return Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1;
}

function isAuthorized(tab: ResearchContextTab, authorization: ResearchContextAuthorization): boolean {
  if (isPermanentTab(tab)) return true;
  if (tab.kind === "publication") return authorization.publicationIds.has(tab.id);
  return tab.kind === "pdf" ? authorization.pdfIds.has(tab.id) : authorization.candidateIds.has(tab.id);
}

function isPermanentTab(tab: ResearchContextTab): tab is PreviewResearchTab | LibraryResearchTab | AssistantResearchTab {
  return tab.kind === "preview" || tab.kind === "library" || tab.kind === "assistant";
}
