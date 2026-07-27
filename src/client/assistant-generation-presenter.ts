import { html, LitElement, type TemplateResult } from "lit";
import { resolveAssistantTarget, type AssistantOperationDefinition } from "./assistant-operations";
import { AssistantResultPanel, type AssistantAuthoringPassage } from "./assistant-result-panel";
import { AssistantTaskPanel } from "./assistant-task-panel";
import type { SelectedModelEvidence } from "./assistant-workflow-status";
import type { ModelProvider } from "./model-provider";

type InteractiveProvider = Pick<
  ModelProvider,
  "buildTable" | "continueClarityDrill" | "formulateReferenceQuery" | "ideate" | "phrasePassage" | "startClarityDrill"
>;

export interface AssistantGenerationInput {
  readonly evidence: SelectedModelEvidence;
  readonly insertionTarget: AssistantAuthoringPassage | null;
  readonly instruction: string;
  readonly manuscript: string;
  readonly operation: AssistantOperationDefinition;
  readonly passage: AssistantAuthoringPassage | null;
  readonly provider: InteractiveProvider;
  readonly sourceRevision: number;
}

export interface AssistantGenerationPresentation {
  readonly status: string;
  readonly workflow: "AWAIT_INPUT" | "REVIEW";
}

export class AssistantGenerationPresenter extends LitElement {
  async generate(input: AssistantGenerationInput): Promise<AssistantGenerationPresentation | null> {
    const result = this.element("assistant-interactive-result", AssistantResultPanel);
    const task = this.element("assistant-task-panel", AssistantTaskPanel);
    if (!result || !task || input.operation.id === "draft-claim" || input.operation.id === "revise-selection") return null;
    if (input.operation.id === "build-table") {
      if (!input.insertionTarget) throw new Error("Place the manuscript caret first");
      const manuscriptContext = resolveAssistantTarget(
        input.manuscript,
        input.insertionTarget.end,
        input.insertionTarget.end,
        "paragraph",
      ).text;
      await result.generateTable(
        input.provider,
        { instruction: input.instruction, ...task.tableRequirements, manuscriptContext },
        { sourceRevision: input.sourceRevision, target: input.insertionTarget },
      );
      return { status: "Table syntax ready. Review it before inserting at the visible target.", workflow: "REVIEW" };
    }
    if (!input.passage) throw new Error("Select manuscript text first");
    const context = {
      passage: input.passage,
      evidence: input.evidence,
      instruction: input.instruction,
      sourceRevision: input.sourceRevision,
    };
    if (input.operation.id === "phrase-passage") {
      await result.generatePhrasing(input.provider, context, task.phrasingPurpose);
      return { status: "Choose one alternative to open exact before-and-after review.", workflow: "REVIEW" };
    }
    if (input.operation.id === "find-references") {
      const count = await result.discoverReferences(input.provider, {
        evidence: input.evidence.items,
        instruction: input.instruction,
        selectedPassage: input.passage.excerpt,
      });
      return {
        status: count
          ? `Found ${count} verifiable registry record${count === 1 ? "" : "s"}. Review before saving.`
          : "No verifiable registry records matched this query. Refine the search focus and try again.",
        workflow: "REVIEW",
      };
    }
    if (input.operation.id === "ideate") {
      await result.generateIdeas(input.provider, context);
      return { status: "Choose a direction to open its complete draft for exact review.", workflow: "REVIEW" };
    }
    if (input.operation.id === "clarity-drill") {
      await result.startClarityDrill(input.provider, context);
      return { status: "Answer one focused question to make the intended meaning explicit.", workflow: "AWAIT_INPUT" };
    }
    return null;
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    return html``;
  }

  protected element<T extends HTMLElement>(id: string, constructor: abstract new () => T): T | null {
    const element = this.ownerDocument.getElementById(id);
    return element instanceof constructor ? element : null;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("assistant-generation-presenter")) {
  customElements.define("assistant-generation-presenter", AssistantGenerationPresenter);
}

declare global {
  interface HTMLElementTagNameMap {
    "assistant-generation-presenter": AssistantGenerationPresenter;
  }
}
