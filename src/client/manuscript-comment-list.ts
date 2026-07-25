import { html, LitElement, type TemplateResult } from "lit";
import type { ManuscriptAnchorSelector, ManuscriptComment } from "../domain/workspace";
import { anchorActionLabel } from "./research-resource-presentation";

export const manuscriptCommentActionEvent = "manuscript-comment-action";

export type ManuscriptCommentAction =
  | { readonly action: "open"; readonly anchor: ManuscriptAnchorSelector }
  | { readonly action: "reanchor" | "resolve"; readonly commentId: string };

export class ManuscriptCommentList extends LitElement {
  static override properties = {
    comments: { state: true },
  };

  declare private comments: readonly ManuscriptComment[];

  constructor() {
    super();
    this.comments = [];
  }

  setComments(comments: readonly ManuscriptComment[]): void {
    this.comments = comments;
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    return html`<div class="mt-4 grid gap-3" id="manuscript-comment-list">
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
                        @click=${this.act}
                      >
                        Resolve
                      </button>`
                    : ""}
                </div>
              </article>
            `,
          )}
    </div>`;
  }

  protected act(event: Event): void {
    const button = event.currentTarget as HTMLButtonElement;
    const comment = this.comments.find((item) => item.id === button.dataset.commentId);
    if (!comment) return;
    const action = button.dataset.commentAction;
    if (action === "open") this.emit({ action, anchor: comment.anchor });
    else if (action === "reanchor" || action === "resolve") this.emit({ action, commentId: comment.id });
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
