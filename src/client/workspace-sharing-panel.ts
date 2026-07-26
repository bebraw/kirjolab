import { html, LitElement, type TemplateResult } from "lit";
import type { WorkspaceMember } from "../domain/workspace";
import type { ShareLinkStatus } from "./app-contracts";

export type WorkspaceShareKind = "read-only" | "edit";
export type WorkspaceShareAction = "create" | "revoke";

export interface WorkspaceSharingActionDetail {
  readonly action: WorkspaceShareAction;
  readonly kind: WorkspaceShareKind;
}

export const workspaceSharingActionEvent = "workspace-sharing-action";
export const workspaceSharingInviteEvent = "workspace-sharing-invite";
export const workspaceSharingNoticeEvent = "workspace-sharing-notice";

interface ShareLinkPresentation {
  readonly active: boolean;
  readonly allowed: boolean;
  readonly description: string;
  readonly href: string | null;
}

const checkingShareLink: ShareLinkPresentation = {
  active: false,
  allowed: true,
  description: "Checking link access…",
  href: null,
};

export class WorkspaceSharingPanel extends LitElement {
  static override properties = {
    editShare: { state: true },
    inviteEmail: { state: true },
    members: { state: true },
    readOnlyShare: { state: true },
  };

  declare private editShare: ShareLinkPresentation;
  declare private inviteEmail: string;
  declare private members: readonly WorkspaceMember[] | null;
  declare private readOnlyShare: ShareLinkPresentation;

  constructor() {
    super();
    this.editShare = checkingShareLink;
    this.inviteEmail = "";
    this.members = null;
    this.readOnlyShare = checkingShareLink;
  }

  setMembers(members: readonly WorkspaceMember[]): void {
    this.members = members;
  }

  setShareStatus(kind: WorkspaceShareKind, status: ShareLinkStatus): void {
    this.setSharePresentation(kind, {
      active: status.active,
      allowed: true,
      description: shareLinkDescription(kind, status),
      href: status.href ? new URL(status.href, location.origin).href : null,
    });
  }

  setShareForbidden(kind: WorkspaceShareKind): void {
    this.setSharePresentation(kind, {
      active: false,
      allowed: false,
      description: `Only the project owner can manage ${kind === "read-only" ? "read-only" : "edit"} links.`,
      href: null,
    });
  }

  clearInvite(): void {
    this.inviteEmail = "";
  }

  open(): void {
    this.dialog.showModal();
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
      <div class="p-5">
        <p class="eyebrow">Project access</p>
        <h2 class="mt-1 text-xl font-semibold tracking-[-0.035em]">Collaborators</h2>
        ${this.shareLinkSection("read-only", this.readOnlyShare)} ${this.shareLinkSection("edit", this.editShare)}
        <div class="mt-4 space-y-2" id="workspace-member-list">
          ${this.members
            ? this.members.map(
                (member) => html`
                  <div class="resource-card flex items-center justify-between gap-3 font-sans text-xs">
                    <span class="truncate">${member.email}</span>
                    <span class="eyebrow block">${member.role}</span>
                  </div>
                `,
              )
            : html`<div class="empty-state">Loading members…</div>`}
        </div>
        <form class="mt-5 border-t border-app-line pt-5" id="invite-member-form" @submit=${this.inviteMember}>
          <label class="field-label"
            >Invite by email
            <input
              class="field"
              id="invite-member-email"
              type="email"
              maxlength="320"
              required
              placeholder="researcher@example.org"
              .value=${this.inviteEmail}
              @input=${this.updateInviteEmail}
          /></label>
          <div class="mt-4 flex justify-end gap-2">
            <button class="button-secondary" id="close-share-workspace" type="button" @click=${this.close}>Close</button>
            <button class="button-primary" type="submit">Invite collaborator</button>
          </div>
        </form>
      </div>
    `;
  }

  private shareLinkSection(kind: WorkspaceShareKind, presentation: ShareLinkPresentation): TemplateResult {
    const readOnly = kind === "read-only";
    const prefix = readOnly ? "read-only" : "edit";
    const heading = readOnly ? "Read-only link" : "Edit link";
    const inputLabel = readOnly ? "Read-only share link" : "Editable share link";
    return html`
      <section
        class=${readOnly ? "mt-4 border-y border-app-line py-4" : "border-b border-app-line py-4"}
        aria-labelledby="${prefix}-share-heading"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="font-sans text-xs font-bold" id="${prefix}-share-heading">${heading}</h3>
            <p class="mt-1 font-sans text-xs leading-5 text-app-text-soft" id="${prefix}-share-status">${presentation.description}</p>
          </div>
          <button
            class="button-secondary shrink-0"
            id="create-${prefix}-share"
            type="button"
            ?hidden=${!presentation.allowed}
            @click=${() => this.requestShareAction(kind, "create")}
          >
            ${presentation.active ? "Replace link" : "Create link"}
          </button>
        </div>
        <div class="mt-3 gap-2 sm:grid-cols-[1fr_auto] ${presentation.href ? "grid" : "hidden"}" id="${prefix}-share-link-row">
          <label class="sr-only" for="${prefix}-share-link">${inputLabel}</label>
          <input class="field" id="${prefix}-share-link" type="text" readonly .value=${presentation.href ?? ""} />
          <button class="button-secondary" id="copy-${prefix}-share" type="button" @click=${() => void this.copyShareLink(kind)}>
            Copy link
          </button>
        </div>
        <button
          class="mt-3 font-sans text-xs font-bold text-app-error"
          id="revoke-${prefix}-share"
          type="button"
          ?hidden=${!presentation.active}
          @click=${() => this.requestShareAction(kind, "revoke")}
        >
          Revoke ${readOnly ? "read-only " : "edit "}link
        </button>
      </section>
    `;
  }

  private setSharePresentation(kind: WorkspaceShareKind, presentation: ShareLinkPresentation): void {
    if (kind === "read-only") this.readOnlyShare = presentation;
    else this.editShare = presentation;
  }

  private updateInviteEmail(event: InputEvent): void {
    this.inviteEmail = (event.currentTarget as HTMLInputElement).value;
  }

  private inviteMember(event: SubmitEvent): void {
    event.preventDefault();
    this.dispatchEvent(
      new CustomEvent<string>(workspaceSharingInviteEvent, {
        bubbles: true,
        composed: true,
        detail: this.inviteEmail,
      }),
    );
  }

  close(): void {
    this.dialog.close();
  }

  private get dialog(): HTMLDialogElement {
    const dialog = this.closest("dialog");
    if (!(dialog instanceof HTMLDialogElement)) throw new Error("Workspace sharing panel requires a dialog parent");
    return dialog;
  }

  private requestShareAction(kind: WorkspaceShareKind, action: WorkspaceShareAction): void {
    this.dispatchEvent(
      new CustomEvent<WorkspaceSharingActionDetail>(workspaceSharingActionEvent, {
        bubbles: true,
        composed: true,
        detail: { action, kind },
      }),
    );
  }

  private async copyShareLink(kind: WorkspaceShareKind): Promise<void> {
    const href = kind === "read-only" ? this.readOnlyShare.href : this.editShare.href;
    if (!href) return;
    await navigator.clipboard.writeText(href);
    this.dispatchEvent(
      new CustomEvent<string>(workspaceSharingNoticeEvent, {
        bubbles: true,
        composed: true,
        detail: `${kind === "read-only" ? "Read-only" : "Edit"} link copied.`,
      }),
    );
  }
}

export function shareLinkDescription(kind: WorkspaceShareKind, status: ShareLinkStatus): string {
  if (status.href) {
    return kind === "read-only"
      ? "Anyone with this link can inspect the live manuscript and project source. You can copy it again at any time."
      : "Anyone with this link can change authored project files. You can copy it again at any time.";
  }
  if (status.active)
    return "This older link remains active, but its secret cannot be recovered. Replace it once to make the new link available here.";
  return kind === "read-only"
    ? "Create a bearer link for people who should inspect, but not edit, this project."
    : "Create a separate bearer link for someone who may edit authored Markdown without private project access.";
}

if (typeof customElements !== "undefined" && !customElements.get("workspace-sharing-panel")) {
  customElements.define("workspace-sharing-panel", WorkspaceSharingPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "workspace-sharing-panel": WorkspaceSharingPanel;
  }
}
