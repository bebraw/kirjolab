import { html, type TemplateResult } from "lit";
import * as v from "valibot";
import type { AppToast } from "./app-toast";
import { LightDomElement } from "../platform/light-dom-controller";
import { copyText } from "../platform/clipboard";
import type { OfflineWorkspaceSession } from "../platform/offline-workspace";
import { applicationVersion, cacheOfflineNavigation, registerOfflineServiceWorker } from "../platform/offline-service-worker";
import { activeLayoutDiagnosticsReport } from "./layout-diagnostics";

const healthDiagnosticsSchema = v.object({
  deployment: v.nullable(
    v.object({
      id: v.string(),
      tag: v.string(),
      timestamp: v.string(),
    }),
  ),
});

type DeploymentMetadata = v.InferOutput<typeof healthDiagnosticsSchema>["deployment"];

export class ApplicationVersionControl extends LightDomElement {
  static override properties = { version: { state: true } };

  declare private version: string;
  private report: string;
  private notices: Pick<AppToast, "show"> | null = null;

  constructor() {
    super();
    this.version = diagnosticLabel(null);
    this.report = diagnosticReport(null);
  }

  async prepareOfflineShell(
    workspace: boolean,
    offline: Pick<OfflineWorkspaceSession, "persist">,
    notices: Pick<AppToast, "pin" | "show">,
  ): Promise<void> {
    this.notices = notices;
    await this.refreshDiagnostics();
    try {
      const registered = await registerOfflineServiceWorker(navigator.serviceWorker, () => {
        notices.pin("A new version of Kirjolab is available.", {
          action: () => void offline.persist().finally(() => location.reload()),
          actionLabel: "Refresh now",
        });
      });
      if (!registered || !workspace || typeof caches === "undefined") return;
      if (await cacheOfflineNavigation(caches, fetch, location.href)) document.body.dataset.offlineReady = "true";
    } catch {
      // The online application remains fully usable when offline APIs are unavailable.
    }
  }

  protected async copyVersion(): Promise<void> {
    try {
      const layoutReport = activeLayoutDiagnosticsReport("settings-copy");
      await copyText(layoutReport ? `${this.report}\n\n${layoutReport}` : this.report);
      this.notice("Copied diagnostics.");
    } catch {
      this.notice("Could not copy diagnostics");
    }
  }

  protected override render(): TemplateResult {
    return html`<button
      class="application-version-copy"
      id="copy-application-version"
      type="button"
      aria-label="Copy diagnostics"
      @click=${this.copyVersion}
    >
      <code id="application-version">${this.version}</code><span>Copy</span>
    </button>`;
  }

  private notice(detail: string): void {
    this.notices?.show(detail);
  }

  private async refreshDiagnostics(): Promise<void> {
    try {
      const response = await fetch("/api/health", { credentials: "same-origin" });
      if (!response.ok) return;
      const result = v.safeParse(healthDiagnosticsSchema, await response.json());
      if (!result.success) return;
      this.version = diagnosticLabel(result.output.deployment);
      this.report = diagnosticReport(result.output.deployment);
    } catch {
      // Shell diagnostics remain useful when deployment metadata is unavailable.
    }
  }
}

function diagnosticLabel(deployment: DeploymentMetadata): string {
  if (!deployment) return `local · shell ${applicationVersion}`;
  const identifier = normalizedDeploymentTag(deployment) || deployment.id.slice(0, 8);
  return `deploy ${identifier} · shell ${applicationVersion}`;
}

function diagnosticReport(deployment: DeploymentMetadata): string {
  const lines = ["Kirjolab diagnostics"];
  if (deployment) {
    lines.push(
      `deployment.id=${deployment.id}`,
      `deployment.tag=${normalizedDeploymentTag(deployment) || "(none)"}`,
      `deployment.timestamp=${deployment.timestamp}`,
    );
  } else {
    lines.push("deployment=local");
  }
  lines.push(`shell=${applicationVersion}`);
  return lines.join("\n");
}

function normalizedDeploymentTag(deployment: NonNullable<DeploymentMetadata>): string {
  return deployment.tag.trim();
}

if (typeof customElements !== "undefined" && !customElements.get("application-version-control")) {
  customElements.define("application-version-control", ApplicationVersionControl);
}

declare global {
  interface HTMLElementTagNameMap {
    "application-version-control": ApplicationVersionControl;
  }
}
