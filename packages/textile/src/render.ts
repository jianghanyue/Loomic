import sharp from "sharp";

import { expandPlacements, straightRepeatSize } from "./layout.js";
import type { Motif, PatternDoc, Placement, RenderedTile } from "./types.js";

const CM_PER_INCH = 2.54;

export interface RenderOptions {
  /** Override the document DPI, e.g. a low value for fast previews. */
  dpi?: number;
}

/** Pixel size of the straight repeat tile at a given DPI. */
export function tilePixelSize(
  doc: Pick<PatternDoc, "repeat">,
  dpi = doc.repeat.dpi,
) {
  const { widthCm, heightCm } = straightRepeatSize(doc.repeat);
  return {
    width: Math.max(1, Math.round((widthCm / CM_PER_INCH) * dpi)),
    height: Math.max(1, Math.round((heightCm / CM_PER_INCH) * dpi)),
  };
}

/**
 * Render the straight repeat tile. Every motif pixel is written at
 * (x mod width, y mod height), so anything crossing an edge reappears on the
 * opposite side and the tile is seamless by construction.
 */
export async function renderTile(
  doc: PatternDoc,
  opts: RenderOptions = {},
): Promise<RenderedTile> {
  const dpi = opts.dpi ?? doc.repeat.dpi;
  const tileCm = straightRepeatSize(doc.repeat);
  const { width, height } = tilePixelSize(doc, dpi);
  // Per-axis scale so positions land exactly on the rounded tile size.
  const sx = width / tileCm.widthCm;
  const sy = height / tileCm.heightCm;

  const data = Buffer.alloc(width * height * 4);
  const coverage = new Uint8Array(width * height);
  if (doc.ground !== null) fillGround(data, parseHexColor(doc.ground));

  const motifs = new Map(doc.motifs.map((m) => [m.id, m]));
  const cache = new Map<string, Promise<RasterMotif>>();

  for (const p of expandPlacements(doc)) {
    const motif = motifs.get(p.motifId);
    if (!motif)
      throw new Error(`placement references unknown motif: ${p.motifId}`);

    const key = rasterKey(p);
    let raster = cache.get(key);
    if (!raster) {
      raster = rasterizeMotif(motif, p, sx);
      cache.set(key, raster);
    }
    const r = await raster;
    compositeWrapped(
      { data, coverage, width, height },
      r,
      Math.round(p.x * sx - r.width / 2),
      Math.round(p.y * sy - r.height / 2),
    );
  }

  return { width, height, data, coverage, dpi };
}

// ---------------------------------------------------------------------------
// Motif rasterization
// ---------------------------------------------------------------------------

interface RasterMotif {
  width: number;
  height: number;
  data: Buffer;
}

function rasterKey(p: Placement): string {
  return [
    p.motifId,
    p.scale ?? 1,
    p.rotation ?? 0,
    p.flipX ? 1 : 0,
    p.flipY ? 1 : 0,
  ].join("|");
}

async function rasterizeMotif(
  motif: Motif,
  p: Placement,
  pxPerCm: number,
): Promise<RasterMotif> {
  const targetWidth = Math.max(
    1,
    Math.round(motif.widthCm * (p.scale ?? 1) * pxPerCm),
  );

  // Rasterize vectors at the target size instead of upscaling a 72-dpi bitmap.
  const meta = await sharp(motif.src).metadata();
  const density =
    meta.format === "svg" && meta.width
      ? Math.min(100_000, Math.max(1, (72 * targetWidth) / meta.width))
      : undefined;

  // sharp applies rotate before resize within one pipeline, so resize first in
  // its own pass; otherwise the rotated bounding box would be scaled instead.
  let img = sharp(motif.src, density ? { density } : {})
    .resize({ width: targetWidth })
    .ensureAlpha();
  if (p.flipX) img = img.flop();
  if (p.flipY) img = img.flip();
  const sized = await img.raw().toBuffer({ resolveWithObject: true });

  const rotation = p.rotation ?? 0;
  if (rotation % 360 === 0) {
    return {
      width: sized.info.width,
      height: sized.info.height,
      data: sized.data,
    };
  }
  const rotated = await sharp(sized.data, {
    raw: { width: sized.info.width, height: sized.info.height, channels: 4 },
  })
    .rotate(rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    width: rotated.info.width,
    height: rotated.info.height,
    data: rotated.data,
  };
}

// ---------------------------------------------------------------------------
// Compositing
// ---------------------------------------------------------------------------

interface Target {
  data: Buffer;
  coverage: Uint8Array;
  width: number;
  height: number;
}

/** Source-over blend of `src` at (x0, y0), wrapping modulo the target size. */
function compositeWrapped(
  dst: Target,
  src: RasterMotif,
  x0: number,
  y0: number,
): void {
  const { width: W, height: H } = dst;
  const colIndex = new Int32Array(src.width);
  for (let i = 0; i < src.width; i++) colIndex[i] = mod(x0 + i, W);

  for (let j = 0; j < src.height; j++) {
    const rowBase = mod(y0 + j, H) * W;
    for (let i = 0; i < src.width; i++) {
      const s = (j * src.width + i) * 4;
      const sa = src.data[s + 3] as number;
      if (sa === 0) continue;

      const px = rowBase + (colIndex[i] as number);
      const d = px * 4;
      const a = sa / 255;
      const da = (dst.data[d + 3] as number) / 255;
      const oa = a + da * (1 - a);
      for (let c = 0; c < 3; c++) {
        const sc = src.data[s + c] as number;
        const dc = dst.data[d + c] as number;
        dst.data[d + c] = Math.round((sc * a + dc * da * (1 - a)) / oa);
      }
      dst.data[d + 3] = Math.round(oa * 255);
      if (sa > (dst.coverage[px] as number)) dst.coverage[px] = sa;
    }
  }
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

function fillGround(data: Buffer, [r, g, b]: [number, number, number]): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
}

export function parseHexColor(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`invalid colour: ${hex}`);
  let h = m[1] as string;
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

// ---------------------------------------------------------------------------
// Tile utilities
// ---------------------------------------------------------------------------

/**
 * Shift the tile with wrap-around. Rolling by half exposes seams at the centre.
 * Offsets are rounded to whole pixels (half of an odd width is fractional).
 */
export function rollTile(
  tile: RenderedTile,
  dx: number,
  dy: number,
): RenderedTile {
  const { width: W, height: H } = tile;
  dx = Math.round(dx);
  dy = Math.round(dy);
  const data = Buffer.alloc(tile.data.length);
  const coverage = new Uint8Array(tile.coverage.length);
  for (let y = 0; y < H; y++) {
    const ty = mod(y + dy, H);
    for (let x = 0; x < W; x++) {
      const from = y * W + x;
      const to = ty * W + mod(x + dx, W);
      tile.data.copy(data, to * 4, from * 4, from * 4 + 4);
      coverage[to] = tile.coverage[from] as number;
    }
  }
  return { ...tile, data, coverage };
}

/** Encode the tile as a print file with the DPI recorded in its metadata. */
export async function encodeTile(
  tile: RenderedTile,
  format: "png" | "tiff" = "png",
): Promise<Buffer> {
  const img = sharp(tile.data, {
    raw: { width: tile.width, height: tile.height, channels: 4 },
  }).withMetadata({ density: tile.dpi });
  return format === "tiff"
    ? img.tiff({ compression: "lzw" }).toBuffer()
    : img.png().toBuffer();
}

export interface PreviewOptions {
  cols?: number;
  rows?: number;
  /** Width of the whole preview in pixels. Default 1200. */
  maxWidth?: number;
}

/** PNG showing the tile repeated cols × rows, downscaled for display. */
export async function renderRepeatPreview(
  tile: RenderedTile,
  opts: PreviewOptions = {},
): Promise<Buffer> {
  const cols = opts.cols ?? 3;
  const rows = opts.rows ?? 3;
  const cellW = Math.max(1, Math.floor((opts.maxWidth ?? 1200) / cols));
  const cellH = Math.max(1, Math.round((cellW * tile.height) / tile.width));

  const cell = await sharp(tile.data, {
    raw: { width: tile.width, height: tile.height, channels: 4 },
  })
    .resize({ width: cellW, height: cellH, fit: "fill" })
    .png()
    .toBuffer();

  const overlays: sharp.OverlayOptions[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++)
      overlays.push({ input: cell, left: c * cellW, top: r * cellH });
  }
  return sharp({
    create: {
      width: cellW * cols,
      height: cellH * rows,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(overlays)
    .png()
    .toBuffer();
}
