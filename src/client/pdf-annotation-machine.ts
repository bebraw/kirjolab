import { assertEvent, assign, createActor, setup, type ActorRefFrom, type SnapshotFrom } from "xstate";
import type { LibraryPdfPoint } from "../domain/reference-library";

export type PdfAnnotationTool = "select" | "text" | "note" | "draw";

export interface PdfAnnotationNoteDraft {
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly editingId: string | null;
}

export interface PdfAnnotationDrawingDraft {
  readonly pointerId: number;
  readonly points: readonly LibraryPdfPoint[];
}

export interface PdfAnnotationNoteDrag {
  readonly id: string;
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly moved: boolean;
}

interface PdfAnnotationContext {
  readonly selectedHighlightId: string | null;
  readonly selectedMarkupId: string | null;
  readonly note: PdfAnnotationNoteDraft | null;
  readonly drawing: PdfAnnotationDrawingDraft | null;
  readonly noteDrag: PdfAnnotationNoteDrag | null;
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
  | { readonly type: "START_NOTE_DRAG"; readonly id: string; readonly pointerId: number; readonly x: number; readonly y: number }
  | { readonly type: "MOVE_NOTE_DRAG"; readonly pointerId: number; readonly x: number; readonly y: number }
  | { readonly type: "FINISH_NOTE_DRAG"; readonly pointerId: number }
  | { readonly type: "START_DRAWING"; readonly pointerId: number; readonly point: LibraryPdfPoint }
  | { readonly type: "ADD_DRAWING_POINTS"; readonly pointerId: number; readonly points: readonly LibraryPdfPoint[] }
  | { readonly type: "FINISH_DRAWING"; readonly pointerId: number }
  | { readonly type: "CANCEL_POINTER" };

const initialContext: PdfAnnotationContext = {
  selectedHighlightId: null,
  selectedMarkupId: null,
  note: null,
  drawing: null,
  noteDrag: null,
};

export const pdfAnnotationMachine = setup({
  types: {
    context: {} as PdfAnnotationContext,
    events: {} as PdfAnnotationEvent,
  },
  guards: {
    usesDrawingPointer: ({ context, event }) => {
      assertEvent(event, ["ADD_DRAWING_POINTS", "FINISH_DRAWING"]);
      return context.drawing?.pointerId === event.pointerId;
    },
    usesNotePointer: ({ context, event }) => {
      assertEvent(event, ["MOVE_NOTE_DRAG", "FINISH_NOTE_DRAG"]);
      return context.noteDrag?.pointerId === event.pointerId;
    },
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
        note: { page: event.page, ...event.point, editingId: event.id },
        drawing: null,
        noteDrag: null,
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
    startNoteDrag: assign(({ event }) => {
      assertEvent(event, "START_NOTE_DRAG");
      return {
        selectedHighlightId: null,
        selectedMarkupId: event.id,
        noteDrag: { id: event.id, pointerId: event.pointerId, startX: event.x, startY: event.y, moved: false },
      };
    }),
    moveNoteDrag: assign(({ context, event }) => {
      assertEvent(event, "MOVE_NOTE_DRAG");
      if (!context.noteDrag) return {};
      return {
        noteDrag: {
          ...context.noteDrag,
          moved: context.noteDrag.moved || Math.hypot(event.x - context.noteDrag.startX, event.y - context.noteDrag.startY) > 5,
        },
      };
    }),
    clearNoteDrag: assign({ noteDrag: null }),
    startDrawing: assign(({ event }) => {
      assertEvent(event, "START_DRAWING");
      return { drawing: { pointerId: event.pointerId, points: [event.point] } };
    }),
    addDrawingPoints: assign(({ context, event }) => {
      assertEvent(event, "ADD_DRAWING_POINTS");
      if (!context.drawing || event.points.length === 0) return {};
      return { drawing: { ...context.drawing, points: [...context.drawing.points, ...event.points] } };
    }),
    clearDrawing: assign({ drawing: null }),
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
  },
  states: {
    selectIdle: {
      on: {
        SELECT_HIGHLIGHT: { actions: "selectHighlight" },
        SELECT_MARKUP: { actions: "selectMarkup" },
        START_NOTE_DRAG: { target: "draggingNote", actions: "startNoteDrag" },
      },
    },
    draggingNote: {
      on: {
        MOVE_NOTE_DRAG: { guard: "usesNotePointer", actions: "moveNoteDrag" },
        FINISH_NOTE_DRAG: { guard: "usesNotePointer", target: "selectIdle", actions: "clearNoteDrag" },
        CANCEL_POINTER: { target: "selectIdle", actions: "clearNoteDrag" },
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
    drawIdle: {
      on: {
        START_DRAWING: { target: "drawing", actions: "startDrawing" },
      },
    },
    drawing: {
      on: {
        ADD_DRAWING_POINTS: { guard: "usesDrawingPointer", actions: "addDrawingPoints" },
        FINISH_DRAWING: { guard: "usesDrawingPointer", target: "drawIdle", actions: "clearDrawing" },
        CANCEL_POINTER: { target: "drawIdle", actions: "clearDrawing" },
      },
    },
  },
});

export type PdfAnnotationActor = ActorRefFrom<typeof pdfAnnotationMachine>;
export type PdfAnnotationSnapshot = SnapshotFrom<typeof pdfAnnotationMachine>;

export function createPdfAnnotationActor(): PdfAnnotationActor {
  return createActor(pdfAnnotationMachine).start();
}

export function pdfAnnotationTool(snapshot: PdfAnnotationSnapshot): PdfAnnotationTool {
  if (snapshot.value === "selectIdle" || snapshot.value === "draggingNote" || snapshot.value === "editingNote") return "select";
  if (snapshot.value === "noteIdle" || snapshot.value === "composingNote") return "note";
  return snapshot.value === "drawIdle" || snapshot.value === "drawing" ? "draw" : "text";
}
