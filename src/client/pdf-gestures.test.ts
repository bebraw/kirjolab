import { describe, expect, it } from "vitest";
import {
  advancePdfWheelPaging,
  initialPdfWheelPagingState,
  pdfHorizontalPageEdges,
  pdfTouchPageDirection,
  pdfTouchPanScroll,
  pdfZoomAnchor,
  pdfZoomScrollCorrection,
} from "./pdf-gestures";

describe("PDF touch panning", () => {
  it("moves the scroll position opposite the finger movement", () => {
    expect(pdfTouchPanScroll({ x: 100, y: 120, scrollLeft: 40, scrollTop: 60 }, { x: 75, y: 90 })).toEqual({
      left: 65,
      top: 90,
    });
  });
});

describe("PDF touch paging", () => {
  it("turns pages for quick horizontal swipes across an unzoomed page", () => {
    const start = { x: 200, y: 100, startedAt: 100 };
    expect(pdfTouchPageDirection(start, { x: 120, y: 110, endedAt: 300 }, 1)).toBe(1);
    expect(pdfTouchPageDirection(start, { x: 280, y: 90, endedAt: 300 }, 1)).toBe(-1);
  });

  it("leaves vertical, slow, short, and interior zoomed gestures to scrolling", () => {
    const start = { x: 200, y: 100, startedAt: 100 };
    expect(pdfTouchPageDirection(start, { x: 190, y: 180, endedAt: 300 }, 1)).toBeUndefined();
    expect(pdfTouchPageDirection(start, { x: 150, y: 100, endedAt: 300 }, 1)).toBeUndefined();
    expect(pdfTouchPageDirection(start, { x: 120, y: 100, endedAt: 900 }, 1)).toBeUndefined();
    expect(pdfTouchPageDirection(start, { x: 120, y: 100, endedAt: 300 }, 1.25)).toBeUndefined();
  });

  it("turns zoomed pages only from the corresponding horizontal edge", () => {
    const start = { x: 200, y: 100, startedAt: 100 };
    const previousEdge = { previous: true, next: false };
    const nextEdge = { previous: false, next: true };

    expect(pdfTouchPageDirection(start, { x: 120, y: 100, endedAt: 300 }, 2, nextEdge)).toBe(1);
    expect(pdfTouchPageDirection(start, { x: 280, y: 100, endedAt: 300 }, 2, previousEdge)).toBe(-1);
    expect(pdfTouchPageDirection(start, { x: 120, y: 100, endedAt: 300 }, 2, previousEdge)).toBeUndefined();
    expect(pdfTouchPageDirection(start, { x: 280, y: 100, endedAt: 300 }, 2, nextEdge)).toBeUndefined();
  });
});

describe("PDF horizontal page edges", () => {
  it("recognizes fitted pages and the start, interior, and end of zoomed pages", () => {
    expect(pdfHorizontalPageEdges({ scrollLeft: 0, scrollWidth: 600, clientWidth: 600 })).toEqual({
      previous: true,
      next: true,
    });
    expect(pdfHorizontalPageEdges({ scrollLeft: 0, scrollWidth: 1_200, clientWidth: 600 })).toEqual({
      previous: true,
      next: false,
    });
    expect(pdfHorizontalPageEdges({ scrollLeft: 300, scrollWidth: 1_200, clientWidth: 600 })).toEqual({
      previous: false,
      next: false,
    });
    expect(pdfHorizontalPageEdges({ scrollLeft: 600, scrollWidth: 1_200, clientWidth: 600 })).toEqual({
      previous: false,
      next: true,
    });
  });
});

describe("PDF anchored zoom", () => {
  it("normalizes the gesture point and corrects committed layout around it", () => {
    const anchor = pdfZoomAnchor({ left: 100, top: 50, width: 400, height: 800 }, { x: 200, y: 250 });
    expect(anchor).toEqual({ x: 0.25, y: 0.25, clientX: 200, clientY: 250 });
    expect(pdfZoomScrollCorrection(anchor, { left: 80, top: 20, width: 800, height: 1600 })).toEqual({ left: 80, top: 170 });
  });

  it("clamps an anchor to the visible page", () => {
    expect(pdfZoomAnchor({ left: 100, top: 100, width: 200, height: 200 }, { x: 50, y: 400 })).toMatchObject({ x: 0, y: 1 });
  });
});

describe("PDF trackpad paging", () => {
  it("accumulates a horizontal gesture into one page turn", () => {
    const first = advancePdfWheelPaging(initialPdfWheelPagingState(), {
      deltaX: 24,
      deltaY: 3,
      deltaMode: 0,
      now: 100,
    });
    const second = advancePdfWheelPaging(first.state, { deltaX: 42, deltaY: 2, deltaMode: 0, now: 130 });

    expect(first.consumed).toBe(true);
    expect(first.direction).toBeUndefined();
    expect(second).toMatchObject({ consumed: true, direction: 1 });
    expect(advancePdfWheelPaging(initialPdfWheelPagingState(), { deltaX: -70, deltaY: 0, deltaMode: 0, now: 100 })).toMatchObject({
      consumed: true,
      direction: -1,
    });
  });

  it("ignores vertical scrolling and resets stale or reversed movement", () => {
    const vertical = advancePdfWheelPaging(initialPdfWheelPagingState(), {
      deltaX: 8,
      deltaY: 40,
      deltaMode: 0,
      now: 100,
    });
    const partial = advancePdfWheelPaging(initialPdfWheelPagingState(), {
      deltaX: 40,
      deltaY: 0,
      deltaMode: 0,
      now: 100,
    });

    expect(vertical).toEqual({ state: initialPdfWheelPagingState(), consumed: false });
    const reversed = advancePdfWheelPaging(partial.state, { deltaX: -30, deltaY: 0, deltaMode: 0, now: 120 });
    const stale = advancePdfWheelPaging(partial.state, { deltaX: 30, deltaY: 0, deltaMode: 0, now: 400 });
    expect(reversed.state.distance).toBe(-30);
    expect(reversed.direction).toBeUndefined();
    expect(stale.state.distance).toBe(30);
    expect(stale.direction).toBeUndefined();
  });

  it("consumes inertial movement during the page cooldown", () => {
    const turn = advancePdfWheelPaging(initialPdfWheelPagingState(), {
      deltaX: 5,
      deltaY: 0,
      deltaMode: 1,
      now: 100,
    });
    const inertia = advancePdfWheelPaging(turn.state, { deltaX: 90, deltaY: 0, deltaMode: 0, now: 200 });
    const nextGesture = advancePdfWheelPaging(inertia.state, { deltaX: -70, deltaY: 0, deltaMode: 0, now: 600 });

    expect(turn.direction).toBe(1);
    expect(inertia.consumed).toBe(true);
    expect(inertia.direction).toBeUndefined();
    expect(nextGesture.direction).toBe(-1);
  });
});
