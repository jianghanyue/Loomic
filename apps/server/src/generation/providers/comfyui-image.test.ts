import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { canAccessModel, getImageCreditCost } from "@loomic/shared";
import { buildZImageTurboWorkflow, ComfyUIImageProvider, COMFYUI_IMAGE_MODEL } from "./comfyui-image.js";

describe("local ComfyUI image provider", () => {
  it("queues the native graph, polls its own history and downloads the generated image", async () => {
    const png = await sharp({ create: { width: 48, height: 32, channels: 3, background: "red" } }).png().toBuffer();
    const mockFetch = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/prompt") {
        const body = JSON.parse(String(init?.body));
        expect(body.prompt["1"].inputs.unet_name).toBe("z_image_turbo_bf16.safetensors");
        expect(body.prompt["4"].inputs.text).toBe("红色小屋");
        expect(body.prompt["6"].inputs).toEqual({ width: 1024, height: 576, batch_size: 1 });
        expect(body.prompt["8"].inputs).toMatchObject({ steps: 8, cfg: 1, scheduler: "simple" });
        expect(body.prompt["9"].class_type).toBe("VAEDecodeTiled");
        expect(body.prompt["9"].inputs).toMatchObject({ tile_size: 512, overlap: 64 });
        return Response.json({ prompt_id: "our-prompt" });
      }
      if (path === "/history/our-prompt") return Response.json({ "our-prompt": { outputs: { "10": { images: [{ filename: "image.png", subfolder: "loomic", type: "output" }] } } } });
      if (path === "/view") return new Response(new Uint8Array(png));
      throw new Error(`Unexpected request: ${url}`);
    });
    const result = await new ComfyUIImageProvider({ baseUrl: "http://localhost:8188", fetch: mockFetch }).generate({ model: COMFYUI_IMAGE_MODEL, prompt: "红色小屋", aspectRatio: "16:9", quality: "standard" });
    expect(result).toEqual({ url: `data:image/png;base64,${png.toString("base64")}`, width: 48, height: 32, mimeType: "image/png" });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("rejects unsupported models and reference images without submitting GPU work", async () => {
    const mockFetch = vi.fn<typeof fetch>();
    const provider = new ComfyUIImageProvider({ baseUrl: "http://localhost:8188", fetch: mockFetch });
    await expect(provider.generate({ prompt: "test", model: "other" })).rejects.toMatchObject({ code: "model_not_found" });
    await expect(provider.generate({ prompt: "test", model: COMFYUI_IMAGE_MODEL, inputImages: ["image.png"] })).rejects.toMatchObject({ code: "unsupported_input" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("reports ComfyUI node validation errors instead of claiming success", async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ node_errors: { "1": { class_type: "UNETLoader", errors: [{ message: "Model missing", details: "z_image_turbo_bf16.safetensors" }] } } }, { status: 400 }));
    await expect(new ComfyUIImageProvider({ baseUrl: "http://localhost:8188", fetch: mockFetch }).generate({ prompt: "test", model: COMFYUI_IMAGE_MODEL })).rejects.toThrow("Model missing");
  });

  it("caps local resolution at 2K and keeps local generation available without credits", () => {
    const graph = buildZImageTurboWorkflow({ model: COMFYUI_IMAGE_MODEL, prompt: "test", quality: "ultra", aspectRatio: "9:16" }, 42);
    expect(graph["6"]?.inputs).toEqual({ width: 1152, height: 2048, batch_size: 1 });
    expect(graph["8"]?.inputs.seed).toBe(42);
    expect(canAccessModel("free", COMFYUI_IMAGE_MODEL)).toBe(true);
    for (const quality of ["standard", "hd", "ultra"] as const) expect(getImageCreditCost(COMFYUI_IMAGE_MODEL, quality)).toBe(0);
  });
});
