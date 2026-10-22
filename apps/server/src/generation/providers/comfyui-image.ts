import { randomInt, randomUUID } from "node:crypto";
import sharp from "sharp";

import { createComfyClient, type ComfyClientOptions, type PromptGraph } from "../comfyui/client.js";
import type { GeneratedImage, ImageGenerateParams, ImageProvider } from "../types.js";
import { GenerationError } from "../utils.js";

export const COMFYUI_IMAGE_MODEL = "comfyui/z-image-turbo";

/** Native ComfyUI Z-Image Turbo template, using models already installed locally. */
export function buildZImageTurboWorkflow(params: ImageGenerateParams, seed: number): PromptGraph {
  const ratios: Record<string, [number, number]> = {
    "1:1": [1, 1], "16:9": [16, 9], "9:16": [9, 16],
    "4:3": [4, 3], "3:4": [3, 4], "4:5": [4, 5],
    "5:4": [5, 4], "2:3": [2, 3], "3:2": [3, 2],
  };
  const [rw, rh] = ratios[params.aspectRatio ?? "1:1"] ?? [1, 1];
  // Bound native generation to 2K to fit the local GPU. No silent 4K claim.
  const maxSize = params.quality === "ultra" ? 2048 : params.quality === "hd" ? 1536 : 1024;
  const width = Math.max(16, Math.round((maxSize * rw / Math.max(rw, rh)) / 16) * 16);
  const height = Math.max(16, Math.round((maxSize * rh / Math.max(rw, rh)) / 16) * 16);
  return {
    "1": { class_type: "UNETLoader", inputs: { unet_name: "z_image_turbo_bf16.safetensors", weight_dtype: "default" } },
    "2": { class_type: "CLIPLoader", inputs: { clip_name: "qwen_3_4b.safetensors", type: "lumina2", device: "default" } },
    "3": { class_type: "VAELoader", inputs: { vae_name: "ae.safetensors" } },
    "4": { class_type: "CLIPTextEncode", inputs: { text: params.prompt, clip: ["2", 0] } },
    "5": { class_type: "ConditioningZeroOut", inputs: { conditioning: ["4", 0] } },
    "6": { class_type: "EmptySD3LatentImage", inputs: { width, height, batch_size: 1 } },
    "7": { class_type: "ModelSamplingAuraFlow", inputs: { model: ["1", 0], shift: 3 } },
    "8": { class_type: "KSampler", inputs: {
      model: ["7", 0], positive: ["4", 0], negative: ["5", 0], latent_image: ["6", 0],
      seed, steps: 8, cfg: 1, sampler_name: "res_multistep", scheduler: "simple", denoise: 1,
    } },
    "9": { class_type: "VAEDecodeTiled", inputs: { samples: ["8", 0], vae: ["3", 0], tile_size: 512, overlap: 64, temporal_size: 64, temporal_overlap: 8 } },
    "10": { class_type: "SaveImage", inputs: { images: ["9", 0], filename_prefix: `loomic/z-image-${randomUUID()}` } },
  };
}

export class ComfyUIImageProvider implements ImageProvider {
  readonly name = "comfyui";
  readonly models = [{
    id: COMFYUI_IMAGE_MODEL,
    displayName: "本地 ComfyUI · Z-Image Turbo",
    outputFormats: ["png", "jpg", "webp"] as const,
    supportsTransparentBackground: false,
    description: "Local GPU text-to-image. Chinese/English prompts; no cloud API key or Loomic credits. Native sizes: standard 1K, hd 1.5K, ultra 2K. Reference-image editing is not supported.",
  }];
  private readonly client: ReturnType<typeof createComfyClient>;

  constructor(options: ComfyClientOptions) {
    this.client = createComfyClient(options);
  }

  async generate(params: ImageGenerateParams): Promise<GeneratedImage> {
    if (params.model !== COMFYUI_IMAGE_MODEL) {
      throw new GenerationError(this.name, "model_not_found", `Unknown ComfyUI image model: ${params.model}`);
    }
    if (params.inputImages?.length) {
      throw new GenerationError(this.name, "unsupported_input", "本地 Z-Image Turbo 当前仅支持文生图，请移除参考图后重试。");
    }
    try {
      const graph = buildZImageTurboWorkflow(params, randomInt(0x1_0000_0000));
      const [png] = await this.client.run(graph, "10");
      if (!png) throw new GenerationError(this.name, "no_output", "ComfyUI returned no image.");
      const format = params.outputFormat ?? "png";
      const encoded = format === "png" ? png : await sharp(png).toFormat(format === "jpg" ? "jpeg" : "webp").toBuffer();
      const metadata = await sharp(encoded).metadata();
      if (!metadata.width || !metadata.height) throw new GenerationError(this.name, "no_output", "ComfyUI returned invalid image data.");
      const mimeType = format === "jpg" ? "image/jpeg" : `image/${format}`;
      return { url: `data:${mimeType};base64,${encoded.toString("base64")}`, mimeType, width: metadata.width, height: metadata.height };
    } catch (error) {
      if (error instanceof GenerationError) throw error;
      throw new GenerationError(this.name, "comfyui_failed", error instanceof Error ? error.message : "ComfyUI generation failed.");
    }
  }
}
