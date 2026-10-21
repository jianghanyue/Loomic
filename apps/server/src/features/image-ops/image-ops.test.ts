import { type IncomingMessage, type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { createComfyClient } from "../../generation/comfyui/client.js";
import {
  type ImageOpContext,
  type ImageOpInput,
  runImageOp,
} from "./image-ops.js";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

type Row = { content: Record<string, any> };

function fakeSupabase(content: Record<string, any>) {
  const row: Row = { content };
  return {
    row,
    client: {
      from: () => ({
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
      storage: { from: () => ({}) },
    },
  };
}

type FakeComfy = {
  baseUrl: string;
  uploads: { name: string; bytes: Buffer }[];
  prompts: Record<string, any>[];
  /** Images returned for the output node of the next prompt. */
  outputs: Buffer[];
  error?: string;
  close(): Promise<void>;
};

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((s) => new Promise((r) => s.close(r))),
  );
});

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

async function fakeComfy(): Promise<FakeComfy> {
  const state: Omit<FakeComfy, "baseUrl" | "close"> = {
    uploads: [],
    prompts: [],
    outputs: [],
  };
  let polls = 0;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const json = (body: unknown, status = 200) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.method === "POST" && url.pathname === "/upload/image") {
      const form = await new Response(await readBody(req), {
        headers: { "content-type": req.headers["content-type"] ?? "" },
      }).formData();
      const file = form.get("image") as File;
      const name = `${state.uploads.length}-${file.name}`;
      state.uploads.push({
        name,
        bytes: Buffer.from(await file.arrayBuffer()),
      });
      return json({ name, subfolder: "loomic", type: "input" });
    }
    if (req.method === "POST" && url.pathname === "/prompt") {
      state.prompts.push(JSON.parse((await readBody(req)).toString()).prompt);
      polls = 0;
      return json({ prompt_id: `p${state.prompts.length}` });
    }
    if (url.pathname.startsWith("/history/")) {
      const id = url.pathname.slice("/history/".length);
      if (polls++ === 0) return json({}); // not finished on the first poll
      const graph = state.prompts[state.prompts.length - 1]!;
      const saveNode = Object.keys(graph).find(
        (k) => graph[k].class_type === "SaveImage",
      )!;
      if (state.error) {
        return json({
          [id]: {
            status: {
              messages: [
                ["execution_error", { exception_message: state.error }],
              ],
            },
          },
        });
      }
      return json({
        [id]: {
          status: { completed: true },
          outputs: {
            [saveNode]: {
              images: state.outputs.map((_, i) => ({
                filename: `out${i}.png`,
                type: "output",
              })),
            },
          },
        },
      });
    }
    if (url.pathname === "/view") {
      const i = Number(url.searchParams.get("filename")!.match(/\d+/)![0]);
      res.writeHead(200, { "content-type": "image/png" });
      return res.end(state.outputs[i]);
    }
    json({ error: "not found" }, 404);
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return Object.assign(state, {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** White canvas with a red square in the middle. */
async function motifOnWhite(size = 80) {
  return sharp({
    create: { width: size, height: size, channels: 3, background: "#ffffff" },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: size / 2,
            height: size / 2,
            channels: 3,
            background: "#d0342c",
          },
        })
          .png()
          .toBuffer(),
        left: size / 4,
        top: size / 4,
      },
    ])
    .png()
    .toBuffer();
}

const solid = (w: number, h: number, alpha = 1) =>
  sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: { r: 40, g: 120, b: 200, alpha },
    },
  })
    .png()
    .toBuffer();

async function canvasWith(image: Buffer, extra: Record<string, any> = {}) {
  return fakeSupabase({
    elements: [
      {
        id: "img",
        type: "image",
        fileId: "f1",
        x: 0,
        y: 0,
        width: 200,
        height: 200,
        isDeleted: false,
        customData: { title: "玫瑰" },
      },
      ...(extra.elements ?? []),
    ],
    files: {
      f1: {
        id: "f1",
        mimeType: "image/png",
        dataURL: `data:image/png;base64,${image.toString("base64")}`,
      },
      ...(extra.files ?? {}),
    },
  });
}

async function run(
  supa: ReturnType<typeof fakeSupabase>,
  input: Partial<ImageOpInput> & Pick<ImageOpInput, "op">,
  extra: Partial<ImageOpContext> = {},
) {
  return runImageOp({ client: supa.client, canvasId: "c1", ...extra }, {
    elementId: "img",
    ...input,
  } as ImageOpInput);
}

function newElements(supa: ReturnType<typeof fakeSupabase>) {
  return supa.row.content.elements.filter(
    (e: any) => e.id !== "img" && e.id !== "ref",
  );
}

async function fileOf(supa: ReturnType<typeof fakeSupabase>, el: any) {
  const file = supa.row.content.files[el.fileId];
  return { file, buffer: Buffer.from(file.dataURL.split(",")[1], "base64") };
}

const comfyCtx = (fake: FakeComfy) => ({
  comfy: createComfyClient({ baseUrl: fake.baseUrl, pollMs: 5 }),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("remove_background", () => {
  it("runs BiRefNet through ComfyUI and places the cut-out beside the image", async () => {
    const fake = await fakeComfy();
    fake.outputs = [await solid(60, 40, 0.5)];
    const supa = await canvasWith(await motifOnWhite());

    const result = await run(supa, { op: "remove_background" }, comfyCtx(fake));

    expect(result.method).toBe("model");
    const graph = fake.prompts[0]!;
    const load = Object.values(graph).find(
      (n: any) => n.class_type === "LoadImage",
    ) as any;
    expect(load.inputs.image).toBe(`loomic/${fake.uploads[0]!.name} [input]`);
    expect(
      Object.values(graph).some(
        (n: any) => n.class_type === "RemoveBackground",
      ),
    ).toBe(true);

    const [el] = newElements(supa);
    expect(el.id).toBe(result.elementIds[0]);
    expect(el.x).toBe(240); // 200 wide + 40 gap
    expect(el.customData).toMatchObject({
      title: "玫瑰 · 抠图",
      derivedFrom: "img",
      op: "remove_background",
    });
    const { file } = await fileOf(supa, el);
    expect(file.mimeType).toBe("image/webp");
  });

  it("keys out a solid background locally when ComfyUI is not configured", async () => {
    const supa = await canvasWith(await motifOnWhite(80));
    const result = await run(supa, { op: "remove_background" });

    expect(result.method).toBe("color_key");
    const { buffer } = await fileOf(supa, newElements(supa)[0]);
    const { data, info } = await sharp(buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    // trimmed to the red square plus a 2px margin, transparent corners
    expect(info.width).toBeLessThanOrEqual(44);
    expect(data[3]).toBe(0);
    const centre = ((info.height >> 1) * info.width + (info.width >> 1)) * 4;
    expect(data[centre + 3]).toBe(255);
  });

  it("refuses to key out a busy background", async () => {
    const noise = await sharp(
      Buffer.from(
        Array.from({ length: 64 * 64 * 3 }, (_, i) => (i * 97) % 251),
      ),
      { raw: { width: 64, height: 64, channels: 3 } },
    )
      .png()
      .toBuffer();
    const supa = await canvasWith(noise);
    await expect(run(supa, { op: "remove_background" })).rejects.toMatchObject({
      code: "background_not_uniform",
    });
    expect(newElements(supa)).toEqual([]);
  });
});

describe("upscale_image", () => {
  it("downsizes the 4× model output for 2× and stores the original", async () => {
    const fake = await fakeComfy();
    fake.outputs = [await solid(160, 160)];
    const supa = await canvasWith(await solid(80, 80));
    const stored: string[] = [];

    const result = await run(
      supa,
      { op: "upscale_image", factor: 2 },
      {
        ...comfyCtx(fake),
        storeOriginal: async (_buf, name) => {
          stored.push(name);
          return `https://cdn.test/${name}`;
        },
      },
    );

    const post = fake.prompts[0]!.post;
    expect(post).toMatchObject({
      class_type: "ImageScale",
      inputs: { width: 160, height: 160 },
    });
    expect(stored).toEqual(["upscale-160x160.png"]);
    expect(result.originalUrl).toBe("https://cdn.test/upscale-160x160.png");
    expect(newElements(supa)[0].customData).toMatchObject({
      originalWidth: 160,
      originalUrl: result.originalUrl,
    });
  });

  it("falls back to a plain resize without ComfyUI", async () => {
    const supa = await canvasWith(await solid(50, 30));
    const result = await run(supa, { op: "upscale_image", factor: 3 });
    expect(result.method).toBe("resize");
    expect(result.summary).toMatch(/50×30 → 150×90/);
    const meta = await sharp(
      (await fileOf(supa, newElements(supa)[0])).buffer,
    ).metadata();
    expect([meta.width, meta.height]).toEqual([150, 90]);
  });
});

describe("model-only operations", () => {
  it("split_layers places every returned layer", async () => {
    const fake = await fakeComfy();
    fake.outputs = [
      await solid(64, 64),
      await solid(30, 20, 0.8),
      await solid(20, 30, 0.8),
    ];
    const supa = await canvasWith(await motifOnWhite());

    const result = await run(
      supa,
      { op: "split_layers", layers: 3, prompt: "floral print" },
      comfyCtx(fake),
    );

    const graph = fake.prompts[0]!;
    const latent = Object.values(graph).find(
      (n: any) => n.class_type === "EmptyQwenImageLayeredLatentImage",
    ) as any;
    expect(latent.inputs.layers).toBe(3);
    expect(result.elementIds).toHaveLength(3);
    expect(newElements(supa).map((e: any) => e.customData.title)).toEqual([
      "玫瑰 · 图层 1",
      "玫瑰 · 图层 2",
      "玫瑰 · 图层 3",
    ]);
  });

  it("erase_region uploads a mask that is transparent only inside the region", async () => {
    const fake = await fakeComfy();
    fake.outputs = [await solid(100, 100)];
    const supa = await canvasWith(await solid(100, 100));

    await run(
      supa,
      {
        op: "erase_region",
        region: { x: 0.5, y: 0, width: 0.5, height: 0.25 },
      },
      comfyCtx(fake),
    );

    const mask = fake.uploads.find((u) => u.name.includes("mask"))!;
    const maskNode = Object.values(fake.prompts[0]!).find(
      (n: any) => n.class_type === "LoadImageMask",
    ) as any;
    expect(maskNode.inputs.image).toBe(`loomic/${mask.name} [input]`);
    const { data } = await sharp(mask.bytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const alpha = (x: number, y: number) => data[(y * 100 + x) * 4 + 3];
    expect(alpha(75, 10)).toBe(0);
    expect(alpha(25, 10)).toBe(255);
    expect(alpha(75, 50)).toBe(255);
  });

  it("edit_image passes the prompt and an optional reference image", async () => {
    const fake = await fakeComfy();
    fake.outputs = [await solid(80, 80)];
    const ref = await solid(10, 10);
    const supa = await canvasWith(await motifOnWhite(), {
      elements: [{ id: "ref", type: "image", fileId: "f2", isDeleted: false }],
      files: {
        f2: {
          id: "f2",
          dataURL: `data:image/png;base64,${ref.toString("base64")}`,
        },
      },
    });

    await run(
      supa,
      { op: "edit_image", prompt: "make it indigo", referenceElementId: "ref" },
      comfyCtx(fake),
    );

    const graph = fake.prompts[0]!;
    const encode = Object.values(graph).find(
      (n: any) => n.class_type === "TextEncodeQwenImage21",
    ) as any;
    expect(encode.inputs.prompt).toBe("make it indigo");
    expect(encode.inputs["images.image_2"]).toEqual(["ref", 0]);
    expect(graph.ref.inputs.image).toMatch(/ref\.png \[input\]$/);
  });

  it.each(["split_layers", "erase_region", "edit_image"] as const)(
    "%s explains that ComfyUI is required",
    async (op) => {
      const supa = await canvasWith(await solid(20, 20));
      await expect(
        run(supa, {
          op,
          prompt: "x",
          region: { x: 0, y: 0, width: 0.5, height: 0.5 },
        }),
      ).rejects.toMatchObject({ code: "comfyui_not_configured" });
    },
  );

  it("surfaces ComfyUI execution errors", async () => {
    const fake = await fakeComfy();
    fake.error = "CUDA out of memory";
    const supa = await canvasWith(await solid(20, 20));
    await expect(
      run(supa, { op: "remove_background" }, comfyCtx(fake)),
    ).rejects.toMatchObject({
      code: "comfyui_failed",
      message: expect.stringContaining("CUDA out of memory"),
    });
  });

  it("reports an unreachable ComfyUI", async () => {
    const supa = await canvasWith(await solid(20, 20));
    const comfy = createComfyClient({
      baseUrl: "http://127.0.0.1:9",
      pollMs: 5,
    });
    await expect(
      run(supa, { op: "remove_background" }, { comfy }),
    ).rejects.toMatchObject({
      code: "comfyui_unreachable",
    });
  });
});

describe("vectorize_image", () => {
  it("embeds an SVG with an intrinsic size", async () => {
    const supa = await canvasWith(await motifOnWhite(60));
    const result = await run(supa, { op: "vectorize_image", colors: 4 });
    expect(result.method).toBe("trace");
    const { file, buffer } = await fileOf(supa, newElements(supa)[0]);
    expect(file.mimeType).toBe("image/svg+xml");
    expect(buffer.toString()).toMatch(/^<svg width="60" height="60" /);
    expect(buffer.toString()).toContain("<path");
  });

  it("keeps small motif colours on a mostly transparent cut-out", async () => {
    // 200×200 transparent with a small red and a small green square
    const cutout = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 12,
              height: 12,
              channels: 4,
              background: "#c8553d",
            },
          })
            .png()
            .toBuffer(),
          left: 20,
          top: 20,
        },
        {
          input: await sharp({
            create: {
              width: 12,
              height: 12,
              channels: 4,
              background: "#3d8f4a",
            },
          })
            .png()
            .toBuffer(),
          left: 150,
          top: 150,
        },
      ])
      .png()
      .toBuffer();
    const supa = await canvasWith(cutout);
    await run(supa, { op: "vectorize_image", colors: 4 });
    const svg = (await fileOf(supa, newElements(supa)[0])).buffer.toString();
    expect(svg).toContain('fill="rgb(200,85,61)"');
    expect(svg).toContain('fill="rgb(61,143,74)"');
    expect(svg).not.toMatch(/opacity="0"/);
  });
});

describe("errors", () => {
  it("rejects an element that is not an image", async () => {
    const supa = await canvasWith(await solid(10, 10));
    await expect(
      run(supa, { op: "vectorize_image", elementId: "missing" }),
    ).rejects.toMatchObject({
      code: "image_not_found",
    });
  });
});
