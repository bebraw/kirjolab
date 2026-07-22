import { escapeHtml } from "../html";
import { renderIcon, type IconName } from "./icons";

type CommonButtonOptions = {
  readonly id?: string;
  readonly className?: string;
  readonly type?: "button" | "submit" | "reset";
  readonly title?: string;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly pressed?: boolean;
  readonly compact?: boolean;
  readonly destructive?: boolean;
  readonly touchTarget?: boolean;
};

type LabelledButtonOptions = CommonButtonOptions & {
  readonly label: string;
  readonly icon?: IconName;
  readonly tone?: "primary" | "secondary";
};

type IconButtonOptions = CommonButtonOptions & {
  readonly icon: IconName;
  readonly ariaLabel: string;
  readonly label?: never;
  readonly tone?: "icon";
};

export type ButtonOptions = LabelledButtonOptions | IconButtonOptions;

export function renderButton(options: ButtonOptions): string {
  if ("label" in options && options.label.trim().length === 0) throw new Error("Labelled buttons require visible text");
  const tone = options.tone ?? ("label" in options ? "secondary" : "icon");
  const ariaLabel = "ariaLabel" in options ? options.ariaLabel : undefined;
  const classes = [`button-${tone}`, options.className].filter(Boolean).join(" ");
  const attributes = [
    attribute("class", classes),
    attribute("id", options.id),
    attribute("type", options.type ?? "button"),
    attribute("aria-label", ariaLabel),
    attribute("title", options.title),
    attribute("aria-busy", options.busy === undefined ? undefined : String(options.busy)),
    attribute("aria-pressed", options.pressed === undefined ? undefined : String(options.pressed)),
    booleanAttribute("disabled", options.disabled),
    dataAttribute("compact", options.compact),
    dataAttribute("destructive", options.destructive),
    dataAttribute("touch-target", options.touchTarget),
  ]
    .filter(Boolean)
    .join(" ");
  // Stryker disable next-line LogicalOperator: the union requires every labelled option to have a non-empty label.
  const content = `${options.icon ? renderIcon(options.icon) : ""}${"label" in options && options.label ? `<span>${escapeHtml(options.label)}</span>` : ""}`;
  return `<button ${attributes}>${content}</button>`;
}

function attribute(name: string, value: string | undefined): string {
  return value === undefined ? "" : `${name}="${escapeHtml(value)}"`;
}

function booleanAttribute(name: string, value: boolean | undefined): string {
  return value ? name : "";
}

function dataAttribute(name: string, value: boolean | undefined): string {
  return value ? `data-${name}="true"` : "";
}
