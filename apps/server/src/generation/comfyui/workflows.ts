// Graph builders for the bundled workflows (ported from ComfyArt's
// src/workflows.ts). Nodes are located by `@tag` in their _meta.title.

import { readFileSync } from "node:fs";

import type { PromptGraph } from "./client.js";

const WORKFLOW_DIR = new URL("../../../comfy-workflows/", import.meta.url);
const cache = new Map<string, PromptGraph>();

export type Built = { graph: PromptGraph; output: string };

function load(file: string): PromptGraph {
  let graph = cache.get(file);
  if (!graph) {
    graph = JSON.parse(
      readFileSync(new URL(file, WORKFLOW_DIR), "utf8"),
    ) as PromptGraph;
    cache.set(file, graph);
  }
  return structuredClone(graph);
}

function tags(node: PromptGraph[string]): string[] {
  return (node._meta?.title ?? "")
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((w) => w.startsWith("@"));
}

export function loadNamed<T extends string>(
  file: string,
  ...names: T[]
): { graph: PromptGraph; id: Record<T, string> } {
  const graph = load(file);
  const ids = Object.keys(graph);
  const id = Object.fromEntries(
    names.map((name) => {
      const found = ids.find((k) =>
        tags(graph[k]!).includes(`@${name.toLowerCase()}`),
      );
      if (!found)
        throw new Error(`workflow ${file} has no node titled @${name}`);
      return [name, found];
    }),
  ) as Record<T, string>;
  return { graph, id };
}

const node = (g: PromptGraph, id: string) => g[id]!;
const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

export function cutoutGraph(image: string): Built {
  const { graph: g, id } = loadNamed(
    "cutout-birefnet.api.json",
    "image",
    "save",
  );
  node(g, id.image).inputs.image = image;
  return { graph: g, output: id.save };
}

const UPSCALE_MODEL_FACTOR = 4;

/** UltraSharp is a fixed 4× model; other factors rescale before or after it. */
export function upscaleGraph(
  image: string,
  width: number,
  height: number,
  factor: number,
): Built {
  const { graph: g, id } = loadNamed(
    "upscale-ultrasharp-4x.api.json",
    "image",
    "upscale",
    "save",
  );
  node(g, id.image).inputs.image = image;
  if (factor > UPSCALE_MODEL_FACTOR) {
    g.pre = {
      class_type: "ImageScaleBy",
      inputs: {
        image: [id.image, 0],
        upscale_method: "lanczos",
        scale_by: factor / UPSCALE_MODEL_FACTOR,
      },
    };
    node(g, id.upscale).inputs.image = ["pre", 0];
  } else if (factor < UPSCALE_MODEL_FACTOR) {
    g.post = {
      class_type: "ImageScale",
      inputs: {
        image: [id.upscale, 0],
        upscale_method: "lanczos",
        width: Math.round(width * factor),
        height: Math.round(height * factor),
        crop: "disabled",
      },
    };
    node(g, id.save).inputs.images = ["post", 0];
  }
  return { graph: g, output: id.save };
}

/** `mask` is an image whose transparent pixels mark the area to erase. */
export function eraseGraph(image: string, mask: string): Built {
  const { graph: g, id } = loadNamed(
    "erase-lama.api.json",
    "image",
    "mask",
    "inpaint",
    "save",
  );
  node(g, id.image).inputs.image = image;
  node(g, id.mask).inputs.image = mask;
  node(g, id.inpaint).inputs.seed = randomSeed();
  return { graph: g, output: id.save };
}

export function editGraph(
  image: string,
  prompt: string,
  reference?: string,
): Built {
  const { graph: g, id } = loadNamed(
    "edit-qwen-image-2.1.api.json",
    "image",
    "prompt",
    "sampler",
    "save",
  );
  node(g, id.image).inputs.image = image;
  if (reference) {
    g.ref = { class_type: "LoadImage", inputs: { image: reference } };
    node(g, id.prompt).inputs["images.image_2"] = ["ref", 0];
  }
  node(g, id.prompt).inputs.prompt = prompt;
  node(g, id.sampler).inputs.seed = randomSeed();
  return { graph: g, output: id.save };
}

export function layersGraph(
  image: string,
  layers: number,
  prompt: string,
): Built {
  const { graph: g, id } = loadNamed(
    "layers-qwen-image-layered.api.json",
    "image",
    "scale",
    "prompt",
    "latent",
    "sampler",
    "save",
  );
  node(g, id.image).inputs.image = image;
  node(g, id.scale).inputs.largest_size = 1024;
  node(g, id.prompt).inputs.value =
    prompt || "An image with a foreground subject and a background.";
  node(g, id.latent).inputs.layers = layers;
  node(g, id.sampler).inputs.seed = randomSeed();
  return { graph: g, output: id.save };
}
