import { CIRCLE_GESTURE, DollarRecognizer, Point, RECTANGLE_GESTURE, TRIANGLE_GESTURE } from "@smartupcorp/onedollar-unistroke-recognizer";

export interface DrawnShapePoint {
  readonly x: number;
  readonly y: number;
}

export type RecognizedDrawnShapeKind = "line" | "ellipse" | "rectangle" | "triangle";

export interface RecognizedDrawnShape {
  readonly kind: RecognizedDrawnShapeKind;
  readonly points: readonly DrawnShapePoint[];
  readonly anchor: DrawnShapePoint;
  readonly control: DrawnShapePoint;
}

const recognizer = new DollarRecognizer([CIRCLE_GESTURE, RECTANGLE_GESTURE, TRIANGLE_GESTURE]);
const minimumShapeSize = 24;
const ellipseSegments = 48;

export function recognizeDrawnShape(points: readonly DrawnShapePoint[]): RecognizedDrawnShape | null {
  if (points.length < 2) return null;
  const bounds = pointBounds(points);
  const diagonal = Math.hypot(bounds.width, bounds.height);
  if (diagonal < minimumShapeSize) return null;

  const line = recognizeLine(points);
  if (line) return line;
  if (points.length < 8 || distance(requiredPoint(points, 0), requiredPoint(points, points.length - 1)) > diagonal * 0.28) return null;

  const classify = (input: readonly DrawnShapePoint[]) =>
    recognizer.recognize(
      input.map((point) => new Point(point.x, point.y)),
      false,
    );
  const matches = [...classify(points), ...classify([...points].reverse())];
  const results = matches
    .filter((result, index) => matches.findIndex((candidate) => candidate.name === result.name) === index)
    .map((result) => ({
      ...result,
      score: Math.max(...matches.filter((candidate) => candidate.name === result.name).map((candidate) => candidate.score)),
    }))
    .sort((left, right) => right.score - left.score);
  const best = results[0];
  const runnerUp = results[1];
  if (!best || best.score < 0.72 || (runnerUp && best.score - runnerUp.score < 0.035)) return null;

  const pointer = requiredPoint(points, points.length - 1);
  if (best.name === "circle") return shapeWithHandles("ellipse", fitEllipse(points), pointer);
  if (best.name === "rectangle") return shapeWithHandles("rectangle", fitRectangle(points), pointer);
  if (best.name === "triangle") return shapeWithHandles("triangle", fitTriangle(points), pointer);
  return null;
}

export function manipulateRecognizedShape(shape: RecognizedDrawnShape, pointer: DrawnShapePoint): readonly DrawnShapePoint[] {
  const baseX = shape.control.x - shape.anchor.x;
  const baseY = shape.control.y - shape.anchor.y;
  const nextX = pointer.x - shape.anchor.x;
  const nextY = pointer.y - shape.anchor.y;
  const baseLength = Math.hypot(baseX, baseY);
  const nextLength = Math.max(Math.hypot(nextX, nextY), baseLength * 0.1);
  if (baseLength === 0) return shape.points;
  const scale = nextLength / baseLength;
  const rotation = Math.atan2(nextY, nextX) - Math.atan2(baseY, baseX);
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return shape.points.map((point) => {
    const x = point.x - shape.anchor.x;
    const y = point.y - shape.anchor.y;
    return {
      x: shape.anchor.x + (x * cosine - y * sine) * scale,
      y: shape.anchor.y + (x * sine + y * cosine) * scale,
    };
  });
}

function recognizeLine(points: readonly DrawnShapePoint[]): RecognizedDrawnShape | null {
  const start = requiredPoint(points, 0);
  const end = requiredPoint(points, points.length - 1);
  const chord = distance(start, end);
  if (chord < minimumShapeSize) return null;
  const length = pathLength(points);
  const maximumDeviation = Math.max(...points.map((point) => distanceToLine(point, start, end)));
  if (chord / length < 0.9 || maximumDeviation / chord > 0.08) return null;
  return { kind: "line", points: [start, end], anchor: start, control: end };
}

function fitEllipse(points: readonly DrawnShapePoint[]): readonly DrawnShapePoint[] {
  const angle = principalAngle(points);
  const oriented = orientedBounds(points, angle);
  const center = rotatePoint({ x: oriented.centerX, y: oriented.centerY }, angle);
  const radiusX = Math.max(oriented.width / 2, 1);
  const radiusY = Math.max(oriented.height / 2, 1);
  const fitted = Array.from({ length: ellipseSegments }, (_, index) => {
    const theta = (index / ellipseSegments) * Math.PI * 2;
    return rotateAroundOrigin({ x: Math.cos(theta) * radiusX, y: Math.sin(theta) * radiusY }, angle, center);
  });
  return [...fitted, requiredPoint(fitted, 0)];
}

function fitRectangle(points: readonly DrawnShapePoint[]): readonly DrawnShapePoint[] {
  const angle = rectangleAngle(points);
  const bounds = orientedBounds(points, angle);
  const corners = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ].map((point) => rotatePoint(point, angle));
  return [...corners, requiredPoint(corners, 0)];
}

function fitTriangle(points: readonly DrawnShapePoint[]): readonly DrawnShapePoint[] {
  const candidates = evenlySample(points, 24);
  let vertices: readonly [DrawnShapePoint, DrawnShapePoint, DrawnShapePoint] = [
    requiredPoint(candidates, 0),
    requiredPoint(candidates, 1),
    requiredPoint(candidates, 2),
  ];
  let maximumArea = 0;
  for (let first = 0; first < candidates.length - 2; first += 1) {
    for (let second = first + 1; second < candidates.length - 1; second += 1) {
      for (let third = second + 1; third < candidates.length; third += 1) {
        const area = triangleArea(requiredPoint(candidates, first), requiredPoint(candidates, second), requiredPoint(candidates, third));
        if (area > maximumArea) {
          maximumArea = area;
          vertices = [requiredPoint(candidates, first), requiredPoint(candidates, second), requiredPoint(candidates, third)];
        }
      }
    }
  }
  const center = centroid(vertices);
  const ordered = [...vertices].sort(
    (left, right) => Math.atan2(left.y - center.y, left.x - center.x) - Math.atan2(right.y - center.y, right.x - center.x),
  );
  return [...ordered, requiredPoint(ordered, 0)];
}

function shapeWithHandles(
  kind: Exclude<RecognizedDrawnShapeKind, "line">,
  points: readonly DrawnShapePoint[],
  closingPoint: DrawnShapePoint,
): RecognizedDrawnShape {
  const control = points.reduce(
    (closest, point) => (distance(point, closingPoint) < distance(closest, closingPoint) ? point : closest),
    requiredPoint(points, 0),
  );
  const anchor = points.reduce(
    (farthest, point) => (distance(point, control) > distance(farthest, control) ? point : farthest),
    requiredPoint(points, 0),
  );
  return { kind, points, anchor, control };
}

function rectangleAngle(points: readonly DrawnShapePoint[]): number {
  const candidates = [0, principalAngle(points)];
  for (let index = 1; index < points.length; index += 1) {
    const previous = requiredPoint(points, index - 1);
    const point = requiredPoint(points, index);
    if (distance(previous, point) > 4) candidates.push(Math.atan2(point.y - previous.y, point.x - previous.x));
  }
  let best = candidates[0] ?? 0;
  let bestError = Number.POSITIVE_INFINITY;
  for (const angle of candidates) {
    const bounds = orientedBounds(points, angle);
    const error =
      points.reduce((total, point) => {
        const rotated = rotatePoint(point, -angle);
        return (
          total +
          Math.min(
            Math.abs(rotated.x - bounds.minX),
            Math.abs(rotated.x - bounds.maxX),
            Math.abs(rotated.y - bounds.minY),
            Math.abs(rotated.y - bounds.maxY),
          )
        );
      }, 0) / points.length;
    if (error < bestError) {
      best = angle;
      bestError = error;
    }
  }
  return best;
}

function principalAngle(points: readonly DrawnShapePoint[]): number {
  const center = centroid(points);
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (const point of points) {
    const x = point.x - center.x;
    const y = point.y - center.y;
    xx += x * x;
    xy += x * y;
    yy += y * y;
  }
  return Math.atan2(2 * xy, xx - yy) / 2;
}

function orientedBounds(points: readonly DrawnShapePoint[], angle: number) {
  const rotated = points.map((point) => rotatePoint(point, -angle));
  const bounds = pointBounds(rotated);
  return {
    ...bounds,
    centerX: bounds.minX + bounds.width / 2,
    centerY: bounds.minY + bounds.height / 2,
  };
}

function pointBounds(points: readonly DrawnShapePoint[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

function evenlySample(points: readonly DrawnShapePoint[], limit: number): readonly DrawnShapePoint[] {
  if (points.length <= limit) return points;
  return Array.from({ length: limit }, (_, index) => requiredPoint(points, Math.round((index / (limit - 1)) * (points.length - 1))));
}

function centroid(points: readonly DrawnShapePoint[]): DrawnShapePoint {
  const total = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  return { x: total.x / points.length, y: total.y / points.length };
}

function rotatePoint(point: DrawnShapePoint, angle: number): DrawnShapePoint {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return { x: point.x * cosine - point.y * sine, y: point.x * sine + point.y * cosine };
}

function rotateAroundOrigin(point: DrawnShapePoint, angle: number, center: DrawnShapePoint): DrawnShapePoint {
  const rotated = rotatePoint(point, angle);
  return { x: rotated.x + center.x, y: rotated.y + center.y };
}

function distance(first: DrawnShapePoint, second: DrawnShapePoint): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function pathLength(points: readonly DrawnShapePoint[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) length += distance(requiredPoint(points, index - 1), requiredPoint(points, index));
  return length;
}

function requiredPoint(points: readonly DrawnShapePoint[], index: number): DrawnShapePoint {
  const point = points[index];
  if (!point) throw new Error(`Expected drawing point at index ${index}.`);
  return point;
}

function distanceToLine(point: DrawnShapePoint, start: DrawnShapePoint, end: DrawnShapePoint): number {
  const length = distance(start, end);
  if (length === 0) return distance(point, start);
  return Math.abs((end.y - start.y) * point.x - (end.x - start.x) * point.y + end.x * start.y - end.y * start.x) / length;
}

function triangleArea(first: DrawnShapePoint, second: DrawnShapePoint, third: DrawnShapePoint): number {
  return Math.abs((first.x * (second.y - third.y) + second.x * (third.y - first.y) + third.x * (first.y - second.y)) / 2);
}
