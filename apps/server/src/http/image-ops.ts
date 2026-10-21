import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ServerEnv } from "../config/env.js";
import {
  type CanvasClient,
  CanvasError,
} from "../features/canvas/canvas-state.js";
import {
  comfyFromEnv,
  createImageOpContext,
} from "../features/image-ops/context.js";
import {
  COMFY_ONLY_OPS,
  IMAGE_OPS,
  type ImageOpInput,
  runImageOp,
} from "../features/image-ops/image-ops.js";
import type { RequestAuthenticator } from "../supabase/user.js";

const regionSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});

const imageOpRequestSchema = z.object({
  op: z.enum(IMAGE_OPS),
  elementId: z.string().min(1),
  mode: z.enum(["auto", "model", "color"]).optional(),
  tolerance: z.number().optional(),
  factor: z.number().min(1.5).max(4).optional(),
  layers: z.number().int().min(2).max(8).optional(),
  prompt: z.string().optional(),
  referenceElementId: z.string().optional(),
  region: regionSchema.optional(),
  colors: z.number().int().min(2).max(64).optional(),
});

const STATUS_BY_CODE: Record<string, number> = {
  canvas_not_found: 404,
  image_not_found: 404,
  invalid_input: 400,
  invalid_region: 400,
  background_not_uniform: 422,
  empty_result: 422,
  comfyui_not_configured: 501,
  comfyui_unreachable: 502,
  comfyui_rejected: 502,
  comfyui_failed: 502,
  comfyui_timeout: 504,
};

export async function registerImageOpRoutes(
  app: FastifyInstance,
  options: {
    auth: RequestAuthenticator;
    createUserClient: (accessToken: string) => unknown;
    env: Pick<ServerEnv, "comfyuiBaseUrl" | "comfyuiTimeoutMs">;
  },
) {
  /** Which operations can run here, so the UI can disable the rest. */
  app.get("/api/image-ops/capabilities", async (request, reply) => {
    const user = await options.auth.authenticate(request);
    if (!user)
      return reply
        .code(401)
        .send({
          error: {
            code: "unauthorized",
            message: "Missing or invalid bearer token.",
          },
        });
    const comfyui = Boolean(options.env.comfyuiBaseUrl);
    return reply.send({
      comfyui,
      ops: Object.fromEntries(
        IMAGE_OPS.map((op) => [op, comfyui || !COMFY_ONLY_OPS.has(op)]),
      ),
    });
  });

  app.post<{ Params: { canvasId: string } }>(
    "/api/canvases/:canvasId/image-ops",
    async (request, reply) => {
      const user = await options.auth.authenticate(request);
      if (!user)
        return reply
          .code(401)
          .send({
            error: {
              code: "unauthorized",
              message: "Missing or invalid bearer token.",
            },
          });

      const parsed = imageOpRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({
            error: { code: "invalid_input", message: parsed.error.message },
          });
      }
      // Drop absent fields (zod emits `undefined`, which exactOptionalPropertyTypes rejects).
      const input = Object.fromEntries(
        Object.entries(parsed.data).filter(([, v]) => v !== undefined),
      ) as ImageOpInput;
      try {
        const ctx = createImageOpContext({
          client: options.createUserClient(user.accessToken) as CanvasClient,
          canvasId: request.params.canvasId,
          comfy: comfyFromEnv(options.env),
        });
        const result = await runImageOp(ctx, input);
        return reply.send(result);
      } catch (error) {
        if (error instanceof CanvasError) {
          return reply
            .code(STATUS_BY_CODE[error.code] ?? 400)
            .send({ error: { code: error.code, message: error.message } });
        }
        request.log.error(
          { err: error, canvasId: request.params.canvasId },
          "image-op failed",
        );
        return reply
          .code(500)
          .send({
            error: {
              code: "application_error",
              message: "Internal server error.",
            },
          });
      }
    },
  );
}
