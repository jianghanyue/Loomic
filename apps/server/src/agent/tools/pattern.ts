import {
  type Placement,
  type RepeatType,
  layoutGrid,
  layoutTossed,
  parseHexColor,
  straightRepeatSize,
} from "@loomic/textile";
import { tool } from "langchain";
import { z } from "zod";

import { describeBuiltinMotifs } from "../../features/textile/motif-library.js";
import {
  type CanvasClient,
  type CanvasState,
  PatternError,
  type PatternMotifSpec,
  type StoredPattern,
  checkPatternDoc,
  findPatternElement,
  loadCanvas,
  measureMotif,
  readPattern,
  renderPatternPreview,
  resolveMotifSource,
  saveCanvasState,
  summarizeReport,
  toTextileDoc,
  upsertPatternElement,
} from "../../features/textile/pattern-service.js";

// Schemas stay flat (no unions / tuples) because Gemini tool calling rejects them.

const repeatTypeSchema = z
  .enum(["block", "half_drop", "brick", "mirror"])
  .describe(
    "Repeat type: block = straight repeat; half_drop = alternate columns dropped half a unit (most common for florals); brick = alternate rows shifted half a unit; mirror = unit mirrored left/right and up/down.",
  );

const motifSchema = z.object({
  id: z
    .string()
    .min(1)
    .describe("Short id used by layouts, e.g. 'rose', 'leaf'"),
  source: z
    .string()
    .min(1)
    .describe(
      `Where the motif image comes from. Built-in vectors: ${describeBuiltinMotifs()}. Or 'element:<canvas image element id>' for an image already on the canvas, or an http(s) image URL. Motifs should have transparent backgrounds.`,
    ),
  colors: z
    .array(z.string())
    .optional()
    .describe(
      "Hex colours for built-in motifs, in the slot order listed for that motif",
    ),
  widthCm: z
    .number()
    .positive()
    .describe("Physical motif width on the fabric in cm at scale 1"),
});

const createPatternSchema = z.object({
  name: z.string().min(1).describe("Pattern name, e.g. '法式小碎花 春夏床品'"),
  repeatType: repeatTypeSchema.default("half_drop"),
  widthCm: z
    .number()
    .positive()
    .default(64)
    .describe(
      "Design unit (repeat) width in cm. Bedding often 64, curtains 64–91.",
    ),
  heightCm: z
    .number()
    .positive()
    .default(64)
    .describe("Design unit (repeat) height in cm"),
  dpi: z
    .number()
    .positive()
    .default(150)
    .describe("Print resolution for exports (150 typical, 300 fine detail)"),
  ground: z
    .string()
    .default("#f6f1e7")
    .describe("Ground (background) colour hex"),
  motifs: z.array(motifSchema).min(1).describe("Motifs available to layouts"),
});

const layoutPatternSchema = z.object({
  patternId: z
    .string()
    .min(1)
    .describe("Pattern id returned by create_pattern"),
  mode: z
    .enum(["tossed", "grid"])
    .describe(
      "tossed = random scatter (all-over prints); grid = regular rows/columns",
    ),
  motifIds: z
    .array(z.string())
    .optional()
    .describe("Motifs to use; defaults to all"),
  append: z
    .boolean()
    .optional()
    .describe(
      "Add to existing placements instead of replacing them (e.g. scatter small fillers after the main flowers)",
    ),
  seed: z
    .number()
    .int()
    .optional()
    .describe("Random seed; change it to get a different arrangement"),
  // tossed
  count: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("tossed: number of motifs in one design unit"),
  weights: z
    .array(z.number())
    .optional()
    .describe("tossed: relative frequency per motifIds entry"),
  gapCm: z
    .number()
    .optional()
    .describe("tossed: minimum clearance between motifs in cm (default 0.5)"),
  scaleMin: z
    .number()
    .positive()
    .optional()
    .describe("tossed: minimum random scale (default 0.85)"),
  scaleMax: z
    .number()
    .positive()
    .optional()
    .describe("tossed: maximum random scale (default 1.15)"),
  rotationMin: z
    .number()
    .optional()
    .describe("tossed: minimum rotation in degrees (default 0)"),
  rotationMax: z
    .number()
    .optional()
    .describe(
      "tossed: maximum rotation in degrees (default 360; use a small range for directional prints)",
    ),
  allowFlip: z.boolean().optional().describe("tossed: randomly mirror motifs"),
  // grid
  cols: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("grid: columns per design unit"),
  rows: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("grid: rows per design unit"),
  stagger: z
    .boolean()
    .optional()
    .describe("grid: offset alternate rows by half a cell"),
  jitterCm: z
    .number()
    .optional()
    .describe("grid: random position jitter in cm"),
  scale: z.number().positive().optional().describe("grid: motif scale"),
  rotation: z.number().optional().describe("grid: motif rotation in degrees"),
  // doc edits
  ground: z.string().optional().describe("Change the ground colour"),
  repeatType: repeatTypeSchema.optional().describe("Change the repeat type"),
});

const checkPatternSchema = z.object({
  patternId: z
    .string()
    .min(1)
    .describe("Pattern id returned by create_pattern"),
  gapCm: z
    .number()
    .optional()
    .describe("Clearance in cm that counts as an overlap (default 0)"),
});

type ToolDeps = { createUserClient: (accessToken: string) => any };

type ToolContext = { client: CanvasClient; canvasId: string };

function contextFrom(config: unknown, deps: ToolDeps): ToolContext | string {
  const configurable = (config as { configurable?: Record<string, unknown> })
    ?.configurable;
  const canvasId = configurable?.canvas_id as string | undefined;
  const accessToken = configurable?.access_token as string | undefined;
  if (!canvasId || !accessToken) {
    return JSON.stringify({
      error: "no_canvas_context",
      message:
        "This tool requires a canvas context. Ensure the conversation is linked to a canvas.",
    });
  }
  return {
    client: deps.createUserClient(accessToken) as CanvasClient,
    canvasId,
  };
}

function errorResult(err: unknown): string {
  if (err instanceof PatternError)
    return JSON.stringify({ error: err.code, message: err.message });
  return JSON.stringify({
    error: "pattern_failed",
    message: err instanceof Error ? err.message : String(err),
  });
}

function validateColor(hex: string, label: string): void {
  try {
    parseHexColor(hex);
  } catch {
    throw new PatternError(
      "invalid_color",
      `${label} must be a hex colour like #f6f1e7, got "${hex}"`,
    );
  }
}

/** Re-render the preview and write pattern + preview back to the canvas. */
async function commit(
  ctx: ToolContext,
  state: CanvasState,
  pattern: StoredPattern,
  existing?: Parameters<typeof upsertPatternElement>[3],
) {
  const doc = await toTextileDoc(pattern, { client: ctx.client, state });
  const preview = await renderPatternPreview(doc);
  const element = upsertPatternElement(state, pattern, preview, existing);
  await saveCanvasState(ctx.client, ctx.canvasId, state);
  return { element, doc };
}

export function createCreatePatternTool(deps: ToolDeps) {
  return tool(
    async (input, config) => {
      const ctx = contextFrom(config, deps);
      if (typeof ctx === "string") return ctx;
      try {
        validateColor(input.ground, "ground");
        const ids = new Set<string>();
        for (const m of input.motifs) {
          if (ids.has(m.id))
            throw new PatternError(
              "duplicate_motif",
              `Motif id "${m.id}" is used twice.`,
            );
          ids.add(m.id);
          for (const c of m.colors ?? [])
            validateColor(c, `colour of motif ${m.id}`);
        }

        const state = await loadCanvas(ctx.client, ctx.canvasId);
        const motifs: PatternMotifSpec[] = await Promise.all(
          input.motifs.map(async (m) => {
            const spec: PatternMotifSpec = {
              id: m.id,
              source: m.source,
              widthCm: m.widthCm,
              ...(m.colors?.length ? { colors: m.colors } : {}),
            };
            return measureMotif(
              spec,
              await resolveMotifSource(spec, { client: ctx.client, state }),
            );
          }),
        );
        const pattern: StoredPattern = {
          version: 1,
          name: input.name,
          repeat: {
            type: input.repeatType as RepeatType,
            widthCm: input.widthCm,
            heightCm: input.heightCm,
            dpi: input.dpi,
          },
          ground: input.ground,
          motifs,
          placements: [],
        };
        const { element } = await commit(ctx, state, pattern);
        const tile = straightRepeatSize(pattern.repeat);
        return JSON.stringify({
          success: true,
          patternId: element.id,
          summary: `Created pattern "${input.name}" (${input.repeatType}, ${input.widthCm}×${input.heightCm} cm unit, print tile ${tile.widthCm}×${tile.heightCm} cm @ ${input.dpi} dpi) with ${motifs.length} motif(s). It has no motifs placed yet — call layout_pattern next.`,
          motifs: motifs.map((m) => ({
            id: m.id,
            widthCm: m.widthCm,
            heightCm: m.heightCm,
          })),
        });
      } catch (err) {
        return errorResult(err);
      }
    },
    {
      name: "create_pattern",
      description:
        "Create a seamless textile print pattern (repeat unit, ground colour and motif set) and place its 2×2 repeat preview on the canvas. Returns a patternId. Follow with layout_pattern to arrange motifs, then check_pattern.",
      schema: createPatternSchema,
    },
  );
}

export function createLayoutPatternTool(deps: ToolDeps) {
  return tool(
    async (input, config) => {
      const ctx = contextFrom(config, deps);
      if (typeof ctx === "string") return ctx;
      try {
        const state = await loadCanvas(ctx.client, ctx.canvasId);
        const element = findPatternElement(state, input.patternId);
        const pattern = structuredClone(readPattern(element));

        if (input.ground !== undefined) {
          validateColor(input.ground, "ground");
          pattern.ground = input.ground;
        }
        if (input.repeatType !== undefined)
          pattern.repeat.type = input.repeatType as RepeatType;

        const known = new Set(pattern.motifs.map((m) => m.id));
        const motifIds = input.motifIds ?? [...known];
        const unknown = motifIds.filter((id) => !known.has(id));
        if (unknown.length > 0) {
          throw new PatternError(
            "unknown_motif",
            `Unknown motif id(s): ${unknown.join(", ")}. Known: ${[...known].join(", ")}`,
          );
        }

        let placements: Placement[];
        let note = "";
        if (input.mode === "grid") {
          placements = layoutGrid(pattern.repeat, {
            cols: input.cols ?? 4,
            rows: input.rows ?? 4,
            motifIds,
            ...(input.stagger !== undefined ? { stagger: input.stagger } : {}),
            ...(input.jitterCm !== undefined
              ? { jitterCm: input.jitterCm }
              : {}),
            ...(input.scale !== undefined ? { scale: input.scale } : {}),
            ...(input.rotation !== undefined
              ? { rotation: input.rotation }
              : {}),
            ...(input.seed !== undefined ? { seed: input.seed } : {}),
          });
        } else {
          const motifs = pattern.motifs.map((m) => ({
            id: m.id,
            src: Buffer.alloc(0),
            widthCm: m.widthCm,
            ...(m.heightCm ? { heightCm: m.heightCm } : {}),
          }));
          const result = layoutTossed(pattern.repeat, motifs, {
            count: input.count ?? 30,
            motifIds,
            gapCm: input.gapCm ?? 0.5,
            scaleRange: [input.scaleMin ?? 0.85, input.scaleMax ?? 1.15],
            rotationRange: [input.rotationMin ?? 0, input.rotationMax ?? 360],
            ...(input.weights ? { weights: input.weights } : {}),
            ...(input.allowFlip !== undefined
              ? { allowFlip: input.allowFlip }
              : {}),
            ...(input.seed !== undefined ? { seed: input.seed } : {}),
            // Layered tosses must keep clear of motifs already placed.
            ...(input.append ? { avoid: pattern.placements } : {}),
          });
          placements = result.placements;
          if (result.placed < result.requested) {
            note = ` Only ${result.placed} of ${result.requested} motifs fit with ${input.gapCm ?? 0.5} cm clearance — reduce count, scale or gapCm, or enlarge the repeat.`;
          }
        }
        pattern.placements = input.append
          ? [...pattern.placements, ...placements]
          : placements;

        const { doc } = await commit(ctx, state, pattern, element);
        const report = summarizeReport(
          await checkPatternDoc(doc, input.gapCm ?? 0),
          pattern,
        );
        return JSON.stringify({
          success: true,
          patternId: element.id,
          summary: `${input.append ? "Added" : "Laid out"} ${placements.length} motif(s) (${input.mode}); pattern now has ${pattern.placements.length} placement(s). Preview updated on canvas.${note}`,
          quickCheck: {
            ok: report.ok,
            issues: report.issues,
            coveragePercent: report.coveragePercent,
            emptyCells: report.emptyCells,
          },
        });
      } catch (err) {
        return errorResult(err);
      }
    },
    {
      name: "layout_pattern",
      description:
        "Arrange motifs in a pattern created by create_pattern (tossed scatter or grid), optionally change its ground colour or repeat type, and refresh its preview on the canvas. Spacing accounts for neighbouring repeats, so motifs never collide across tile edges. Use append=true to layer small fillers over the main motifs.",
      schema: layoutPatternSchema,
    },
  );
}

export function createCheckPatternTool(deps: ToolDeps) {
  return tool(
    async (input, config) => {
      const ctx = contextFrom(config, deps);
      if (typeof ctx === "string") return ctx;
      try {
        const state = await loadCanvas(ctx.client, ctx.canvasId);
        const pattern = readPattern(findPatternElement(state, input.patternId));
        if (pattern.placements.length === 0) {
          return JSON.stringify({
            error: "empty_pattern",
            message: "Pattern has no motifs yet — run layout_pattern first.",
          });
        }
        const doc = await toTextileDoc(pattern, { client: ctx.client, state });
        const report = summarizeReport(
          await checkPatternDoc(doc, input.gapCm),
          pattern,
        );
        return JSON.stringify({
          patternId: input.patternId,
          ...report,
          guide:
            "seamDetail ratios above 2 mean a visible seam. coveragePercent is motif area; unevenness under 0.5 is even, above 0.8 is clumpy. emptyCells are bare patches in an 8-column grid.",
        });
      } catch (err) {
        return errorResult(err);
      }
    },
    {
      name: "check_pattern",
      description:
        "Quality-check a pattern for print: seam visibility at the repeat edges, motif overlaps (including across edges and between repeat copies), coverage and evenness of the distribution. Read-only.",
      schema: checkPatternSchema,
    },
  );
}

export function createPatternTools(deps: ToolDeps) {
  return [
    createCreatePatternTool(deps),
    createLayoutPatternTool(deps),
    createCheckPatternTool(deps),
  ];
}
