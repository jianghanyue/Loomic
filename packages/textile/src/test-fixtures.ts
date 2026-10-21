import type { Motif, PatternDoc, RenderedTile, RepeatSpec } from "./types.js";

/** 25.4 dpi = 10 px per cm, which keeps test rasters small and coordinates exact. */
export const TEST_DPI = 25.4;

export function svg(body: string, w = 100, h = 100): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`,
  );
}

/** Opaque red square. */
export const redSquare: Motif = {
  id: "square",
  src: svg(`<rect width="100" height="100" fill="#ff0000"/>`),
  widthCm: 2,
};

/** Left half red, right half blue — shows flips and rotations. */
export const splitSquare: Motif = {
  id: "split",
  src: svg(
    `<rect width="50" height="100" fill="#ff0000"/><rect x="50" width="50" height="100" fill="#0000ff"/>`,
  ),
  widthCm: 2,
};

/** Soft dot with a transparent surround. */
export const dot: Motif = {
  id: "dot",
  src: svg(`<circle cx="50" cy="50" r="45" fill="#2a6f97"/>`),
  widthCm: 1.5,
};

export function repeat(
  type: RepeatSpec["type"],
  widthCm = 10,
  heightCm = 10,
): RepeatSpec {
  return { type, widthCm, heightCm, dpi: TEST_DPI };
}

export function doc(
  partial: Partial<PatternDoc> & Pick<PatternDoc, "repeat">,
): PatternDoc {
  return {
    ground: "#ffffff",
    motifs: [redSquare, splitSquare, dot],
    placements: [],
    ...partial,
  };
}

export function pixel(
  tile: RenderedTile,
  x: number,
  y: number,
): [number, number, number, number] {
  const i = (y * tile.width + x) * 4;
  return [
    tile.data[i],
    tile.data[i + 1],
    tile.data[i + 2],
    tile.data[i + 3],
  ] as [number, number, number, number];
}

/** Build a raw tile from a per-pixel colour function. */
export function synthTile(
  width: number,
  height: number,
  color: (x: number, y: number) => [number, number, number],
): RenderedTile {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = color(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return {
    width,
    height,
    data,
    coverage: new Uint8Array(width * height),
    dpi: TEST_DPI,
  };
}
