import { assertEvent, assign, createActor, setup, type ActorRefFrom, type SnapshotFrom } from "xstate";
import type { LibraryPdfPoint } from "../domain/reference-library";

export type PdfAnnotationTool = "select" | "text" | "note" | "draw";

interface PdfAnnotationNoteDraft {
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly editingId: string | null;
}

interface PdfAnnotationContext {
  readonly selectedHighlightId: string | null;
  readonly selectedMarkupId: string | null;
  readonly openNoteId: string | null;
  readonly note: PdfAnnotationNoteDraft | null;
}

type PdfAnnotationEvent =
  | { readonly type: "CHOOSE_TOOL"; readonly tool: PdfAnnotationTool }
  | { readonly type: "RESET" }
  | { readonly type: "PLACE_NOTE"; readonly page: number; readonly point: LibraryPdfPoint }
  | { readonly type: "EDIT_NOTE"; readonly id: string; readonly page: number; readonly point: LibraryPdfPoint }
  | { readonly type: "CANCEL_NOTE" }
  | { readonly type: "NOTE_SAVED" }
  | { readonly type: "SELECT_HIGHLIGHT"; readonly id: string }
  | { readonly type: "SELECT_MARKUP"; readonly id: string }
  | { readonly type: "CLEAR_SELECTION" }
  | { readonly type: "TOGGLE_NOTE_CARD"; readonly id: string }
  | { readonly type: "CLOSE_NOTE_CARD" };

const initialContext: PdfAnnotationContext = {
  selectedHighlightId: null,
  selectedMarkupId: null,
  openNoteId: null,
  note: null,
};

const pdfAnnotationMachine = setup({
  types: {
    context: {} as PdfAnnotationContext,
    events: {} as PdfAnnotationEvent,
  },
  actions: {
    resetInteraction: assign(() => initialContext),
    placeNote: assign(({ event }) => {
      assertEvent(event, "PLACE_NOTE");
      return { note: { page: event.page, ...event.point, editingId: null } };
    }),
    editNote: assign(({ event }) => {
      assertEvent(event, "EDIT_NOTE");
      return {
        selectedHighlightId: null,
        selectedMarkupId: event.id,
        openNoteId: null,
        note: { page: event.page, ...event.point, editingId: event.id },
      };
    }),
    clearNote: assign({ note: null }),
    selectHighlight: assign(({ event }) => {
      assertEvent(event, "SELECT_HIGHLIGHT");
      return { selectedHighlightId: event.id, selectedMarkupId: null };
    }),
    selectMarkup: assign(({ event }) => {
      assertEvent(event, "SELECT_MARKUP");
      return { selectedHighlightId: null, selectedMarkupId: event.id };
    }),
    clearSelection: assign({ selectedHighlightId: null, selectedMarkupId: null }),
    toggleNoteCard: assign(({ context, event }) => {
      assertEvent(event, "TOGGLE_NOTE_CARD");
      return { openNoteId: context.openNoteId === event.id ? null : event.id };
    }),
    closeNoteCard: assign({ openNoteId: null }),
  },
}).createMachine({
  id: "pdfAnnotation",
  initial: "text",
  context: initialContext,
  on: {
    RESET: { target: ".text", actions: "resetInteraction" },
    CHOOSE_TOOL: [
      { guard: ({ event }) => event.tool === "select", target: ".selectIdle", actions: "resetInteraction" },
      { guard: ({ event }) => event.tool === "text", target: ".text", actions: "resetInteraction" },
      { guard: ({ event }) => event.tool === "note", target: ".noteIdle", actions: "resetInteraction" },
      { guard: ({ event }) => event.tool === "draw", target: ".drawIdle", actions: "resetInteraction" },
    ],
    EDIT_NOTE: { target: ".editingNote", actions: "editNote" },
    CLEAR_SELECTION: { actions: "clearSelection" },
    TOGGLE_NOTE_CARD: { actions: "toggleNoteCard" },
    CLOSE_NOTE_CARD: { actions: "closeNoteCard" },
  },
  states: {
    selectIdle: {
      on: {
        SELECT_HIGHLIGHT: { actions: "selectHighlight" },
        SELECT_MARKUP: { actions: "selectMarkup" },
      },
    },
    editingNote: {
      on: {
        CANCEL_NOTE: { target: "selectIdle", actions: "clearNote" },
        NOTE_SAVED: { target: "selectIdle", actions: "clearNote" },
      },
    },
    text: {},
    noteIdle: {
      on: {
        PLACE_NOTE: { target: "composingNote", actions: "placeNote" },
      },
    },
    composingNote: {
      on: {
        CANCEL_NOTE: { target: "noteIdle", actions: "clearNote" },
        NOTE_SAVED: { target: "noteIdle", actions: "clearNote" },
      },
    },
    drawIdle: {},
  },
});

export type PdfAnnotationActor = ActorRefFrom<typeof pdfAnnotationMachine>;
export type PdfAnnotationSnapshot = SnapshotFrom<typeof pdfAnnotationMachine>;

export function createPdfAnnotationActor(): PdfAnnotationActor {
  return createActor(pdfAnnotationMachine).start();
}

export function pdfAnnotationTool(snapshot: PdfAnnotationSnapshot): PdfAnnotationTool {
  if (snapshot.value === "selectIdle" || snapshot.value === "editingNote") return "select";
  if (snapshot.value === "noteIdle" || snapshot.value === "composingNote") return "note";
  return snapshot.value === "drawIdle" ? "draw" : "text";
}
