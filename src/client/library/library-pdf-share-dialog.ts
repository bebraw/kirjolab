import { html, type TemplateResult } from "lit";
import { isLibraryPdfShare, type LibraryPdfShare } from "../../domain/library-pdf-share";
import { isRecord } from "../../domain/unknown-value";
import { errorMessage, expectOk } from "../platform/http";
import { LightDomElement } from "../platform/light-dom-controller";

export class LibraryPdfShareDialog extends LightDomElement {
  static override properties = {
    busy: { state: true },
    ready: { state: true },
    shares: { state: true },
    status: { state: true },
    name: { state: true },
  };

  declare private busy: boolean;
  declare private ready: boolean;
  declare private shares: readonly LibraryPdfShare[];
  declare private status: string;
  declare private name: string;
  private artifactId = "";

  constructor() {
    super();
    this.busy = false;
    this.ready = false;
    this.shares = [];
    this.status = "";
    this.name = "";
  }

  async open(artifact: { readonly id: string; readonly name: string }): Promise<void> {
    if (this.busy) return;
    this.artifactId = artifact.id;
    this.name = artifact.name;
    this.ready = false;
    this.shares = [];
    await this.updateComplete;
    if (!this.dialog.open) this.dialog.showModal();
    await this.loadShares();
  }

  protected override render(): TemplateResult {
    return html`
      <dialog class="ui-dialog m-auto" aria-labelledby="pdf-share-heading" @cancel=${this.cancel}>
        <header class="ui-dialog-header">
          <p class="eyebrow">Share PDF</p>
          <h2 id="pdf-share-heading" class="mt-1 text-xl font-semibold tracking-[-0.035em]">Share annotated copy</h2>
          <p class="mt-2 break-words text-sm text-app-text-soft">${this.name}</p>
        </header>
        <div class="ui-dialog-body">
          <p class="text-sm leading-6">
            Anyone with the link can read and download this PDF, including all its saved highlights, comments, page notes, and drawings.
          </p>
          <p class="mt-2 text-sm leading-6 text-app-text-soft">
            Each link shares a fixed copy. Later changes stay private. Revoking a link stops future access; downloaded copies remain.
          </p>
          ${
            this.shares.length
              ? html`
                  <ul class="mt-4 space-y-4" aria-label="Shared PDF copies">
                    ${this.shares.map(
                      (share) => html`
                        <li class="border-t border-app-line pt-3">
                          <p class="text-sm">Shared ${new Date(share.createdAt).toLocaleString()}</p>
                          <label class="field-label mt-2"
                            >Share link
                            <input class="field" readonly .value=${this.absoluteHref(share.href)} @focus=${this.selectLink} />
                          </label>
                          <div class="mt-2 flex flex-wrap gap-2">
                            <button class="button-secondary" type="button" ?disabled=${this.busy} @click=${() => this.copyShare(share)}>
                              Copy link
                            </button>
                            <a class="button-secondary" href=${share.href} target="_blank" rel="noopener noreferrer">Open copy</a>
                            <button class="button-secondary" type="button" ?disabled=${this.busy} @click=${() => this.revokeShare(share)}>
                              Revoke link
                            </button>
                          </div>
                        </li>
                      `,
                    )}
                  </ul>
                `
              : this.ready
                ? html`<p class="mt-4 text-sm text-app-text-soft">No shared copies yet.</p>`
                : null
          }
          <p class="mt-3 text-sm text-app-text-soft" role="status">${this.status}</p>
          ${!this.ready && !this.busy ? html`<button class="button-secondary mt-2" type="button" @click=${this.loadShares}>Retry</button>` : null}
        </div>
        <footer class="ui-dialog-actions">
          <button class="button-secondary" type="button" ?disabled=${this.busy} @click=${this.close}>Done</button>
          <button class="button-primary" type="button" ?disabled=${this.busy || !this.ready} @click=${this.createShare}>
            ${this.busy ? "Please wait…" : "Create share link"}
          </button>
        </footer>
      </dialog>
    `;
  }

  protected async createShare(): Promise<void> {
    if (this.busy || !this.ready) return;
    this.busy = true;
    this.status = "Preparing annotated copy…";
    try {
      const response = await fetch(this.apiPath, { method: "POST", credentials: "same-origin" });
      await expectOk(response);
      const result: unknown = await response.json();
      if (!isRecord(result) || !isLibraryPdfShare(result.share)) throw new Error("Shared PDF returned invalid data.");
      this.shares = [result.share, ...this.shares];
      this.status = "Link ready. Select Copy link to send it to your colleague.";
    } catch (error) {
      this.status = errorMessage(error, "Could not share the annotated PDF.");
    } finally {
      this.busy = false;
    }
  }

  protected async copyShare(share: LibraryPdfShare): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.absoluteHref(share.href));
      this.status = "Link copied.";
    } catch {
      this.status = "Select the share link above and copy it manually.";
    }
  }

  protected async revokeShare(share: LibraryPdfShare): Promise<void> {
    if (this.busy || !this.ready) return;
    this.busy = true;
    this.status = "Revoking link…";
    try {
      const response = await fetch(`${this.apiPath}/${encodeURIComponent(share.id)}`, { method: "DELETE", credentials: "same-origin" });
      await expectOk(response);
      this.shares = this.shares.filter((item) => item.id !== share.id);
      this.status = "Link revoked. Downloaded copies remain with their recipients.";
    } catch (error) {
      this.status = errorMessage(error, "Could not revoke the link.");
    } finally {
      this.busy = false;
    }
  }

  private async loadShares(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.status = "Loading shared copies…";
    try {
      const response = await fetch(this.apiPath, { credentials: "same-origin" });
      await expectOk(response);
      const result: unknown = await response.json();
      if (!isRecord(result) || !Array.isArray(result.shares) || !result.shares.every(isLibraryPdfShare)) {
        throw new Error("Shared PDF list returned invalid data.");
      }
      this.shares = result.shares;
      this.ready = true;
      this.status = "";
    } catch (error) {
      this.status = errorMessage(error, "Could not load shared copies.");
    } finally {
      this.busy = false;
    }
  }

  private absoluteHref(href: string): string {
    return new URL(href, window.location.origin).href;
  }

  private selectLink(event: FocusEvent): void {
    if (event.currentTarget instanceof HTMLInputElement) event.currentTarget.select();
  }

  private cancel(event: Event): void {
    if (this.busy) event.preventDefault();
  }

  private close(): void {
    if (!this.busy) this.dialog.close();
  }

  private get apiPath(): string {
    return `/api/library/pdfs/${encodeURIComponent(this.artifactId)}/shares`;
  }

  protected get dialog(): Pick<HTMLDialogElement, "open" | "showModal" | "close"> {
    return this.requiredElement<HTMLDialogElement>("dialog", "PDF sharing dialog");
  }
}

if (typeof customElements !== "undefined" && !customElements.get("library-pdf-share-dialog")) {
  customElements.define("library-pdf-share-dialog", LibraryPdfShareDialog);
}

declare global {
  interface HTMLElementTagNameMap {
    "library-pdf-share-dialog": LibraryPdfShareDialog;
  }
}
