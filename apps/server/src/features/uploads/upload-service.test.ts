import { describe, expect, it, vi } from "vitest";
import { createUploadService } from "./upload-service.js";
import { createCanvasService } from "../canvas/canvas-service.js";

const user = { accessToken: "test", id: "user", email: "test@example.com", userMetadata: {} };

function fakeClient(row: object, signResult: object) {
  const createSignedUrl = vi.fn().mockResolvedValue(signResult);
  const getPublicUrl = vi.fn(() => { throw new Error("Private buckets cannot use a public URL"); });
  const single = vi.fn().mockResolvedValue({ data: row, error: null });
  const client = { from: () => ({ select: () => ({ eq: () => ({ single }) }) }), storage: { from: () => ({ createSignedUrl, getPublicUrl }) } };
  return { client, createSignedUrl, getPublicUrl };
}

describe("private local image assets", () => {
  it("returns a signed URL for project-assets without publishing the bucket", async () => {
    const fake = fakeClient({ bucket: "project-assets", object_path: "workspace/image.png" }, { data: { signedUrl: "http://local/signed.png" }, error: null });
    const service = createUploadService({ createUserClient: () => fake.client as any });
    await expect(service.getAssetUrl(user, "asset")).resolves.toBe("http://local/signed.png");
    expect(fake.createSignedUrl).toHaveBeenCalledWith("workspace/image.png", 3600);
    expect(fake.getPublicUrl).not.toHaveBeenCalled();
  });

  it("fails when URL signing fails rather than returning an unusable URL", async () => {
    const fake = fakeClient({ bucket: "project-assets", object_path: "workspace/image.png" }, { data: null, error: { message: "denied" } });
    await expect(createUploadService({ createUserClient: () => fake.client as any }).getAssetUrl(user, "asset")).rejects.toMatchObject({ code: "upload_failed" });
  });

  it("refreshes the signed URL when a saved canvas is reopened", async () => {
    const fake = fakeClient({ id: "canvas", name: "test", project_id: "project", content: { elements: [], appState: {}, files: { image: { id: "image", mimeType: "image/png", dataURL: "oss://project-assets/workspace/image.png" } } } }, { data: { signedUrl: "http://local/refreshed.png" }, error: null });
    const result = await createCanvasService({ createUserClient: () => fake.client as any }).getCanvas(user, "canvas");
    expect((result.content as any).files.image.storageUrl).toBe("http://local/refreshed.png");
    expect(fake.getPublicUrl).not.toHaveBeenCalled();
  });
});
