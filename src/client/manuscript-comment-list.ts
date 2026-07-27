import { html, LitElement, type TemplateResult } from "lit";
import type {
  CreateManuscriptCommentInput,
  ManuscriptAnchorSelector,
  ManuscriptComment,
  ManuscriptPassageInput,
} from "../domain/workspace";
import { errorMessage, expectOk, jsonFetch } from "./http";
import { anchorActionLabel } from "./research-resource-presentation";

export interface ManuscriptCommentBinding {
  readonly completeMutation: (message: string) => void;
  readonly openPassage: (anchor: ManuscriptAnchorSelector) => void;
  readonly passage: (action: "create" | "reanchor") => ManuscriptPassageInput | undefined;
}

export class ManuscriptCommentList extends LitElement {
  static override properties = {
    body: { state: true },
    comments: { state: true },
    resolvingCommentId: { state: true },
    status: { state: true },
  };

  declare private body: string;
  declare private comments: readonly ManuscriptComment[];
  declare private resolvingCommentId: string;
  declare private status: string;
  private apiBase = "";
  private binding: ManuscriptCommentBinding | undefined;

  constructor() {
    super();
    this.body = "";
    this.comments = [];
    this.resolvingCommentId = "";
    this.status = "Comments stay outside the Markdown source.";
  }

  configure(apiBase: string): void {
    this.apiBase = apiBase;
  }

  bind(binding: ManuscriptCommentBinding): void {
    this.binding = binding;
  }

  setComments(comments: readonly ManuscriptComment[]): number {
    this.comments = comments;
    return comments.filter((comment) => comment.status === "open").length;
  }

  async createAt(input: CreateManuscriptCommentInput): Promise<void> {
    await this.persist(`${this.apiBase}/comments`, input, "Comment anchored to the selected passage.", true);
  }

  async reanchorAt(commentId: string, input: ManuscriptPassageInput): Promise<void> {
    await this.persist(
      `${this.apiBase}/comments/${encodeURIComponent(commentId)}/reanchor`,
      input,
      "Comment linked to the selected passage; earlier anchors remain in project history.",
    );
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    return html`
      <form class="mt-4 grid gap-3 border-t border-app-line pt-4" id="manuscript-comment-form" @submit=${this.create}>
        <label class="field-label" for="manuscript-comment-body">Comment on selected text</label>
        <textarea
          class="field min-h-24 resize-y"
          id="manuscript-comment-body"
          maxlength="8000"
          required
          placeholder="Leave a comment on the selected passage."
          .value=${this.body}
          @input=${this.changeBody}
        ></textarea>
        <button class="button-secondary w-full justify-center" type="submit">Add comment</button>
        <p class="text-xs leading-5 text-app-text-soft" id="manuscript-comment-status" role="status">${this.status}</p>
      </form>
      <div class="mt-4 grid gap-3" id="manuscript-comment-list">
        ${this.comments.length === 0
          ? html`<div class="empty-state">No manuscript comments yet.</div>`
          : this.comments.map(
              (comment) => html`
                <article class="resource-card" data-comment-resource-id=${comment.id}>
                  <span class="eyebrow">${comment.status} · ${comment.authorLabel}</span>
                  <p class="mt-2 text-sm leading-6">${comment.body}</p>
                  <blockquote class="mt-2 border-l-2 border-app-line pl-3 font-sans text-xs leading-5 text-app-text-soft">
                    ${comment.anchor.exact}
                  </blockquote>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      class="button-secondary"
                      data-comment-id=${comment.id}
                      data-comment-action="open"
                      ?disabled=${comment.resolution.status !== "resolved"}
                      @click=${this.act}
                    >
                      ${anchorActionLabel(comment.resolution)}
                    </button>
                    ${comment.status === "open" && comment.resolution.status === "stale"
                      ? html`<button
                          type="button"
                          class="button-secondary"
                          data-comment-id=${comment.id}
                          data-comment-action="reanchor"
                          @click=${this.act}
                        >
                          Re-anchor to selection
                        </button>`
                      : ""}
                    ${comment.status === "open"
                      ? html`<button
                          type="button"
                          class="button-secondary"
                          data-comment-id=${comment.id}
                          data-comment-action="resolve"
                          ?disabled=${this.resolvingCommentId === comment.id}
                          @click=${this.act}
                        >
                          ${this.resolvingCommentId === comment.id ? "Resolving…" : "Resolve"}
                        </button>`
                      : ""}
                  </div>
                </article>
              `,
            )}
      </div>
    `;
  }

  protected create(event: Event): void {
    event.preventDefault();
    const passage = this.binding?.passage("create");
    if (passage) void this.createAt({ ...passage, body: this.body });
  }

  protected changeBody(event: Event): void {
    this.body = (event.currentTarget as HTMLTextAreaElement).value;
  }

  protected act(event: Event): void {
    const button = event.currentTarget as HTMLButtonElement;
    const comment = this.comments.find((item) => item.id === button.dataset.commentId);
    if (!comment) return;
    const action = button.dataset.commentAction;
    if (action === "open") this.binding?.openPassage(comment.anchor);
    else if (action === "reanchor") void this.reanchor(comment.id);
    else if (action === "resolve") void this.resolve(comment.id);
  }

  protected async resolve(commentId: string): Promise<void> {
    if (this.resolvingCommentId) return;
    this.resolvingCommentId = commentId;
    this.status = "Resolving comment…";
    try {
      const response = await fetch(`${this.apiBase}/comments/${encodeURIComponent(commentId)}/resolve`, {
        method: "POST",
        credentials: "same-origin",
      });
      await expectOk(response);
      this.binding?.completeMutation("Comment resolved; its revision history is preserved.");
    } catch (error) {
      this.status = errorMessage(error, "Could not resolve the comment.");
    } finally {
      this.resolvingCommentId = "";
    }
  }

  private async reanchor(commentId: string): Promise<void> {
    const passage = this.binding?.passage("reanchor");
    if (passage) await this.reanchorAt(commentId, passage);
  }

  private async persist(endpoint: string, input: ManuscriptPassageInput, message: string, reset = false): Promise<void> {
    this.status = reset ? "Saving comment…" : "Re-anchoring comment…";
    try {
      const response = await jsonFetch(endpoint, input);
      await expectOk(response);
      if (reset) this.body = "";
      this.status = reset ? "Comment saved without changing the Markdown source." : message;
      this.binding?.completeMutation(message);
    } catch (error) {
      this.status = errorMessage(error, reset ? "Could not save the comment." : "Could not re-anchor the comment.");
    }
  }
}

if (typeof customElements !== "undefined" && !customElements.get("manuscript-comment-list")) {
  customElements.define("manuscript-comment-list", ManuscriptCommentList);
}

declare global {
  interface HTMLElementTagNameMap {
    "manuscript-comment-list": ManuscriptCommentList;
  }
}
