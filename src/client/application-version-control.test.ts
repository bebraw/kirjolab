import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationVersionControl } from "./application-version-control";
import { applicationVersion } from "./offline-service-worker";

class TestApplicationVersionControl extends ApplicationVersionControl {
  copyForTest(): Promise<void> {
    return this.copyVersion();
  }

  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }
}

describe("application version control", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders and copies deployment and shell diagnostics", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          deployment: {
            id: "45b7c17d-42bf-4d4e-b101-65bcdb035b7f",
            tag: "d54d9d8",
            timestamp: "2026-07-29T17:00:00.000Z",
          },
        }),
      ),
    );
    const control = new TestApplicationVersionControl();
    const notices: string[] = [];
    await control.prepareOfflineShell(false, { persist: vi.fn() }, { pin: vi.fn(), show: (message) => notices.push(message) });

    await control.copyForTest();

    expect(writeText).toHaveBeenCalledWith(
      [
        "Kirjolab diagnostics",
        "deployment.id=45b7c17d-42bf-4d4e-b101-65bcdb035b7f",
        "deployment.tag=d54d9d8",
        "deployment.timestamp=2026-07-29T17:00:00.000Z",
        `shell=${applicationVersion}`,
      ].join("\n"),
    );
    expect(notices).toEqual(["Copied diagnostics."]);
    expect(control.renderForTest()).toBeDefined();
    expect(control.rootForTest()).toBe(control);
  });

  it("uses the textarea fallback and reports an unavailable clipboard", async () => {
    vi.stubGlobal("navigator", {});
    const input = {
      readOnly: false,
      remove: vi.fn(),
      select: vi.fn(),
      style: { opacity: "", position: "" },
      value: "",
    };
    const execCommand = vi.fn(() => true);
    vi.stubGlobal("document", {
      body: { append: vi.fn() },
      createElement: vi.fn(() => input),
      execCommand,
    });
    const control = new TestApplicationVersionControl();
    const notices: string[] = [];
    await control.prepareOfflineShell(false, { persist: vi.fn() }, { pin: vi.fn(), show: (message) => notices.push(message) });

    await control.copyForTest();
    execCommand.mockReturnValue(false);
    await control.copyForTest();

    expect(input.value).toBe(`Kirjolab diagnostics\ndeployment=local\nshell=${applicationVersion}`);
    expect(input.select).toHaveBeenCalledTimes(2);
    expect(input.remove).toHaveBeenCalledTimes(2);
    expect(notices).toEqual(["Copied diagnostics.", "Could not copy diagnostics"]);
  });

  it("owns offline shell registration, navigation caching, and update refresh", async () => {
    let controllerChanged: (() => void) | undefined;
    const update = vi.fn().mockResolvedValue(undefined);
    const register = vi.fn().mockResolvedValue({ update });
    const serviceWorker = {
      addEventListener: vi.fn((_type: string, listener: () => void) => {
        controllerChanged = listener;
      }),
      controller: {},
      ready: Promise.resolve({}),
      register,
    };
    const put = vi.fn().mockResolvedValue(undefined);
    const cacheStorage = { open: vi.fn().mockResolvedValue({ put }) };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ deployment: null }))
      .mockResolvedValueOnce(new Response("shell"));
    const persist = vi.fn().mockResolvedValue(undefined);
    const reload = vi.fn();
    const notices = { pin: vi.fn(), show: vi.fn() };
    const body = { dataset: {} as DOMStringMap };
    vi.stubGlobal("navigator", { serviceWorker });
    vi.stubGlobal("caches", cacheStorage);
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("document", { body });
    vi.stubGlobal("location", { href: "https://example.test/editor/demo", reload });
    const control = new TestApplicationVersionControl();

    await control.prepareOfflineShell(true, { persist }, notices);

    expect(register).toHaveBeenCalledWith("/service-worker.js", { scope: "/" });
    expect(update).toHaveBeenCalledOnce();
    expect(cacheStorage.open).toHaveBeenCalledOnce();
    expect(put).toHaveBeenCalledOnce();
    expect(body.dataset.offlineReady).toBe("true");
    controllerChanged?.();
    expect(notices.pin).toHaveBeenCalledWith("A new version of Kirjolab is available.", {
      action: expect.any(Function),
      actionLabel: "Refresh now",
    });
    const refresh = notices.pin.mock.calls[0]?.[1]?.action;
    refresh?.();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(persist).toHaveBeenCalledOnce();
  });

  it("keeps the application usable when offline shell preparation fails", async () => {
    vi.stubGlobal("navigator", { serviceWorker: { register: vi.fn().mockRejectedValue(new Error("unavailable")) } });
    const control = new TestApplicationVersionControl();

    await expect(control.prepareOfflineShell(true, { persist: vi.fn() }, { pin: vi.fn(), show: vi.fn() })).resolves.toBeUndefined();
  });
});
