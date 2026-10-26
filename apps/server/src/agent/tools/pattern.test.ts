import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  createCheckPatternTool,
  createCreatePatternTool,
  createExportPatternTool,
  createLayoutPatternTool,
} from "./pattern.js";

type Row = { content: Record<string, any> };

/** Minimal Supabase stand-in: one canvas row, read/write via from("canvases"). */
function fakeSupabase(
  content: Record<string, any> = { elements: [], appState: {} },
) {
  const row: Row = { content };
  const client = {
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { content: structuredClone(row.content) },
            error: null,
          }),
        }),
      }),
      update: (patch: { content: Record<string, any> }) => ({
        eq: async () => {
          row.content = structuredClone(patch.content);
          return { error: null };
        },
      }),
    }),
    storage: {
      from: () => ({
        download: async () => ({ data: null, error: new Error("not found") }),
      }),
    },
  };
  return { row, deps: { createUserClient: () => client } };
}

const config = {
  configurable: { canvas_id: "canvas-1", access_token: "token" },
};

async function run(
  t: { invoke: (input: any, config?: any) => Promise<unknown> },
  input: unknown,
  cfg: unknown = config,
) {
  return JSON.parse((await t.invoke(input, cfg)) as string);
}

function setup(content?: Record<string, any>) {
  const { row, deps } = fakeSupabase(content);
  return {
    row,
    create: createCreatePatternTool(deps),
    layout: createLayoutPatternTool(deps),
    check: createCheckPatternTool(deps),
    exportPattern: createExportPatternTool(deps),
  };
}

const baseInput = {
  name: "小碎花",
  repeatType: "half_drop",
  widthCm: 20,
  heightCm: 20,
  dpi: 100,
  ground: "#f6f1e7",
  motifs: [
    {
      id: "rose",
      source: "builtin:flower",
      widthCm: 3,
      colors: ["#c8553d", "#f2d0a4"],
    },
    { id: "leaf", source: "builtin:leaf", widthCm: 1.2 },
  ],
};

describe("create_pattern", () => {
  it("adds a pattern preview element carrying the pattern doc", async () => {
    const { row, create } = setup();
    const result = await run(create, baseInput);

    expect(result.success).toBe(true);
    const [el] = row.content.elements;
    expect(el.id).toBe(result.patternId);
    expect(el.type).toBe("image");
    expect(el.customData.kind).toBe("pattern");
    expect(el.customData.pattern.placements).toEqual([]);
    expect(el.customData.pattern.repeat).toEqual({
      type: "half_drop",
      widthCm: 20,
      heightCm: 20,
      dpi: 100,
    });
    // leaf is twice as tall as wide
    expect(result.motifs).toContainEqual({
      id: "leaf",
      widthCm: 1.2,
      heightCm: 2.4,
    });

    const file = row.content.files[el.fileId];
    expect(file.mimeType).toBe("image/jpeg");
    const meta = await sharp(
      Buffer.from(file.dataURL.split(",")[1], "base64"),
    ).metadata();
    // half_drop straight tile is 2:1, previewed 2×2
    expect(meta.width).toBe(2 * (meta.height ?? 0));
  });

  it("accepts an image already on the canvas as a motif", async () => {
    const png = await sharp({
      create: {
        width: 40,
        height: 80,
        channels: 4,
        background: { r: 200, g: 50, b: 50, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const { create } = setup({
      elements: [
        { id: "img-1", type: "image", fileId: "f1", isDeleted: false },
      ],
      files: {
        f1: {
          id: "f1",
          mimeType: "image/png",
          dataURL: `data:image/png;base64,${png.toString("base64")}`,
        },
      },
    });
    const result = await run(create, {
      ...baseInput,
      motifs: [{ id: "mine", source: "element:img-1", widthCm: 2 }],
    });
    expect(result.success).toBe(true);
    expect(result.motifs).toEqual([{ id: "mine", widthCm: 2, heightCm: 4 }]);
  });

  it.each([
    [{ ground: "beige" }, "invalid_color"],
    [
      { motifs: [{ id: "x", source: "builtin:unicorn", widthCm: 2 }] },
      "pattern_failed",
    ],
    [
      { motifs: [{ id: "x", source: "element:missing", widthCm: 2 }] },
      "motif_not_found",
    ],
    [
      {
        motifs: [
          { id: "x", source: "builtin:dot", widthCm: 1 },
          { id: "x", source: "builtin:dot", widthCm: 1 },
        ],
      },
      "duplicate_motif",
    ],
  ])("rejects bad input %#", async (patch, code) => {
    const { row, create } = setup();
    const result = await run(create, { ...baseInput, ...patch });
    expect(result.error).toBe(code);
    expect(row.content.elements).toEqual([]);
  });

  it("requires a canvas context", async () => {
    const { create } = setup();
    expect((await run(create, baseInput, {})).error).toBe("no_canvas_context");
  });
});

describe("layout_pattern", () => {
  it("scatters motifs, swaps the preview file and reports a clean check", async () => {
    const { row, create, layout } = setup();
    const { patternId } = await run(create, baseInput);
    const before = structuredClone(row.content.elements[0]);

    const result = await run(layout, {
      patternId,
      mode: "tossed",
      count: 12,
      seed: 4,
      gapCm: 0.3,
    });

    expect(result.success).toBe(true);
    expect(result.quickCheck.issues).not.toContain(
      "visible seam at the repeat edge",
    );
    const el = row.content.elements[0];
    expect(el.customData.pattern.placements).toHaveLength(12);
    expect(el.version).toBeGreaterThan(before.version);
    expect(el.fileId).not.toBe(before.fileId);
    expect(row.content.files[before.fileId]).toBeUndefined();
    expect(row.content.files[el.fileId]).toBeDefined();
    expect([el.x, el.y, el.width]).toEqual([before.x, before.y, before.width]);
  });

  it("layered tosses keep clear of motifs already placed", async () => {
    const { create, layout, check } = setup();
    const { patternId } = await run(create, baseInput);
    await run(layout, {
      patternId,
      mode: "tossed",
      motifIds: ["rose"],
      count: 8,
      seed: 1,
      gapCm: 0.3,
    });
    await run(layout, {
      patternId,
      mode: "tossed",
      motifIds: ["leaf"],
      count: 20,
      seed: 2,
      gapCm: 0.3,
      append: true,
    });

    const report = await run(check, { patternId, gapCm: 0.3 });
    expect(report.overlaps).toEqual([]);
  });

  it("appends fillers, switches to grid and edits the ground", async () => {
    const { row, create, layout } = setup();
    const { patternId } = await run(create, baseInput);

    await run(layout, {
      patternId,
      mode: "grid",
      cols: 3,
      rows: 2,
      motifIds: ["rose"],
    });
    const appended = await run(layout, {
      patternId,
      mode: "tossed",
      motifIds: ["leaf"],
      count: 5,
      append: true,
      ground: "#203040",
    });

    const pattern = row.content.elements[0].customData.pattern;
    expect(appended.success).toBe(true);
    expect(pattern.placements).toHaveLength(11);
    expect(
      pattern.placements
        .slice(0, 6)
        .every((p: { motifId: string }) => p.motifId === "rose"),
    ).toBe(true);
    expect(pattern.ground).toBe("#203040");
  });

  it("explains when the requested count does not fit", async () => {
    const { create, layout } = setup();
    const { patternId } = await run(create, {
      ...baseInput,
      widthCm: 6,
      heightCm: 6,
    });
    const result = await run(layout, {
      patternId,
      mode: "tossed",
      motifIds: ["rose"],
      count: 40,
      gapCm: 0.5,
    });
    expect(result.summary).toMatch(/Only \d+ of 40 motifs fit/);
  });

  it("rejects unknown motifs and patterns", async () => {
    const { create, layout } = setup();
    const { patternId } = await run(create, baseInput);
    expect(
      (await run(layout, { patternId, mode: "grid", motifIds: ["tulip"] }))
        .error,
    ).toBe("unknown_motif");
    expect((await run(layout, { patternId: "nope", mode: "grid" })).error).toBe(
      "pattern_not_found",
    );
  });
});

describe("export_pattern", () => {
  it("exports the requested aspect-safe size and places a preview", async () => {
    const { row, create, exportPattern } = setup();
    const { patternId } = await run(create, baseInput);
    const result = await run(exportPattern, {
      patternId,
      widthPx: 640,
      format: "png",
    });

    expect(result.success).toBe(true);
    expect([result.width, result.height]).toEqual([640, 320]);
    expect(result.format).toBe("png");
    expect(row.content.elements).toHaveLength(2);
    expect(row.content.elements[1].customData).toMatchObject({
      kind: "pattern-export",
      widthPx: 640,
      heightPx: 320,
    });
  });
});

describe("check_pattern", () => {
  it("reports a seamless, overlap-free tossed layout", async () => {
    const { create, layout, check } = setup();
    const { patternId } = await run(create, baseInput);
    await run(layout, {
      patternId,
      mode: "tossed",
      count: 10,
      seed: 9,
      gapCm: 0.2,
    });

    const report = await run(check, { patternId });
    expect(report.seamless).toBe(true);
    expect(report.overlaps).toEqual([]);
    expect(report.coveragePercent).toBeGreaterThan(0);
  });

  it("flags crowded grids as overlapping", async () => {
    const { create, layout, check } = setup();
    const { patternId } = await run(create, baseInput);
    await run(layout, {
      patternId,
      mode: "grid",
      cols: 8,
      rows: 8,
      motifIds: ["rose"],
    });

    const report = await run(check, { patternId });
    expect(report.ok).toBe(false);
    expect(report.overlaps.length).toBeGreaterThan(0);
    expect(report.issues.join(" ")).toMatch(/overlapping/);
  });

  it("asks for a layout first on an empty pattern", async () => {
    const { create, check } = setup();
    const { patternId } = await run(create, baseInput);
    expect((await run(check, { patternId })).error).toBe("empty_pattern");
  });
});
