import { afterEach, describe, expect, it, vi } from "vitest";
import { workspaceSnapshotFixture } from "../test-support/workspace-fixture";
import { ProjectImageUploadControl, projectImagesUploadedEvent, type ProjectImagesUploaded } from "./project-image-upload-control";

class TestProjectImageUploadControl extends ProjectImageUploadControl {
  renderForTest() {
    return this.render();
  }
}

describe("project image upload control", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("owns sequential image uploads and emits the final workspace", async () => {
    const control = new TestProjectImageUploadControl();
    control.configure("/api/workspaces/demo");
    const first = image("diagram one.png", "image/png");
    const second = image("figure.svg", "image/svg+xml");
    const finalSnapshot = snapshot("asset-2");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(snapshot("asset-1")))
      .mockResolvedValueOnce(Response.json(finalSnapshot));
    vi.stubGlobal("fetch", fetchMock);
    const outcomes: ProjectImagesUploaded[] = [];
    control.addEventListener(projectImagesUploadedEvent, (event) => {
      outcomes.push((event as CustomEvent<ProjectImagesUploaded>).detail);
    });

    await control.uploadFiles([first, second]);

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/workspaces/demo/assets", {
      body: first,
      credentials: "same-origin",
      headers: { "content-type": "image/png", "x-file-path": "figures%2Fdiagram%20one.png" },
      method: "POST",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/workspaces/demo/assets", {
      body: second,
      credentials: "same-origin",
      headers: { "content-type": "image/svg+xml", "x-file-path": "figures%2Ffigure.svg" },
      method: "POST",
    });
    expect(outcomes).toEqual([{ message: "Added 2 images to figures/.", snapshot: finalSnapshot }]);
  });

  it("keeps invalid responses local and remains retryable", async () => {
    const control = new TestProjectImageUploadControl();
    control.configure("/api/workspaces/demo");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ invalid: true }))
      .mockResolvedValueOnce(Response.json(snapshot("asset-1")));
    vi.stubGlobal("fetch", fetchMock);
    const outcomes: ProjectImagesUploaded[] = [];
    control.addEventListener(projectImagesUploadedEvent, (event) => {
      outcomes.push((event as CustomEvent<ProjectImagesUploaded>).detail);
    });

    await control.uploadFiles([image("bad.png", "image/png")]);
    expect(control.renderForTest()).toBeDefined();
    expect(outcomes).toEqual([]);
    await control.uploadFiles([image("retry.png", "image/png")]);
    expect(outcomes).toHaveLength(1);
  });
});

function image(name: string, type: string): File {
  return new File(["image"], name, { type });
}

function snapshot(assetId: string) {
  return {
    ...workspaceSnapshotFixture,
    assets: [
      {
        createdAt: "2026-07-26T00:00:00.000Z",
        fingerprint: "a".repeat(64),
        id: assetId,
        mediaType: "image/png" as const,
        objectKey: `assets/${assetId}`,
        path: `figures/${assetId}.png`,
        size: 5,
        updatedAt: "2026-07-26T00:00:00.000Z",
      },
    ],
  };
}
