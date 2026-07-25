import { describe, expect, it } from "vitest";
import { manipulateRecognizedShape, recognizeDrawnShape, type DrawnShapePoint, type RecognizedDrawnShape } from "./drawn-shape-recognition";

describe("drawn shape recognition", () => {
  it("snaps a nearly straight stroke to a line", () => {
    const shape = recognizeDrawnShape([
      { x: 10, y: 20 },
      { x: 35, y: 22 },
      { x: 60, y: 19 },
      { x: 90, y: 21 },
    ]);

    expect(shape).toMatchObject({
      kind: "line",
      points: [
        { x: 10, y: 20 },
        { x: 90, y: 21 },
      ],
    });
  });

  it.each([
    ["ellipse", roughEllipse()],
    ["rectangle", roughRectangle()],
    ["triangle", roughTriangle()],
  ] as const)("recognizes and replaces a rough %s", (kind, points) => {
    const shape = recognizeDrawnShape(points);

    expect(shape?.kind).toBe(kind);
    expect(shape?.points.at(-1)).toEqual(shape?.points[0]);
  });

  it("rejects open scribbles and tiny strokes", () => {
    expect(
      recognizeDrawnShape([
        { x: 10, y: 10 },
        { x: 70, y: 80 },
        { x: 20, y: 90 },
        { x: 90, y: 15 },
      ]),
    ).toBeNull();
    expect(
      recognizeDrawnShape([
        { x: 1, y: 1 },
        { x: 4, y: 4 },
      ]),
    ).toBeNull();
  });

  it("keeps the opposite anchor fixed while the active pointer scales and rotates the shape", () => {
    const shape: RecognizedDrawnShape = {
      kind: "rectangle",
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 10 },
        { x: 0, y: 10 },
        { x: 0, y: 0 },
      ],
      anchor: { x: 0, y: 10 },
      control: { x: 20, y: 0 },
    };

    const manipulated = manipulateRecognizedShape(shape, { x: 40, y: 10 });
    const control = manipulated.at(1);

    expect(manipulated.at(3)).toEqual(shape.anchor);
    expect(control).toBeDefined();
    expect(control?.x).toBeCloseTo(40);
    expect(control?.y).toBeCloseTo(10);
    expect(manipulated.at(-1)).toEqual(manipulated[0]);
  });
});

function roughEllipse(): readonly DrawnShapePoint[] {
  return Array.from({ length: 41 }, (_, index) => {
    const angle = (index / 40) * Math.PI * 2;
    return {
      x: 120 + Math.cos(angle) * (61 + Math.sin(index * 1.7) * 2),
      y: 90 + Math.sin(angle) * (39 + Math.cos(index * 1.3) * 1.5),
    };
  });
}

function roughRectangle(): readonly DrawnShapePoint[] {
  return [
    { x: 20, y: 20 },
    { x: 20, y: 45 },
    { x: 21, y: 70 },
    { x: 20, y: 95 },
    { x: 55, y: 96 },
    { x: 90, y: 94 },
    { x: 125, y: 95 },
    { x: 126, y: 70 },
    { x: 124, y: 45 },
    { x: 125, y: 20 },
    { x: 90, y: 19 },
    { x: 55, y: 21 },
    { x: 21, y: 20 },
  ];
}

function roughTriangle(): readonly DrawnShapePoint[] {
  return [
    { x: 70, y: 15 },
    { x: 55, y: 40 },
    { x: 40, y: 65 },
    { x: 25, y: 92 },
    { x: 55, y: 91 },
    { x: 85, y: 93 },
    { x: 115, y: 91 },
    { x: 100, y: 66 },
    { x: 85, y: 40 },
    { x: 70, y: 16 },
  ];
}
