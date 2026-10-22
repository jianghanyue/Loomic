import { randomInt, randomUUID } from "node:crypto";
import type { Built } from "./workflows.js";
import type { PromptGraph } from "./client.js";

/** Native FLUX.2 Klein 9B distilled reference-image workflow. */
export function flux2EditGraph(image: string, prompt: string, reference?: string): Built {
  const graph: PromptGraph = {
    "1": { class_type: "LoadImage", inputs: { image } },
    "2": { class_type: "ImageScaleToTotalPixels", inputs: { image: ["1", 0], upscale_method: "lanczos", megapixels: 1, resolution_steps: 16 } },
    "3": { class_type: "UNETLoader", inputs: { unet_name: "flux-2-klein-9b-fp8.safetensors", weight_dtype: "default" } },
    "4": { class_type: "CLIPLoader", inputs: { clip_name: "qwen_3_8b_fp8mixed.safetensors", type: "flux2", device: "default" } },
    "5": { class_type: "VAELoader", inputs: { vae_name: "flux2-vae.safetensors" } },
    "6": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["4", 0] } },
    "7": { class_type: "ConditioningZeroOut", inputs: { conditioning: ["6", 0] } },
    "8": { class_type: "VAEEncodeTiled", inputs: { pixels: ["2", 0], vae: ["5", 0], tile_size: 256, overlap: 64, temporal_size: 64, temporal_overlap: 8 } },
    "9": { class_type: "ReferenceLatent", inputs: { conditioning: ["6", 0], latent: ["8", 0] } },
    "10": { class_type: "ReferenceLatent", inputs: { conditioning: ["7", 0], latent: ["8", 0] } },
    "11": { class_type: "GetImageSize", inputs: { image: ["2", 0] } },
    "12": { class_type: "EmptyFlux2LatentImage", inputs: { width: ["11", 0], height: ["11", 1], batch_size: 1 } },
    "13": { class_type: "RandomNoise", inputs: { noise_seed: randomInt(0x1_0000_0000) } },
    "14": { class_type: "CFGGuider", inputs: { model: ["3", 0], positive: ["9", 0], negative: ["10", 0], cfg: 1 } },
    "15": { class_type: "KSamplerSelect", inputs: { sampler_name: "euler" } },
    "16": { class_type: "Flux2Scheduler", inputs: { steps: 4, width: ["11", 0], height: ["11", 1] } },
    "17": { class_type: "SamplerCustomAdvanced", inputs: { noise: ["13", 0], guider: ["14", 0], sampler: ["15", 0], sigmas: ["16", 0], latent_image: ["12", 0] } },
    "18": { class_type: "VAEDecodeTiled", inputs: { samples: ["17", 0], vae: ["5", 0], tile_size: 512, overlap: 64, temporal_size: 64, temporal_overlap: 8 } },
    "19": { class_type: "SaveImage", inputs: { images: ["18", 0], filename_prefix: `loomic/flux2-edit-${randomUUID()}` } },
  };
  if (reference) {
    graph.ref = { class_type: "LoadImage", inputs: { image: reference } };
    graph.refScale = { class_type: "ImageScaleToTotalPixels", inputs: { image: ["ref", 0], upscale_method: "lanczos", megapixels: 1, resolution_steps: 16 } };
    graph.refLatent = { class_type: "VAEEncodeTiled", inputs: { pixels: ["refScale", 0], vae: ["5", 0], tile_size: 256, overlap: 64, temporal_size: 64, temporal_overlap: 8 } };
    graph.refPositive = { class_type: "ReferenceLatent", inputs: { conditioning: ["9", 0], latent: ["refLatent", 0] } };
    graph.refNegative = { class_type: "ReferenceLatent", inputs: { conditioning: ["10", 0], latent: ["refLatent", 0] } };
    graph["14"]!.inputs.positive = ["refPositive", 0];
    graph["14"]!.inputs.negative = ["refNegative", 0];
  }
  return { graph, output: "19" };
}
