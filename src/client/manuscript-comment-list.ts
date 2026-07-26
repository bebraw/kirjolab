import { html, LitElement, type TemplateResult } from "lit";
import type { ManuscriptAnchorSelector, ManuscriptComment } from "../domain/workspace";
import { errorMessage, expectOk } from "./http";
import { anchorActionLabel } from "./research-resource-presentation";

export const manuscriptCommentActionEvent = "manuscript-comment-action";
export const manuscriptCommentCreateEvent = "manuscript-comment-create";

export type ManuscriptCommentAction =
  | { readonly action: "open"; readonly anchor: ManuscriptAnchorSelector }
  | { readonly action: "reanchor"; readonly commentId: string }
  | { readonly action: "resolved"; readonly message: string };

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

  setComments(comments: readonly ManuscriptComment[]): void {
    this.comments = comments;
  }

  markSaved(): void {
    this.body = "";
    this.status = "Comment saved without changing the Markdown source.";
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
    this.dispatchEvent(new CustomEvent<string>(manuscriptCommentCreateEvent, { bubbles: true, detail: this.body }));
  }

  protected changeBody(event: Event): void {
    this.body = (event.currentTarget as HTMLTextAreaElement).value;
  }

  protected act(event: Event): void {
    const button = event.currentTarget as HTMLButtonElement;
    const comment = this.comments.find((item) => item.id === button.dataset.commentId);
    if (!comment) return;
    const action = button.dataset.commentAction;
    if (action === "open") this.emit({ action, anchor: comment.anchor });
    else if (action === "reanchor") this.emit({ action, commentId: comment.id });
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
      this.emit({ action: "resolved", message: "Comment resolved; its revision history is preserved." });
    } catch (error) {
      this.status = errorMessage(error, "Could not resolve the comment.");
    } finally {
      this.resolvingCommentId = "";
    }
  }

  private emit(detail: ManuscriptCommentAction): void {
    this.dispatchEvent(new CustomEvent(manuscriptCommentActionEvent, { bubbles: true, composed: true, detail }));
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
