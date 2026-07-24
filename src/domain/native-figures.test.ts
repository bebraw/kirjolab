import { describe, expect, it } from "vitest";
import type { Directives } from "mdast-util-directive";
import { parseNativeFigure, renderNativeFigure, type NativeBoxplotFigure } from "./native-figures";

describe("renderNativeFigure", () => {
  it("pads an equal domain and emits finite repeatable geometry", () => {
    const figure: NativeBoxplotFigure = {
      schemaVersion: 1,
      kind: "boxplot",
      caption: "Equal observations",
      marks: [{ label: "A", min: 5, q1: 5, median: 5, q3: 5, max: 5 }],
    };

    const first = renderNativeFigure(figure, 12);
    const second = renderNativeFigure(figure, 12);
    const serialized = JSON.stringify(first);

    expect(first).toEqual(second);
    expect(serialized).not.toMatch(/(?:NaN|Infinity)/u);
    expect(serialized).toContain('"viewBox":"0 0 720 130"');
  });

  it("parses a complete bounded boxplot contract", () => {
    expect(parseNativeFigure(figureDirective())).toEqual({
      figure: {
        schemaVersion: 1,
        kind: "boxplot",
        id: "result:latency",
        xLabel: "Time (ms)",
        yLabel: "Variant",
        caption: "Latency distribution",
        marks: [{ label: "Baseline", min: 1, q1: 2, median: 3, q3: 4, max: 5 }],
      },
      issues: [],
    });
  });

  it("reports container, source, figure attribute, kind, version, id, and label errors exactly", () => {
    const cases: Array<readonly [Directives, string]> = [
      [boxDirective(), "Native figure must use a :::figure container"],
      [{ ...figureDirective(), name: "chart" }, "Native figure must use a :::figure container"],
      [figureDirective({ extra: "value" }), "Unsupported figure attribute: extra"],
      [figureDirective({ kind: "line" }), "Native figure kind must be boxplot"],
      [figureDirective({ version: "2" }), "Native figure version must be 1"],
      [figureDirective({ id: "Bad id" }), "Native figure id is invalid"],
      [figureDirective({ "x-label": "x".repeat(121) }), "Native figure x-axis label exceeds 120 characters"],
      [figureDirective({ "y-label": "y".repeat(121) }), "Native figure y-axis label exceeds 120 characters"],
      [
        { ...figureDirective(), position: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 16_385 } } },
        "Native figure source exceeds 16 KiB",
      ],
    ];
    for (const [directive, message] of cases) {
      expect(parseNativeFigure(directive).issues).toContainEqual({
        message,
        from: directive.position?.start.offset ?? 0,
        to: directive.position?.end.offset ?? 0,
      });
    }
  });

  it("requires only bounded boxes and exactly one non-empty caption", () => {
    const box = boxDirective();
    const caption = captionDirective();
    const cases: Array<readonly [Extract<Directives, { type: "containerDirective" }>["children"], string]> = [
      [
        [{ type: "paragraph", children: [{ type: "text", value: "unexpected" }] }],
        "Native boxplot accepts only ::box and ::caption directives",
      ],
      [[caption], "Native boxplot requires at least one box"],
      [[box], "Native figure requires exactly one caption"],
      [[box, caption, caption], "Native figure requires exactly one caption"],
      [[box, captionDirective("   ")], "Native figure caption cannot be empty"],
      [[box, captionDirective("x".repeat(501))], "Native figure caption exceeds 500 characters"],
      [[...Array.from({ length: 33 }, () => box), caption], "Native boxplot supports at most 32 boxes"],
    ];
    for (const [children, message] of cases) {
      expect(parseNativeFigure({ ...figureDirective(), children }).issues.map(({ message: issue }) => issue)).toContain(message);
    }
  });

  it("validates box attributes, labels, finite bounds, and quartile ordering", () => {
    const cases: Array<readonly [Extract<Directives, { type: "leafDirective" }>, string]> = [
      [boxDirective({ extra: "1" }), "Unsupported box attribute: extra"],
      [boxDirective({}, ""), "Native box requires a label"],
      [boxDirective({}, "x".repeat(121)), "Native figure box label exceeds 120 characters"],
      [boxDirective({ min: "" }), "Box min must be a finite number with magnitude at most 1000000000000"],
      [boxDirective({ q1: "Infinity" }), "Box q1 must be a finite number with magnitude at most 1000000000000"],
      [boxDirective({ median: "1000000000001" }), "Box median must be a finite number with magnitude at most 1000000000000"],
      [boxDirective({ min: "2", q1: "1" }), "Box values must satisfy min <= q1 <= median <= q3 <= max"],
      [boxDirective({ q1: "4", median: "3" }), "Box values must satisfy min <= q1 <= median <= q3 <= max"],
      [boxDirective({ median: "5", q3: "4" }), "Box values must satisfy min <= q1 <= median <= q3 <= max"],
      [boxDirective({ q3: "6", max: "5" }), "Box values must satisfy min <= q1 <= median <= q3 <= max"],
    ];
    for (const [box, message] of cases) {
      expect(
        parseNativeFigure({ ...figureDirective(), children: [box, captionDirective()] }).issues.map(({ message: issue }) => issue),
      ).toContain(message);
    }
  });

  it("accepts exact parser limits and equal quartiles", () => {
    const marks = Array.from({ length: 32 }, (_, index) =>
      boxDirective(
        {
          min: index === 0 ? "-1000000000000" : "5",
          q1: "5",
          median: "5",
          q3: "5",
          max: index === 31 ? "1000000000000" : "5",
        },
        index === 0 ? "l".repeat(120) : `Box ${index}`,
      ),
    );
    const directive = {
      ...figureDirective({
        id: `a${"b".repeat(63)}`,
        "x-label": "x".repeat(120),
        "y-label": "y".repeat(120),
      }),
      children: [...marks, captionDirective("c".repeat(500))],
      position: {
        start: { line: 1, column: 1, offset: 10 },
        end: { line: 1, column: 1, offset: 10 + 16 * 1_024 },
      },
    } satisfies Extract<Directives, { type: "containerDirective" }>;

    const parsed = parseNativeFigure(directive);
    expect(parsed.issues).toEqual([]);
    expect(parsed.figure).toMatchObject({
      id: `a${"b".repeat(63)}`,
      xLabel: "x".repeat(120),
      yLabel: "y".repeat(120),
      caption: "c".repeat(500),
    });
    expect(parsed.figure?.marks).toHaveLength(32);
    expect(parsed.figure?.marks[0]).toMatchObject({ min: -1e12, q1: 5, median: 5, q3: 5, max: 5 });
    expect(parsed.figure?.marks[31]).toMatchObject({ min: 5, q1: 5, median: 5, q3: 5, max: 1e12 });
  });

  it("renders exact axes, ticks, marks, labels, caption, and source-bound title id", () => {
    const figure: NativeBoxplotFigure = {
      schemaVersion: 1,
      kind: "boxplot",
      id: "latency",
      xLabel: "Time",
      yLabel: "Variant",
      caption: "Measured | latency",
      marks: [
        { label: "A", min: 0, q1: 1, median: 2, q3: 3, max: 4 },
        { label: "B", min: 1, q1: 2, median: 3, q3: 4, max: 4 },
      ],
    };
    const rendered = renderNativeFigure(figure, 42);
    expect(rendered.properties).toEqual({ id: "latency", className: ["native-figure", "native-figure-boxplot"] });
    const serialized = JSON.stringify(rendered);
    expect(serialized).toContain('"viewBox":"0 0 720 168"');
    expect(serialized).toContain('"id":"native-figure-title-42"');
    expect(serialized).toContain('"ariaLabelledBy":["native-figure-title-42"]');
    expect(serialized).toContain('"native-figure-axis-label-x"');
    expect(serialized).toContain('"native-figure-axis-label-y"');
    expect(serialized.match(/native-figure-grid/gu)).toHaveLength(5);
    expect(serialized.match(/native-figure-tick/gu)).toHaveLength(5);
    expect(serialized.match(/native-figure-mark-label/gu)).toHaveLength(2);
    expect(serialized.match(/native-figure-whisker/gu)).toHaveLength(6);
    expect(serialized.match(/native-figure-box"/gu)).toHaveLength(2);
    expect(serialized.match(/native-figure-median/gu)).toHaveLength(2);
    const graphic = rendered.children[0];
    if (graphic?.type !== "element") throw new TypeError("Expected a rendered SVG element");
    expect(
      graphic.children.map((child) => {
        if (child.type !== "element") return [child.type];
        return [child.tagName, child.properties, child.children[0]?.type === "text" ? child.children[0].value : null];
      }),
    ).toEqual([
      ["title", { id: "native-figure-title-42" }, "Measured | latency"],
      ["text", { className: ["native-figure-axis-label-y"], x: "0", y: "16" }, "Variant"],
      ["line", { className: ["native-figure-grid"], x1: "180", x2: "180", y1: "34", y2: "110" }, null],
      ["text", { className: ["native-figure-tick"], x: "180", y: "130" }, "0"],
      ["line", { className: ["native-figure-grid"], x1: "307", x2: "307", y1: "34", y2: "110" }, null],
      ["text", { className: ["native-figure-tick"], x: "307", y: "130" }, "1"],
      ["line", { className: ["native-figure-grid"], x1: "434", x2: "434", y1: "34", y2: "110" }, null],
      ["text", { className: ["native-figure-tick"], x: "434", y: "130" }, "2"],
      ["line", { className: ["native-figure-grid"], x1: "561", x2: "561", y1: "34", y2: "110" }, null],
      ["text", { className: ["native-figure-tick"], x: "561", y: "130" }, "3"],
      ["line", { className: ["native-figure-grid"], x1: "688", x2: "688", y1: "34", y2: "110" }, null],
      ["text", { className: ["native-figure-tick"], x: "688", y: "130" }, "4"],
      ["text", { className: ["native-figure-mark-label"], x: "168", y: "53" }, "A"],
      ["line", { className: ["native-figure-whisker"], x1: "180", x2: "688", y1: "53", y2: "53" }, null],
      ["line", { className: ["native-figure-whisker"], x1: "180", x2: "180", y1: "47", y2: "59" }, null],
      ["line", { className: ["native-figure-whisker"], x1: "688", x2: "688", y1: "47", y2: "59" }, null],
      ["rect", { className: ["native-figure-box"], x: "307", y: "43", width: "254", height: "20" }, null],
      ["line", { className: ["native-figure-median"], x1: "434", x2: "434", y1: "43", y2: "63" }, null],
      ["text", { className: ["native-figure-mark-label"], x: "168", y: "91" }, "B"],
      ["line", { className: ["native-figure-whisker"], x1: "307", x2: "688", y1: "91", y2: "91" }, null],
      ["line", { className: ["native-figure-whisker"], x1: "307", x2: "307", y1: "85", y2: "97" }, null],
      ["line", { className: ["native-figure-whisker"], x1: "688", x2: "688", y1: "85", y2: "97" }, null],
      ["rect", { className: ["native-figure-box"], x: "434", y: "81", width: "254", height: "20" }, null],
      ["line", { className: ["native-figure-median"], x1: "561", x2: "561", y1: "81", y2: "101" }, null],
      ["text", { className: ["native-figure-axis-label-x"], x: "434", y: "162" }, "Time"],
    ]);
    expect(rendered.children.at(-1)).toEqual({
      type: "element",
      tagName: "figcaption",
      properties: {},
      children: [{ type: "text", value: "Measured | latency" }],
    });
  });
});

function figureDirective(attributes: Readonly<Record<string, string | null>> = {}): Extract<Directives, { type: "containerDirective" }> {
  return {
    type: "containerDirective",
    name: "figure",
    attributes: {
      id: "result:latency",
      kind: "boxplot",
      version: "1",
      "x-label": "Time (ms)",
      "y-label": "Variant",
      ...attributes,
    },
    children: [boxDirective(), captionDirective()],
    position: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 101, offset: 100 } },
  };
}

function boxDirective(
  attributes: Readonly<Record<string, string | null>> = {},
  label = "Baseline",
): Extract<Directives, { type: "leafDirective" }> {
  return {
    type: "leafDirective",
    name: "box",
    attributes: { min: "1", q1: "2", median: "3", q3: "4", max: "5", ...attributes },
    children: [{ type: "text", value: label }],
    position: { start: { line: 1, column: 1, offset: 10 }, end: { line: 1, column: 21, offset: 30 } },
  };
}

function captionDirective(caption = "Latency distribution"): Extract<Directives, { type: "leafDirective" }> {
  return {
    type: "leafDirective",
    name: "caption",
    attributes: {},
    children: [{ type: "text", value: caption }],
    position: { start: { line: 1, column: 1, offset: 31 }, end: { line: 1, column: 21, offset: 50 } },
  };
}
