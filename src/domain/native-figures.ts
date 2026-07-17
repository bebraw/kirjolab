import type { Element as HastElement, ElementContent as HastElementContent } from "hast";
import type { Directives } from "mdast-util-directive";
import type { Node } from "unist";

export interface NativeFigureIssue {
  readonly message: string;
  readonly from: number;
  readonly to: number;
}

export interface NativeBoxplotMark {
  readonly label: string;
  readonly min: number;
  readonly q1: number;
  readonly median: number;
  readonly q3: number;
  readonly max: number;
}

export interface NativeBoxplotFigure {
  readonly schemaVersion: 1;
  readonly kind: "boxplot";
  readonly id?: string;
  readonly xLabel?: string;
  readonly yLabel?: string;
  readonly caption: string;
  readonly marks: readonly NativeBoxplotMark[];
}

export type NativeFigureParseResult =
  | { readonly figure: NativeBoxplotFigure; readonly issues: readonly [] }
  | { readonly figure: null; readonly issues: readonly NativeFigureIssue[] };

const maximumFigureSourceLength = 16 * 1024;
const maximumTextLength = 500;
const maximumLabelLength = 120;
const maximumMagnitude = 1e12;
const maximumMarks = 32;
const figureAttributes = new Set(["id", "kind", "version", "x-label", "y-label"]);
const boxAttributes = new Set(["min", "q1", "median", "q3", "max"]);

export function parseNativeFigure(directive: Directives): NativeFigureParseResult {
  const issues: NativeFigureIssue[] = [];
  const attributes = directive.attributes ?? {};
  const markDirectives: Directives[] = [];
  const captions: Directives[] = [];

  if (directive.type !== "containerDirective" || directive.name !== "figure") {
    addIssue(issues, directive, "Native figure must use a :::figure container");
  }
  const sourceLength = offset(directive.position?.end.offset) - offset(directive.position?.start.offset);
  if (sourceLength > maximumFigureSourceLength) addIssue(issues, directive, "Native figure source exceeds 16 KiB");
  for (const name of Object.keys(attributes)) {
    if (!figureAttributes.has(name)) addIssue(issues, directive, `Unsupported figure attribute: ${name}`);
  }
  if (attribute(attributes.kind) !== "boxplot") addIssue(issues, directive, "Native figure kind must be boxplot");
  if (attribute(attributes.version) !== "1") addIssue(issues, directive, "Native figure version must be 1");

  const id = attribute(attributes.id);
  if (id && !/^[a-z][a-z0-9:_-]{0,63}$/u.test(id)) addIssue(issues, directive, "Native figure id is invalid");
  const xLabel = boundedText(attribute(attributes["x-label"]), maximumLabelLength, "x-axis label", directive, issues);
  const yLabel = boundedText(attribute(attributes["y-label"]), maximumLabelLength, "y-axis label", directive, issues);

  for (const child of directive.children) {
    if (child.type === "leafDirective" && child.name === "box") markDirectives.push(child);
    else if (child.type === "leafDirective" && child.name === "caption") captions.push(child);
    else addIssue(issues, child, "Native boxplot accepts only ::box and ::caption directives");
  }
  if (markDirectives.length === 0) addIssue(issues, directive, "Native boxplot requires at least one box");
  if (markDirectives.length > maximumMarks) addIssue(issues, directive, `Native boxplot supports at most ${maximumMarks} boxes`);
  if (captions.length !== 1) addIssue(issues, directive, "Native figure requires exactly one caption");

  const captionDirective = captions[0];
  const caption = captionDirective
    ? boundedText(directiveText(captionDirective).trim(), maximumTextLength, "caption", captionDirective, issues)
    : undefined;
  if (captionDirective && !caption) addIssue(issues, captionDirective, "Native figure caption cannot be empty");

  const marks = markDirectives.map((mark) => parseMark(mark, issues));
  if (issues.length > 0 || !caption || marks.some((mark) => mark === null)) return { figure: null, issues };
  return {
    figure: {
      schemaVersion: 1,
      kind: "boxplot",
      ...(id ? { id } : {}),
      ...(xLabel ? { xLabel } : {}),
      ...(yLabel ? { yLabel } : {}),
      caption,
      marks: marks.filter((mark): mark is NativeBoxplotMark => mark !== null),
    },
    issues: [],
  };
}

export function renderNativeFigure(figure: NativeBoxplotFigure, sourceOffset: number): HastElement {
  const width = 720;
  const left = 180;
  const right = 32;
  const top = 34;
  const bottom = 58;
  const rowHeight = 38;
  const plotWidth = width - left - right;
  const height = top + figure.marks.length * rowHeight + bottom;
  const observedMin = Math.min(...figure.marks.map((mark) => mark.min));
  const observedMax = Math.max(...figure.marks.map((mark) => mark.max));
  const padding = observedMin === observedMax ? Math.max(Math.abs(observedMin) * 0.05, 1) : 0;
  const domainMin = observedMin - padding;
  const domainMax = observedMax + padding;
  const scale = (value: number): number => left + ((value - domainMin) / (domainMax - domainMin)) * plotWidth;
  const titleId = `native-figure-title-${sourceOffset}`;
  const children: HastElementContent[] = [element("title", { id: titleId }, [text(figure.caption)])];

  if (figure.yLabel) children.push(element("text", { className: ["native-figure-axis-label-y"], x: "0", y: "16" }, [text(figure.yLabel)]));
  for (let tick = 0; tick <= 4; tick += 1) {
    const value = domainMin + ((domainMax - domainMin) * tick) / 4;
    const x = scale(value);
    children.push(
      element(
        "line",
        { className: ["native-figure-grid"], x1: coordinate(x), x2: coordinate(x), y1: coordinate(top), y2: coordinate(height - bottom) },
        [],
      ),
    );
    children.push(
      element("text", { className: ["native-figure-tick"], x: coordinate(x), y: coordinate(height - bottom + 20) }, [
        text(formatNumber(value)),
      ]),
    );
  }
  for (const [index, mark] of figure.marks.entries()) {
    const y = top + index * rowHeight + rowHeight / 2;
    children.push(
      element("text", { className: ["native-figure-mark-label"], x: coordinate(left - 12), y: coordinate(y) }, [text(mark.label)]),
    );
    children.push(
      element(
        "line",
        {
          className: ["native-figure-whisker"],
          x1: coordinate(scale(mark.min)),
          x2: coordinate(scale(mark.max)),
          y1: coordinate(y),
          y2: coordinate(y),
        },
        [],
      ),
    );
    children.push(
      element(
        "line",
        {
          className: ["native-figure-whisker"],
          x1: coordinate(scale(mark.min)),
          x2: coordinate(scale(mark.min)),
          y1: coordinate(y - 6),
          y2: coordinate(y + 6),
        },
        [],
      ),
    );
    children.push(
      element(
        "line",
        {
          className: ["native-figure-whisker"],
          x1: coordinate(scale(mark.max)),
          x2: coordinate(scale(mark.max)),
          y1: coordinate(y - 6),
          y2: coordinate(y + 6),
        },
        [],
      ),
    );
    children.push(
      element("rect", {
        className: ["native-figure-box"],
        x: coordinate(scale(mark.q1)),
        y: coordinate(y - 10),
        width: coordinate(Math.max(scale(mark.q3) - scale(mark.q1), 1)),
        height: "20",
      }),
    );
    children.push(
      element(
        "line",
        {
          className: ["native-figure-median"],
          x1: coordinate(scale(mark.median)),
          x2: coordinate(scale(mark.median)),
          y1: coordinate(y - 10),
          y2: coordinate(y + 10),
        },
        [],
      ),
    );
  }
  if (figure.xLabel) {
    children.push(
      element("text", { className: ["native-figure-axis-label-x"], x: coordinate(left + plotWidth / 2), y: coordinate(height - 6) }, [
        text(figure.xLabel),
      ]),
    );
  }

  return element("figure", { ...(figure.id ? { id: figure.id } : {}), className: ["native-figure", "native-figure-boxplot"] }, [
    element(
      "svg",
      {
        viewBox: `0 0 ${width} ${height}`,
        role: "img",
        ariaLabelledBy: [titleId],
        className: ["native-figure-graphic"],
      },
      children,
    ),
    element("figcaption", {}, [text(figure.caption)]),
  ]);
}

function parseMark(directive: Directives, issues: NativeFigureIssue[]): NativeBoxplotMark | null {
  for (const name of Object.keys(directive.attributes ?? {})) {
    if (!boxAttributes.has(name)) addIssue(issues, directive, `Unsupported box attribute: ${name}`);
  }
  const label = boundedText(directiveText(directive).trim(), maximumLabelLength, "box label", directive, issues);
  if (!label) addIssue(issues, directive, "Native box requires a label");
  const values = ["min", "q1", "median", "q3", "max"].map((name) => numericAttribute(directive, name, issues));
  if (!label || values.some((value) => value === null)) return null;
  const [min, q1, median, q3, max] = values as [number, number, number, number, number];
  if (!(min <= q1 && q1 <= median && median <= q3 && q3 <= max)) {
    addIssue(issues, directive, "Box values must satisfy min <= q1 <= median <= q3 <= max");
    return null;
  }
  return { label, min, q1, median, q3, max };
}

function numericAttribute(directive: Directives, name: string, issues: NativeFigureIssue[]): number | null {
  const raw = attribute(directive.attributes?.[name]);
  const value = raw === undefined || raw.trim() === "" ? Number.NaN : Number(raw);
  if (!Number.isFinite(value) || Math.abs(value) > maximumMagnitude) {
    addIssue(issues, directive, `Box ${name} must be a finite number with magnitude at most ${maximumMagnitude}`);
    return null;
  }
  return value;
}

function boundedText(
  value: string | undefined,
  maximum: number,
  label: string,
  node: Node,
  issues: NativeFigureIssue[],
): string | undefined {
  if (value === undefined) return undefined;
  if (value.length > maximum) {
    addIssue(issues, node, `Native figure ${label} exceeds ${maximum} characters`);
    return undefined;
  }
  return value;
}

function directiveText(directive: Directives): string {
  return directive.children.map((child) => ("value" in child && typeof child.value === "string" ? child.value : "")).join("");
}

function addIssue(issues: NativeFigureIssue[], node: Node, message: string): void {
  issues.push({ message, from: offset(node.position?.start.offset), to: offset(node.position?.end.offset) });
}

function offset(value: number | undefined): number {
  return value ?? 0;
}

function attribute(value: string | null | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3, useGrouping: false }).format(value);
}

function coordinate(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function element(tagName: string, properties: HastElement["properties"], children: HastElementContent[] = []): HastElement {
  return { type: "element", tagName, properties, children };
}

function text(value: string): HastElementContent {
  return { type: "text", value };
}
