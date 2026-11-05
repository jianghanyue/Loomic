import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  type CanvasClient,
  CanvasError,
  loadCanvas,
  readCanvasImage,
  saveCanvasState,
} from "../features/canvas/canvas-state.js";
import {
  type PatternMotifSpec,
  type StoredPattern,
  checkPatternDoc,
  measureMotif,
  renderPatternPreview,
  summarizeReport,
  toTextileDoc,
  upsertPatternElement,
} from "../features/textile/pattern-service.js";
import type { RequestAuthenticator } from "../supabase/user.js";

const fromImageSchema = z.object({
  sourceElementId: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  repeatType: z.enum(["block", "half_drop", "brick", "mirror"]).default("block"),
  widthCm: z.number().positive().max(500).default(64),
  heightCm: z.number().positive().max(500).default(64),
  dpi: z.number().positive().max(600).default(150),
  ground: z.string().nullable().default(null),
});

export async function registerPatternRoutes(
  app: FastifyInstance,
  options: {
    auth: RequestAuthenticator;
    createUserClient: (accessToken: string) => unknown;
  },
) {
  app.post<{ Params: { canvasId: string } }>(
    "/api/canvases/:canvasId/patterns/from-image",
    async (request, reply) => {
      const user = await options.auth.authenticate(request);
      if (!user) {
        return reply.code(401).send({
          error: { code: "unauthorized", message: "Missing or invalid bearer token." },
        });
      }

      const parsed = fromImageSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: { code: "invalid_input", message: parsed.error.message } });
      }

      const client = options.createUserClient(user.accessToken) as CanvasClient;
      try {
        const state = await loadCanvas(client, request.params.canvasId);
        const source = await readCanvasImage(client, state, parsed.data.sourceElementId);
        const motifSpec: PatternMotifSpec = {
          id: "source",
          source: `element:${parsed.data.sourceElementId}`,
          widthCm: parsed.data.widthCm,
        };
        const motif = await measureMotif(motifSpec, source.buffer);
        const pattern: StoredPattern = {
          version: 1,
          name: parsed.data.name ?? "图片四方循环",
          repeat: {
            type: parsed.data.repeatType,
            widthCm: parsed.data.widthCm,
            heightCm: parsed.data.heightCm,
            dpi: parsed.data.dpi,
          },
          ground: parsed.data.ground,
          motifs: [motif],
          placements: [{ motifId: motif.id, x: parsed.data.widthCm / 2, y: parsed.data.heightCm / 2 }],
        };
        const doc = await toTextileDoc(pattern, { client, state });
        const preview = await renderPatternPreview(doc);
        const element = upsertPatternElement(state, pattern, preview);
        const report = summarizeReport(await checkPatternDoc(doc), pattern);
        await saveCanvasState(client, request.params.canvasId, state);
        return reply.send({
          patternId: element.id,
          previewElementId: element.id,
          report,
          repeat: pattern.repeat,
        });
      } catch (error) {
        if (error instanceof CanvasError) {
          return reply.code(error.code === "canvas_not_found" || error.code === "image_not_found" ? 404 : 422).send({
            error: { code: error.code, message: error.message },
          });
        }
        request.log.error({ err: error, canvasId: request.params.canvasId }, "pattern.from-image failed");
        return reply.code(500).send({ error: { code: "pattern_failed", message: "Failed to create the repeat pattern." } });
      }
    },
  );
}
