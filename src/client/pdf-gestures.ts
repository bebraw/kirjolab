export interface PdfWheelPagingState {
  distance: number;
  lastAt: number;
  lockedUntil: number;
}

export interface PdfWheelPagingResult {
  state: PdfWheelPagingState;
  consumed: boolean;
  direction?: -1 | 1;
}

export interface PdfTouchPanStart {
  x: number;
  y: number;
  scrollLeft: number;
  scrollTop: number;
}

export interface PdfHorizontalPageEdges {
  previous: boolean;
  next: boolean;
}

export interface PdfZoomAnchor {
  x: number;
  y: number;
  clientX: number;
  clientY: number;
}

const GESTURE_GAP_MS = 180;
const PAGE_COOLDOWN_MS = 420;
const PAGE_THRESHOLD_PX = 64;
const HORIZONTAL_DOMINANCE = 1.25;
const TOUCH_PAGE_THRESHOLD_PX = 54;
const TOUCH_PAGE_MAXIMUM_MS = 700;
const TOUCH_HORIZONTAL_DOMINANCE = 1.4;

export function initialPdfWheelPagingState(): PdfWheelPagingState {
  return { distance: 0, lastAt: 0, lockedUntil: 0 };
}

export function pdfTouchPanScroll(start: PdfTouchPanStart, point: { x: number; y: number }): { left: number; top: number } {
  return {
    left: start.scrollLeft - (point.x - start.x),
    top: start.scrollTop - (point.y - start.y),
  };
}

export function pdfTouchPageDirection(
  start: { x: number; y: number; startedAt: number },
  end: { x: number; y: number; endedAt: number },
  zoom: number,
  edges?: PdfHorizontalPageEdges,
): -1 | 1 | undefined {
  if (end.endedAt - start.startedAt > TOUCH_PAGE_MAXIMUM_MS) return undefined;
  const x = end.x - start.x;
  const y = end.y - start.y;
  if (Math.abs(x) < TOUCH_PAGE_THRESHOLD_PX || Math.abs(x) < Math.abs(y) * TOUCH_HORIZONTAL_DOMINANCE) return undefined;
  const direction = x < 0 ? 1 : -1;
  if (zoom > 1.01 && !(direction === -1 ? edges?.previous : edges?.next)) return undefined;
  return direction;
}

export function pdfHorizontalPageEdges(
  scroll: { scrollLeft: number; scrollWidth: number; clientWidth: number },
  epsilon = 1,
): PdfHorizontalPageEdges {
  const maximum = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
  return {
    previous: scroll.scrollLeft <= epsilon,
    next: scroll.scrollLeft >= maximum - epsilon,
  };
}

export function pdfZoomAnchor(
  rect: { left: number; top: number; width: number; height: number },
  point: { x: number; y: number },
): PdfZoomAnchor {
  return {
    x: clampUnit((point.x - rect.left) / Math.max(1, rect.width)),
    y: clampUnit((point.y - rect.top) / Math.max(1, rect.height)),
    clientX: point.x,
    clientY: point.y,
  };
}

export function pdfZoomScrollCorrection(
  anchor: PdfZoomAnchor,
  rect: { left: number; top: number; width: number; height: number },
): { left: number; top: number } {
  return {
    left: rect.left + anchor.x * rect.width - anchor.clientX,
    top: rect.top + anchor.y * rect.height - anchor.clientY,
  };
}

export function advancePdfWheelPaging(
  state: PdfWheelPagingState,
  input: { deltaX: number; deltaY: number; deltaMode: number; now: number },
): PdfWheelPagingResult {
  const scale = input.deltaMode === 1 ? 16 : input.deltaMode === 2 ? 100 : 1;
  const deltaX = input.deltaX * scale;
  const deltaY = input.deltaY * scale;
  const horizontal = Math.abs(deltaX) >= 2 && Math.abs(deltaX) > Math.abs(deltaY) * HORIZONTAL_DOMINANCE;
  if (!horizontal) {
    return { state: { distance: 0, lastAt: 0, lockedUntil: state.lockedUntil }, consumed: false };
  }
  if (input.now < state.lockedUntil) {
    return { state: { distance: 0, lastAt: input.now, lockedUntil: state.lockedUntil }, consumed: true };
  }
  const continuesGesture = input.now - state.lastAt <= GESTURE_GAP_MS && Math.sign(state.distance) === Math.sign(deltaX);
  const distance = continuesGesture ? state.distance + deltaX : deltaX;
  if (Math.abs(distance) < PAGE_THRESHOLD_PX) {
    return { state: { distance, lastAt: input.now, lockedUntil: state.lockedUntil }, consumed: true };
  }
  return {
    state: { distance: 0, lastAt: input.now, lockedUntil: input.now + PAGE_COOLDOWN_MS },
    consumed: true,
    direction: distance > 0 ? 1 : -1,
  };
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}
