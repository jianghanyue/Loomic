// Image operations on canvas images (ported from ComfyArt): each reads an
// image element, runs a ComfyUI workflow or a local fallback, and places the
// result(s) beside the original. Shared by the agent tools and the HTTP route.

import sharp from "sharp";
import { operationWorkflows } from "../../generation/comfyui/operation-workflows.js";
import { imageOpCapabilities } from "./capabilities.js";

import {
  type ComfyClient,
  ComfyError,
} from "../../generation/comfyui/client.js";
import {
  CANVAS_IMAGE_MAX_PX,
  type CanvasClient,
  CanvasError,
  type NewCanvasImage,
  insertImagesBeside,
  loadCanvas,
  readCanvasImage,
  saveCanvasState,
} from "../canvas/canvas-state.js";
import {
  colorKeyCutout,
  plainUpscale,
  regionMask,
  vectorizeToSvg,
} from "./local-ops.js";

export const IMAGE_OPS = [
  "remove_background",
  "upscale_image",
  "split_layers",
  "erase_region",
  "edit_image",
  "vectorize_image",
] as const;
export type ImageOpName = (typeof IMAGE_OPS)[number];

/** Operations that cannot run without ComfyUI. */
export const COMFY_ONLY_OPS: ReadonlySet<ImageOpName> = new Set([
  "split_layers",
  "erase_region",
  "edit_image",
]);

export type ImageOpInput = {
  op: ImageOpName;
  elementId: string;
  /** remove_background: "auto" uses the model when ComfyUI is configured. */
  mode?: "auto" | "model" | "color";
  /** remove_background (color mode): RGB distance that counts as background. */
  tolerance?: number;
  /** upscale_image: 1.5–4. */
  factor?: number;
  /** split_layers: 2–8. */
  layers?: number;
  /** edit_image (required) / split_layers (optional description). */
  prompt?: string;
  /** edit_image: second image used as style or content reference. */
  referenceElementId?: string;
  /** erase_region: area in fractions (0–1) of the image. */
  region?: { x: number; y: number; width: number; height: number };
  /** vectorize_image: palette size. */
  colors?: number;
};

export type ImageOpContext = {
  client: CanvasClient;
  canvasId: string;
  comfy?: ComfyClient | undefined;
  /** Store a full-size result outside the canvas; returns an accessible signed URL. */
  storeOriginal?: (buffer: Buffer, name: string) => Promise<string | undefined>;
};

export type ImageOpResult = {
  elementIds: string[];
  /** "model" (ComfyUI) or the local fallback that ran. */
  method: string;
  summary: string;
  originalUrl?: string;
};

export async function runImageOp(
  ctx: ImageOpContext,
  input: ImageOpInput,
): Promise<ImageOpResult> {
  if (ctx.comfy?.opsProfile && !(input.op === "remove_background" && input.mode === "color")) {
    const caps = await imageOpCapabilities(ctx.comfy);
    if (!caps.ops[input.op]) throw new CanvasError("model_unavailable", caps.details[input.op].reason ?? "模型不可用");
  }
  const state = await loadCanvas(ctx.client, ctx.canvasId);
  const { element, buffer } = await readCanvasImage(
    ctx.client,
    state,
    input.elementId,
  );
  const title = String(
    (element.customData as { title?: string } | undefined)?.title ?? "图片",
  );
  const derived = { derivedFrom: input.elementId, op: input.op };

  const outcome = await execute(ctx, state, input, buffer, title);
  const created = await insertImagesBeside(
    state,
    element,
    outcome.images.map((img) => ({
      ...img,
      customData: { ...derived, ...img.customData },
    })),
  );
  await saveCanvasState(ctx.client, ctx.canvasId, state);

  return {
    elementIds: created.map((e) => e.id as string),
    method: outcome.method,
    summary: outcome.summary,
    ...(outcome.originalUrl ? { originalUrl: outcome.originalUrl } : {}),
  };
}

type Outcome = {
  images: NewCanvasImage[];
  method: string;
  summary: string;
  originalUrl?: string;
};

async function execute(
  ctx: ImageOpContext,
  state: Awaited<ReturnType<typeof loadCanvas>>,
  input: ImageOpInput,
  source: Buffer,
  title: string,
): Promise<Outcome> {
  switch (input.op) {
    case "remove_background": {
      const mode = input.mode ?? "auto";
      if (mode === "model" || (mode === "auto" && ctx.comfy)) {
        const [out] = await runComfy(ctx, source, (image) =>
          operationWorkflows(ctx.comfy!).cutout(image),
        );
        return {
          images: [
            { buffer: await trimTransparent(out!), title: `${title} · 抠图` },
          ],
          method: "model",
          summary: "Removed the background with BiRefNet.",
        };
      }
      const out = await colorKeyCutout(
        source,
        input.tolerance !== undefined ? { tolerance: input.tolerance } : {},
      );
      return {
        images: [{ buffer: out.buffer, title: `${title} · 抠图` }],
        method: "color_key",
        summary: `Removed the solid background colour (${out.width}×${out.height}px result).`,
      };
    }

    case "upscale_image": {
      const factor = Math.min(4, Math.max(1.5, input.factor ?? 2));
      const meta = await sharp(source).metadata();
      const [w, h] = [meta.width ?? 1, meta.height ?? 1];
      let out: Buffer;
      let method: string;
      if (ctx.comfy) {
        [out] = (await runComfy(ctx, source, (image) =>
          operationWorkflows(ctx.comfy!).upscale(image, w, h, factor),
        )) as [Buffer];
        method = "model";
      } else {
        out = (await plainUpscale(source, factor)).buffer;
        method = "resize";
      }
      const [tw, th] = [Math.round(w * factor), Math.round(h * factor)];
      if (meta.hasAlpha) {
        // ComfyUI LoadImage exposes RGB separately from alpha. Preserve the
        // source cut-out's scaled alpha instead of making it opaque on upscale.
        const outputMeta = await sharp(out).metadata();
        const alpha = await sharp(source).extractChannel("alpha")
          .resize(outputMeta.width ?? tw, outputMeta.height ?? th)
          .raw().toBuffer({ resolveWithObject: true });
        const rgb = await sharp(out).removeAlpha().toBuffer();
        out = await sharp(rgb).joinChannel(alpha.data, {
          raw: { width: alpha.info.width, height: alpha.info.height, channels: 1 },
        }).png().toBuffer();
      }
      const originalUrl = await ctx.storeOriginal?.(
        out,
        `upscale-${tw}x${th}.png`,
      );
      const capped = Math.max(tw, th) > CANVAS_IMAGE_MAX_PX;
      return {
        images: [
          {
            buffer: out,
            title: `${title} · ${factor}×`,
            customData: {
              originalWidth: tw,
              originalHeight: th,
              ...(originalUrl ? { originalUrl } : {}),
            },
          },
        ],
        method,
        summary:
          `Upscaled ${w}×${h} → ${tw}×${th}px ${method === "model" ? "with 4x-UltraSharp" : "with a plain Lanczos resize (ComfyUI not configured, no detail is added)"}.` +
          (capped
            ? ` The canvas shows a ${CANVAS_IMAGE_MAX_PX}px preview${originalUrl ? "; the full-size file is at originalUrl" : ""}.`
            : ""),
        ...(originalUrl ? { originalUrl } : {}),
      };
    }

    case "split_layers": {
      const layers = Math.round(Math.min(8, Math.max(2, input.layers ?? 4)));
      const outs = await runComfy(ctx, source, (image) =>
        operationWorkflows(requireComfy(ctx)).layers(image, layers, input.prompt ?? ""),
      );
      return {
        images:
          outs.map((buffer, i) => ({
            // Keep the full registered frame: trimming each layer independently
            // destroys their alignment when the user overlays them later.
            buffer,
            title: `${title} · 图层 ${i + 1}`,
          })),
        method: "model",
        summary: `Split the image into ${outs.length} layers with Qwen-Image-Layered (first is usually the background).`,
      };
    }

    case "erase_region": {
      if (!input.region)
        throw new CanvasError("invalid_input", "erase_region needs a region.");
      const meta = await sharp(source).metadata();
      const mask = await regionMask(
        meta.width ?? 1,
        meta.height ?? 1,
        input.region,
      );
      const comfy = requireComfy(ctx);
      const maskName = await upload(comfy, mask, `${input.elementId}-mask.png`);
      const [out] = await runComfy(ctx, source, (image) =>
        operationWorkflows(comfy).erase(image, maskName),
      );
      return {
        images: [{ buffer: out!, title: `${title} · 擦除` }],
        method: "model",
        summary: "Erased the region with LaMa.",
      };
    }

    case "edit_image": {
      const prompt = input.prompt?.trim();
      if (!prompt)
        throw new CanvasError("invalid_input", "edit_image needs a prompt.");
      const comfy = requireComfy(ctx);
      let reference: string | undefined;
      if (input.referenceElementId) {
        const ref = await readCanvasImage(
          ctx.client,
          state,
          input.referenceElementId,
        );
        reference = await upload(
          comfy,
          ref.buffer,
          `${input.referenceElementId}.png`,
        );
      }
      const [out] = await runComfy(ctx, source, (image) =>
        operationWorkflows(comfy).edit(image, prompt, reference),
      );
      return {
        images: [{ buffer: out!, title: `${title} · 编辑` }],
        method: "model",
        summary: `Edited the image with ${comfy.editModel === "flux2-klein-9b" ? "local FLUX.2 Klein 9B" : "Qwen-Image-Edit"}: "${prompt.slice(0, 80)}".`,
      };
    }

    case "vectorize_image": {
      const out = await vectorizeToSvg(
        source,
        input.colors !== undefined ? { colors: input.colors } : {},
      );
      return {
        images: [
          {
            buffer: out.buffer,
            title: `${title} · 矢量`,
            svg: { width: out.width, height: out.height },
          },
        ],
        method: "trace",
        summary: `Traced into an SVG with at most ${input.colors ?? 16} colours.`,
      };
    }
  }
}

function requireComfy(ctx: ImageOpContext): ComfyClient {
  if (!ctx.comfy) {
    throw new CanvasError(
      "comfyui_not_configured",
      "This operation needs a ComfyUI server. Set COMFYUI_BASE_URL and install the models listed in apps/server/comfy-workflows/README.md.",
    );
  }
  return ctx.comfy;
}

async function upload(
  comfy: ComfyClient,
  buffer: Buffer,
  name: string,
): Promise<string> {
  const png = await sharp(buffer).png().toBuffer();
  return wrapComfy(() => comfy.uploadImage(png, name));
}

async function runComfy(
  ctx: ImageOpContext,
  source: Buffer,
  build: (image: string) => {
    graph: Parameters<ComfyClient["run"]>[0];
    output: string;
  },
): Promise<Buffer[]> {
  const comfy = requireComfy(ctx);
  const image = await upload(comfy, source, `loomic-${Date.now()}.png`);
  const { graph, output } = build(image);
  return wrapComfy(() => comfy.run(graph, output));
}

async function wrapComfy<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ComfyError) throw new CanvasError(err.code, err.message);
    throw err;
  }
}

/** Crop transparent margins so cut-outs sit tightly on the canvas. */
async function trimTransparent(buffer: Buffer): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  if (!meta.hasAlpha) return buffer;
  try {
    return await sharp(buffer).trim({ threshold: 1 }).png().toBuffer();
  } catch {
    return buffer;
  }
}
