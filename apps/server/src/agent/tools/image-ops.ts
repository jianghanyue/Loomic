import { tool } from "langchain";
import { z } from "zod";

import {
  type CanvasClient,
  CanvasError,
} from "../../features/canvas/canvas-state.js";
import { createImageOpContext } from "../../features/image-ops/context.js";
import {
  type ImageOpInput,
  type ImageOpName,
  runImageOp,
} from "../../features/image-ops/image-ops.js";
import type { ComfyClient } from "../../generation/comfyui/client.js";

type ToolDeps = {
  createUserClient: (accessToken: string) => any;
  comfy?: ComfyClient | undefined;
};

const elementId = z
  .string()
  .min(1)
  .describe(
    "Id of the image element on the canvas (from canvas_state / inspect_canvas)",
  );

function opTool<S extends z.ZodObject<any>>(
  deps: ToolDeps,
  op: ImageOpName,
  description: string,
  schema: S,
  // Schemas must stay flat (no transforms) to convert to JSON Schema, so any
  // reshaping into ImageOpInput happens here.
  toInput: (input: z.infer<S>) => object = (input) => input,
) {
  return tool(
    async (input: z.infer<S>, config) => {
      const configurable = (
        config as { configurable?: Record<string, unknown> }
      )?.configurable;
      const canvasId = configurable?.canvas_id as string | undefined;
      const accessToken = configurable?.access_token as string | undefined;
      if (!canvasId || !accessToken) {
        return JSON.stringify({
          error: "no_canvas_context",
          message:
            "This tool requires a canvas context. Ensure the conversation is linked to a canvas.",
        });
      }
      try {
        const ctx = createImageOpContext({
          client: deps.createUserClient(accessToken) as CanvasClient,
          canvasId,
          comfy: deps.comfy,
        });
        const result = await runImageOp(ctx, {
          ...toInput(input),
          op,
        } as ImageOpInput);
        return JSON.stringify({ success: true, ...result });
      } catch (err) {
        if (err instanceof CanvasError)
          return JSON.stringify({ error: err.code, message: err.message });
        return JSON.stringify({
          error: "image_op_failed",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    { name: op, description, schema },
  );
}

/** Model-backed operations note that they need ComfyUI so the agent can explain failures. */
export function createImageOpTools(deps: ToolDeps) {
  const comfyNote = deps.comfy
    ? ""
    : " (needs ComfyUI, which is not configured on this server)";
  return [
    opTool(
      deps,
      "remove_background",
      `Cut out the subject of a canvas image onto a transparent background and place the result beside it. Use this to turn generated motifs into transparent elements for create_pattern (source 'element:<new id>'). mode=auto uses the BiRefNet model when available${deps.comfy ? "" : " (not configured here, so a solid-colour key is used — works for plain backgrounds only)"}.`,
      z.object({
        elementId,
        mode: z
          .enum(["auto", "model", "color"])
          .optional()
          .describe(
            "auto (default), model = BiRefNet, color = key out a solid background colour",
          ),
        tolerance: z
          .number()
          .optional()
          .describe(
            "color mode: colour distance treated as background (default 32)",
          ),
      }),
    ),
    opTool(
      deps,
      "upscale_image",
      `Upscale a canvas image by a factor (4x-UltraSharp model${deps.comfy ? "" : "; without ComfyUI a plain resize is used, which adds no detail"}). Large results are shown as a preview on the canvas with the full-size file stored separately.`,
      z.object({
        elementId,
        factor: z
          .number()
          .min(1.5)
          .max(4)
          .optional()
          .describe("Scale factor, default 2"),
      }),
    ),
    opTool(
      deps,
      "split_layers",
      `Decompose a flat image (e.g. an existing print or poster) into separate transparent layers with Qwen-Image-Layered${comfyNote}. Layers are placed beside the original; the first is usually the background.`,
      z.object({
        elementId,
        layers: z
          .number()
          .int()
          .min(2)
          .max(8)
          .optional()
          .describe("Number of layers, default 4"),
        prompt: z
          .string()
          .optional()
          .describe("Optional short description of the image's content"),
      }),
    ),
    opTool(
      deps,
      "erase_region",
      `Remove whatever is inside a rectangle of a canvas image and fill it in naturally (LaMa inpainting)${comfyNote}.`,
      z.object({
        elementId,
        x: z
          .number()
          .min(0)
          .max(1)
          .describe("Left edge of the region as a fraction of image width"),
        y: z
          .number()
          .min(0)
          .max(1)
          .describe("Top edge as a fraction of image height"),
        width: z
          .number()
          .min(0)
          .max(1)
          .describe("Region width as a fraction of image width"),
        height: z
          .number()
          .min(0)
          .max(1)
          .describe("Region height as a fraction of image height"),
      }),
      ({ x, y, width, height, ...rest }) => ({
        ...rest,
        region: { x, y, width, height },
      }),
    ),
    opTool(
      deps,
      "edit_image",
      `Edit a canvas image from an instruction with Qwen-Image-Edit, e.g. recolour, change the subject, restyle${comfyNote}. Pass referenceElementId to use a second canvas image as the style or content reference.`,
      z.object({
        elementId,
        prompt: z.string().min(1).describe("What to change, as an instruction"),
        referenceElementId: z
          .string()
          .optional()
          .describe(
            "Optional second image to follow (style transfer, product swap)",
          ),
      }),
    ),
    opTool(
      deps,
      "vectorize_image",
      "Trace a canvas image into an SVG vector with a limited palette and place it beside the original. The colour count matches the number of print screens, so this also works as colour reduction for screen printing.",
      z.object({
        elementId,
        colors: z
          .number()
          .int()
          .min(2)
          .max(64)
          .optional()
          .describe("Palette size, default 16"),
      }),
    ),
  ];
}
