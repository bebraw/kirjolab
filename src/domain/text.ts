export interface TextSplice {
  start: number;
  deleteCount: number;
  insert: string;
}

export function calculateTextSplice(previous: string, next: string): TextSplice | null {
  if (previous === next) return null;
  let start = 0;
  while (start < previous.length && start < next.length) {
    const previousPoint = previous.codePointAt(start);
    const nextPoint = next.codePointAt(start);
    if (previousPoint !== nextPoint) break;
    start += previousPoint !== undefined && previousPoint > 0xff_ff ? 2 : 1;
  }
  let previousEnd = previous.length;
  let nextEnd = next.length;
  while (previousEnd > start && nextEnd > start) {
    const previousPointStart = codePointStartBefore(previous, previousEnd);
    const nextPointStart = codePointStartBefore(next, nextEnd);
    if (previous.slice(previousPointStart, previousEnd) !== next.slice(nextPointStart, nextEnd)) break;
    previousEnd = previousPointStart;
    nextEnd = nextPointStart;
  }
  return { start, deleteCount: previousEnd - start, insert: next.slice(start, nextEnd) };
}

function codePointStartBefore(value: string, end: number): number {
  const last = end - 1;
  const codeUnit = value.charCodeAt(last);
  const previousCodeUnit = value.charCodeAt(last - 1);
  return codeUnit >= 0xdc_00 && codeUnit <= 0xdf_ff && previousCodeUnit >= 0xd8_00 && previousCodeUnit <= 0xdb_ff ? last - 1 : last;
}
