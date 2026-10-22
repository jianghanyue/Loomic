import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ComfyClient } from "../../generation/comfyui/client.js";
import { operationWorkflows } from "../../generation/comfyui/operation-workflows.js";
import { imageOpCapabilities } from "./capabilities.js";

function inventory() {
  const wf = operationWorkflows({ opsProfile: "layerstyle", editModel: "flux2-klein-9b" });
  const graphs = [wf.cutout("x"), wf.erase("x", "m"), wf.upscale("x", 100, 100, 2), wf.layers("x", 4, ""), wf.edit("x", "blue")];
  const info: Record<string, any> = {};
  for (const { graph } of graphs) for (const node of Object.values(graph)) {
    const entry = info[node.class_type] ??= { input: { required: {} } };
    for (const key of ["unet_name", "clip_name", "vae_name", "model_name", "model"]) {
      if (typeof node.inputs[key] === "string") {
        const values: string[] = entry.input.required[key]?.[0] ?? [];
        if (!values.includes(node.inputs[key] as string)) values.push(node.inputs[key] as string);
        entry.input.required[key] = [values];
      }
    }
  }
  return info;
}
const client = (info: any, root?: string): ComfyClient => ({
  opsProfile: "layerstyle", editModel: "flux2-klein-9b",
  ...(root ? { modelsDir: root } : {}), getObjectInfo: async () => info,
  uploadImage: async () => "x", run: async () => [],
});

describe("image-op dependency inspection", () => {
  it("retains honest CPU fallbacks without ComfyUI", async () => {
    const caps = await imageOpCapabilities();
    expect(caps.ops).toEqual({ remove_background: true, upscale_image: true, split_layers: false, erase_region: false, edit_image: false, vectorize_image: true });
    expect(caps.details.upscale_image.backend).toContain("无新增细节");
  });
  it("does not claim installed nodes imply installed model weights", async () => {
    const info = inventory();
    info.UNETLoader.input.required.unet_name = [["flux-2-klein-9b-fp8.safetensors"]];
    const caps = await imageOpCapabilities(client(info));
    expect(caps.ops.edit_image).toBe(true);
    expect(caps.ops.upscale_image).toBe(true);
    expect(caps.ops.split_layers).toBe(false);
    expect(caps.details.split_layers.reason).toContain("qwen_image_layered_fp8mixed");
    expect(caps.ops.remove_background).toBe(false);
    expect(caps.ops.erase_region).toBe(false);
    expect(caps.ops.vectorize_image).toBe(true);
  });
  it("supports modern COMBO option lists and detects missing nodes", async () => {
    const info = inventory();
    info.UpscaleModelLoader.input.required.model_name = ["COMBO", { options: ["RealESRGAN_x4plus.safetensors"] }];
    delete info.ReferenceLatent;
    const caps = await imageOpCapabilities(client(info));
    expect(caps.details.upscale_image.reason).toContain("4x-UltraSharp\\4x-UltraSharp.pth");
    expect(caps.details.edit_image.reason).toContain("ReferenceLatent");
  });
  it("enables all six operations only after local assets exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "loomic-caps-"));
    try {
      const bi = join(root, "BiRefNet", "pth");
      await mkdir(bi, { recursive: true });
      await writeFile(join(bi, "BiRefNet-general-local-cache.pth"), "fixture");
      await mkdir(join(root, "lama"));
      await writeFile(join(root, "lama", "big-lama.pt"), "fixture");
      const caps = await imageOpCapabilities(client(inventory(), root));
      expect(Object.values(caps.ops).every(Boolean)).toBe(true);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("keeps vectorization usable when ComfyUI is offline", async () => {
    const comfy = client({});
    comfy.getObjectInfo = async () => { throw new Error("offline"); };
    const caps = await imageOpCapabilities(comfy);
    expect(caps.ops.vectorize_image).toBe(true);
    expect(caps.ops.edit_image).toBe(false);
    expect(caps.details.edit_image.reason).toContain("offline");
  });
});
