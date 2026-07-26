import { html, LitElement, type TemplateResult } from "lit";
import { isWorkspaceSnapshot, type WorkspaceSnapshot } from "../domain/workspace";
import { errorMessage, expectOk } from "./http";

export const projectImagesUploadedEvent = "project-images-uploaded";

export interface ProjectImagesUploaded {
  readonly message: string;
  readonly snapshot: WorkspaceSnapshot;
}

export class ProjectImageUploadControl extends LitElement {
  static override properties = {
    busy: { state: true },
    status: { state: true },
  };

  declare private busy: boolean;
  declare private status: string;
  private apiBase = "";

  constructor() {
    super();
    this.busy = false;
    this.status = "";
  }

  configure(apiBase: string): void {
    this.apiBase = apiBase;
  }

  choose(): void {
    this.input.click();
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
      <input
        class="sr-only"
        id="project-image-upload"
        type="file"
        multiple
        accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/svg+xml"
        ?disabled=${this.busy}
        @change=${this.selectFiles}
      />
      <p class="status-line" role="status" ?hidden=${!this.status}>${this.status}</p>
    `;
  }

  protected selectFiles(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    void this.uploadFiles(Array.from(input.files ?? []));
  }

  async uploadFiles(files: readonly File[]): Promise<void> {
    const [first, ...remaining] = files;
    if (!first || this.busy) return;
    this.busy = true;
    this.status = `Adding ${remaining.length === 0 ? first.name : `${files.length} images`}…`;
    try {
      let snapshot = await this.upload(first);
      for (const file of remaining) snapshot = await this.upload(file);
      const uploaded = files.length;
      this.status = "";
      this.emit({
        message: `Added ${uploaded} ${uploaded === 1 ? "image" : "images"} to figures/.`,
        snapshot,
      });
    } catch (error) {
      this.status = errorMessage(error, "Could not add the project images.");
    } finally {
      this.busy = false;
      if (typeof this.querySelector === "function") this.input.value = "";
    }
  }

  private async upload(file: File): Promise<WorkspaceSnapshot> {
    const response = await fetch(`${this.apiBase}/assets`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": file.type, "x-file-path": encodeURIComponent(`figures/${file.name}`) },
      body: file,
    });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isWorkspaceSnapshot(value)) throw new Error("Image upload returned an invalid workspace");
    return value;
  }

  private emit(detail: ProjectImagesUploaded): void {
    this.dispatchEvent(new CustomEvent<ProjectImagesUploaded>(projectImagesUploadedEvent, { bubbles: true, detail }));
  }

  private get input(): HTMLInputElement {
    const input = this.querySelector<HTMLInputElement>("#project-image-upload");
    if (!input) throw new Error("Project image input is unavailable");
    return input;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("project-image-upload-control")) {
  customElements.define("project-image-upload-control", ProjectImageUploadControl);
}

declare global {
  interface HTMLElementTagNameMap {
    "project-image-upload-control": ProjectImageUploadControl;
  }
}
