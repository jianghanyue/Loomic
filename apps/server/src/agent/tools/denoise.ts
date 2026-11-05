import { tool } from "langchain";
import { z } from "zod";

import { denoiseRgba } from "../../features/image-ops/local-ops.js";
import {
  type CanvasClient,
  CanvasError,
  insertImagesBeside,
  loadCanvas,
  readCanvasImage,
  saveCanvasState,
} from "../../features/canvas/canvas-state.js";

type ToolDeps = {
  createUserClient: (accessToken: string) => any;
};

function contextFrom(config: unknown, deps: ToolDeps): { client: CanvasClient; canvasId: string } | string {
  const configurable = (config as { configurable?: Record<string, unknown> })?.configurable;
  const canvasId = configurable?.canvas_id as string | undefined;
  const accessToken = configurable?.access_token as string | undefined;
  if (!canvasId || !accessToken) {
    return JSON.stringify({
      error: "no_canvas_context",
      message: "This tool requires a canvas context.",
    });
  }
  return { client: deps.createUserClient(accessToken) as CanvasClient, canvasId };
}

export function createDenoiseTool(deps: ToolDeps) {
  return tool(
    async (input, config) => {
      const ctx = contextFrom(config, deps);
      if (typeof ctx === "string") return ctx;
      try {
        const state = await loadCanvas(ctx.client, ctx.canvasId);
        const source = await readCanvasImage(ctx.client, state, input.elementId);
        const output = await denoiseRgba(source.buffer);
        const [element] = await insertImagesBeside(state, source.element, [
          {
            buffer: output.buffer,
            title: `${String((source.element.customData as { title?: string } | undefined)?.title ?? "图片")} · 去噪`,
            customData: {
              derivedFrom: input.elementId,
              op: "denoise_image",
              method: "local",
            },
          },
        ]);
        if (!element) throw new CanvasError("empty_result", "Denoise did not create an output image.");
        await saveCanvasState(ctx.client, ctx.canvasId, state);
        return JSON.stringify({
          success: true,
          elementIds: [element.id],
          method: "local",
          summary: "Cleaned small alpha speckles and isolated edge pixels locally.",
        });
      } catch (error) {
        if (error instanceof CanvasError) {
          return JSON.stringify({ error: error.code, message: error.message });
        }
        return JSON.stringify({
          error: "denoise_failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    {
      name: "denoise_image",
      description: "Clean small alpha speckles and isolated edge pixels on a canvas image, then place the denoised result beside it.",
      schema: z.object({
        elementId: z.string().min(1).describe("Id of the image element on the canvas"),
      }),
    },
  );
}
