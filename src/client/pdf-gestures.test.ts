import { describe, expect, it } from "vitest";
import { advancePdfWheelPaging, initialPdfWheelPagingState, pdfTouchPanScroll } from "./pdf-gestures";

describe("PDF touch panning", () => {
  it("moves the scroll position opposite the finger movement", () => {
    expect(pdfTouchPanScroll({ x: 100, y: 120, scrollLeft: 40, scrollTop: 60 }, { x: 75, y: 90 })).toEqual({
      left: 65,
      top: 90,
    });
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
