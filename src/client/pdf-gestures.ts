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

const GESTURE_GAP_MS = 180;
const PAGE_COOLDOWN_MS = 420;
const PAGE_THRESHOLD_PX = 64;
const HORIZONTAL_DOMINANCE = 1.25;

export function initialPdfWheelPagingState(): PdfWheelPagingState {
  return { distance: 0, lastAt: 0, lockedUntil: 0 };
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
