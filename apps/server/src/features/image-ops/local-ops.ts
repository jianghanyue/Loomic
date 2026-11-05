// Image operations that run in-process, without ComfyUI.

import ImageTracer from "imagetracerjs";
import sharp from "sharp";

import { CanvasError } from "../canvas/canvas-state.js";

export type RasterResult = { buffer: Buffer; width: number; height: number };

/**
 * Remove a solid background: flood-fill from the image border through pixels
 * close to the border colour, then feather the edge. Works for generated
 * motifs on plain white or coloured backdrops; photos need the model.
 */
export async function colorKeyCutout(
  input: Buffer,
  opts: { tolerance?: number; trim?: boolean } = {},
): Promise<RasterResult> {
  const tolerance = opts.tolerance ?? 32;
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;

  const border: number[] = [];
  for (let x = 0; x < W; x++) border.push(x, (H - 1) * W + x);
  for (let y = 1; y < H - 1; y++) border.push(y * W, y * W + W - 1);

  const median = (c: number) => {
    const values = border
      .map((p) => data[p * 4 + c] as number)
      .sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)] as number;
  };
  const bg = [median(0), median(1), median(2)] as const;
  const dist = (p: number) =>
    Math.hypot(
      (data[p * 4] as number) - bg[0],
      (data[p * 4 + 1] as number) - bg[1],
      (data[p * 4 + 2] as number) - bg[2],
    );

  const onBackground =
    border.filter((p) => dist(p) <= tolerance).length / border.length;
  if (onBackground < 0.85) {
    throw new CanvasError(
      "background_not_uniform",
      "The background is not a single solid colour, so it cannot be keyed out locally. Configure ComfyUI (COMFYUI_BASE_URL) to use the BiRefNet model.",
    );
  }

  // Flood fill the background region reachable from the border.
  const isBg = new Uint8Array(W * H);
  const queue = new Int32Array(W * H);
  let head = 0;
  let tail = 0;
  for (const p of border) {
    if (!isBg[p] && dist(p) <= tolerance) {
      isBg[p] = 1;
      queue[tail++] = p;
    }
  }
  while (head < tail) {
    const p = queue[head++] as number;
    const x = p % W;
    const y = (p - x) / W;
    const neighbours = [
      x > 0 ? p - 1 : -1,
      x < W - 1 ? p + 1 : -1,
      y > 0 ? p - W : -1,
      y < H - 1 ? p + W : -1,
    ];
    for (const n of neighbours) {
      if (n >= 0 && !isBg[n] && dist(n) <= tolerance) {
        isBg[n] = 1;
        queue[tail++] = n;
      }
    }
  }

  for (let p = 0; p < W * H; p++) {
    if (isBg[p]) {
      data[p * 4 + 3] = 0;
      continue;
    }
    // Feather pixels touching the background that are still close to its colour.
    const x = p % W;
    const touches =
      (x > 0 && isBg[p - 1]) ||
      (x < W - 1 && isBg[p + 1]) ||
      isBg[p - W] ||
      isBg[p + W];
    if (touches) {
      const t = Math.min(1, Math.max(0, (dist(p) - tolerance) / tolerance));
      data[p * 4 + 3] = Math.round((data[p * 4 + 3] as number) * t);
    }
  }

  let img = sharp(data, { raw: { width: W, height: H, channels: 4 } });
  if (opts.trim !== false) {
    const box = opaqueBounds(data, W, H);
    if (!box)
      throw new CanvasError(
        "empty_result",
        "Nothing left after removing the background.",
      );
    img = sharp(await img.png().toBuffer()).extract(box);
  }
  const { data: png, info: out } = await img
    .png()
    .toBuffer({ resolveWithObject: true });
  return { buffer: png, width: out.width, height: out.height };
}

function opaqueBounds(data: Buffer, W: number, H: number) {
  let left = W;
  let top = H;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if ((data[(y * W + x) * 4 + 3] as number) > 8) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return null;
  const pad = 2;
  left = Math.max(0, left - pad);
  top = Math.max(0, top - pad);
  right = Math.min(W - 1, right + pad);
  bottom = Math.min(H - 1, bottom + pad);
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/** Lanczos resize — the fallback when the upscale model is unavailable. */
export async function plainUpscale(
  input: Buffer,
  factor: number,
): Promise<RasterResult> {
  const meta = await sharp(input).metadata();
  const width = Math.round((meta.width ?? 1) * factor);
  const height = Math.round((meta.height ?? 1) * factor);
  const buffer = await sharp(input, { limitInputPixels: false })
    .resize({ width, height, kernel: "lanczos3" })
    .png()
    .toBuffer();
  return { buffer, width, height };
}

/**
 * Clean small alpha speckles and isolated edge pixels without a model.
 * This is exposed to the agent as a deterministic denoise step so the
 * workflow can remain agent-orchestrated while still working offline.
 */
export async function denoiseRgba(input: Buffer): Promise<RasterResult> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const alpha = (x: number, y: number) => data[(y * W + x) * 4 + 3] ?? 0;
  const output = Buffer.from(data);

  for (let y = 1; y < H - 1; y += 1) {
    for (let x = 1; x < W - 1; x += 1) {
      const p = (y * W + x) * 4;
      const current = alpha(x, y);
      if (current === 0) continue;
      const neighbours = [
        alpha(x - 1, y),
        alpha(x + 1, y),
        alpha(x, y - 1),
        alpha(x, y + 1),
      ];
      const strong = neighbours.filter((value) => value > 80).length;
      if (current < 80 && strong < 2) output[p + 3] = 0;
      else if (current >= 80 && strong === 0) output[p + 3] = Math.min(current, 120);
    }
  }

  const buffer = await sharp(output, { raw: { width: W, height: H, channels: 4 } })
    .png()
    .toBuffer();
  return { buffer, width: W, height: H };
}

const TRACE_MAX_SIDE = 1024;

/**
 * Trace a raster into SVG paths with at most `colors` colours. For prints the
 * colour count is the number of screens, so it doubles as a colour reduction.
 */
export async function vectorizeToSvg(
  input: Buffer,
  opts: { colors?: number } = {},
): Promise<RasterResult> {
  const { data, info } = await sharp(input)
    .resize({
      width: TRACE_MAX_SIDE,
      height: TRACE_MAX_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // Hard alpha: soft edges and the arbitrary RGB of transparent pixels would
  // otherwise take palette slots and trace as faint junk shapes.
  let hasTransparency = false;
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] as number) < 128) {
      data.fill(0, i, i + 4);
      hasTransparency = true;
    } else data[i + 3] = 255;
  }
  const colors = Math.max(2, Math.min(64, opts.colors ?? 16));
  // imagetracer's own palette sampling is dominated by large flat areas (often
  // the transparent background), so small motifs lose their colour. Seed it
  // with a median-cut palette of the opaque pixels instead.
  const pal = medianCutPalette(data, hasTransparency ? colors - 1 : colors);
  if (hasTransparency) pal.push({ r: 0, g: 0, b: 0, a: 0 });
  const svg = ImageTracer.imagedataToSVG(
    {
      width: info.width,
      height: info.height,
      data: new Uint8ClampedArray(data),
    },
    {
      pal,
      numberofcolors: pal.length,
      ltres: 1,
      qtres: 1,
      pathomit: 8,
      colorquantcycles: 3,
      roundcoords: 1,
      viewbox: true,
    },
  );
  // Drop the invisible layer traced from transparent pixels, and give the
  // viewBox-only SVG an intrinsic size for the canvas.
  const sized = svg
    .replace(/<path [^>]*opacity="0"[^>]*\/>/g, "")
    .replace("<svg ", `<svg width="${info.width}" height="${info.height}" `);
  return { buffer: Buffer.from(sized), width: info.width, height: info.height };
}

type Rgba = { r: number; g: number; b: number; a: number };

/** Median-cut palette of the opaque pixels in an RGBA buffer. */
function medianCutPalette(data: Buffer, size: number): Rgba[] {
  const stride = Math.max(1, Math.floor(data.length / 4 / 60_000));
  const pixels: [number, number, number][] = [];
  for (let p = 0; p < data.length / 4; p += stride) {
    if ((data[p * 4 + 3] as number) === 255) {
      pixels.push([
        data[p * 4] as number,
        data[p * 4 + 1] as number,
        data[p * 4 + 2] as number,
      ]);
    }
  }
  if (pixels.length === 0) return [{ r: 0, g: 0, b: 0, a: 255 }];

  let boxes = [pixels];
  while (boxes.length < size) {
    // Split the box with the widest channel range at its median.
    let best = -1;
    let bestRange = 0;
    let bestChannel = 0;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255;
        let hi = 0;
        for (const px of box) {
          lo = Math.min(lo, px[c]!);
          hi = Math.max(hi, px[c]!);
        }
        if (hi - lo > bestRange) {
          bestRange = hi - lo;
          best = i;
          bestChannel = c;
        }
      }
    });
    if (best < 0) break;
    const box = boxes[best]!.sort((a, b) => a[bestChannel]! - b[bestChannel]!);
    const mid = box.length >> 1;
    boxes = [
      ...boxes.slice(0, best),
      box.slice(0, mid),
      box.slice(mid),
      ...boxes.slice(best + 1),
    ];
  }

  return boxes.map((box) => {
    const sum = box.reduce(
      (s, px) => [s[0]! + px[0], s[1]! + px[1], s[2]! + px[2]],
      [0, 0, 0],
    );
    return {
      r: Math.round(sum[0]! / box.length),
      g: Math.round(sum[1]! / box.length),
      b: Math.round(sum[2]! / box.length),
      a: 255,
    };
  });
}

/**
 * Mask for the erase workflow: same size as the image, opaque everywhere
 * except the region to erase (ComfyUI's LoadImageMask reads alpha inverted).
 * `region` is in fractions of the image size.
 */
export async function regionMask(
  width: number,
  height: number,
  region: { x: number; y: number; width: number; height: number },
): Promise<Buffer> {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const left = Math.round(clamp(region.x) * width);
  const top = Math.round(clamp(region.y) * height);
  const right = Math.round(clamp(region.x + region.width) * width);
  const bottom = Math.round(clamp(region.y + region.height) * height);
  if (right - left < 1 || bottom - top < 1) {
    throw new CanvasError("invalid_region", "The region to erase is empty.");
  }
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inside = x >= left && x < right && y >= top && y < bottom;
      data[(y * width + x) * 4 + 3] = inside ? 0 : 255;
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}
