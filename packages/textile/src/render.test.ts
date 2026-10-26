import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  encodeTile,
  exportPixelSize,
  parseHexColor,
  renderRepeatPreview,
  renderTile,
  renderTileLarge,
  rollTile,
  tilePixelSize,
} from "./render.js";
import { doc, pixel, repeat } from "./test-fixtures.js";

const RED = [255, 0, 0, 255];
const BLUE = [0, 0, 255, 255];
const WHITE = [255, 255, 255, 255];

describe("tilePixelSize", () => {
  it("converts the straight repeat from cm to pixels", () => {
    // 254 dpi = 100 px/cm
    expect(
      tilePixelSize(doc({ repeat: { ...repeat("block", 10, 5), dpi: 254 } })),
    ).toEqual({
      width: 1000,
      height: 500,
    });
    expect(
      tilePixelSize(
        doc({ repeat: { ...repeat("half_drop", 10, 5), dpi: 254 } }),
      ),
    ).toEqual({
      width: 2000,
      height: 500,
    });
  });
});

describe("large export", () => {
  it("derives an aspect-safe 16K long-edge size", () => {
    expect(
      exportPixelSize(doc({ repeat: repeat("block", 10, 5) }), {
        maxEdgePx: 16_384,
      }),
    ).toMatchObject({ width: 16_384, height: 8_192 });
  });

  it("renders a requested size without allocating a raw tile", async () => {
    const out = await renderTileLarge(
      doc({
        repeat: repeat("block", 10, 5),
        placements: [{ motifId: "square", x: 0, y: 0 }],
      }),
      { widthPx: 640, format: "png" },
    );
    expect([out.width, out.height]).toEqual([640, 320]);
    expect(out.buffer.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });

  it("rejects an aspect ratio that would stretch the repeat", () => {
    expect(() =>
      exportPixelSize(doc({ repeat: repeat("block", 10, 5) }), {
        widthPx: 640,
        heightPx: 640,
      }),
    ).toThrow(/aspect ratio/);
  });
});

describe("renderTile", () => {
  it("fills the ground and records zero coverage there", async () => {
    const tile = await renderTile(
      doc({ repeat: repeat("block"), ground: "#336699" }),
    );
    expect(tile.width).toBe(100);
    expect(pixel(tile, 50, 50)).toEqual([0x33, 0x66, 0x99, 255]);
    expect(tile.coverage.every((v) => v === 0)).toBe(true);
  });

  it("leaves a null ground transparent", async () => {
    const tile = await renderTile(
      doc({ repeat: repeat("block"), ground: null }),
    );
    expect(pixel(tile, 10, 10)[3]).toBe(0);
  });

  it("wraps a motif centred on the corner onto all four corners", async () => {
    const tile = await renderTile(
      doc({
        repeat: repeat("block"),
        placements: [{ motifId: "square", x: 0, y: 0 }],
      }),
    );
    for (const [x, y] of [
      [0, 0],
      [99, 0],
      [0, 99],
      [99, 99],
    ] as const) {
      expect(pixel(tile, x, y)).toEqual(RED);
    }
    expect(pixel(tile, 50, 50)).toEqual(WHITE);
    expect(tile.coverage[0]).toBe(255);
    expect(tile.coverage[50 * 100 + 50]).toBe(0);
  });

  it("half_drop renders the dropped copy in the second column", async () => {
    // unit 10×5 cm → straight tile 200×50 px; copy at (15, 5) cm wraps to the top/bottom edge
    const tile = await renderTile(
      doc({
        repeat: repeat("half_drop", 10, 5),
        placements: [{ motifId: "square", x: 5, y: 2.5 }],
      }),
    );
    expect([tile.width, tile.height]).toEqual([200, 50]);
    expect(pixel(tile, 50, 25)).toEqual(RED);
    expect(pixel(tile, 150, 0)).toEqual(RED);
    expect(pixel(tile, 150, 49)).toEqual(RED);
    expect(pixel(tile, 150, 25)).toEqual(WHITE);
  });

  it("mirror produces a horizontally symmetric tile with flipped motifs", async () => {
    const tile = await renderTile(
      doc({
        repeat: repeat("mirror"),
        placements: [{ motifId: "split", x: 2, y: 2 }],
      }),
    );
    // original spans x 10..29 px: red on the left, blue on the right
    expect(pixel(tile, 15, 20)).toEqual(RED);
    expect(pixel(tile, 25, 20)).toEqual(BLUE);
    // its mirror at x 170..189 is flipped
    expect(pixel(tile, 184, 20)).toEqual(RED);
    expect(pixel(tile, 174, 20)).toEqual(BLUE);
    // and the vertical mirror sits at the bottom
    expect(pixel(tile, 15, 179)).toEqual(RED);
  });

  it("rotates clockwise after scaling", async () => {
    const tile = await renderTile(
      doc({
        repeat: repeat("block"),
        placements: [{ motifId: "split", x: 5, y: 5, rotation: 90 }],
      }),
    );
    // left-red/right-blue turned 90° clockwise → red on top, blue below
    expect(pixel(tile, 50, 43)).toEqual(RED);
    expect(pixel(tile, 50, 57)).toEqual(BLUE);
    // still 2 cm (20 px) across, not the rotated bounding box rescaled
    expect(pixel(tile, 50, 38)).toEqual(WHITE);
  });

  it("applies scale", async () => {
    const tile = await renderTile(
      doc({
        repeat: repeat("block"),
        placements: [{ motifId: "square", x: 5, y: 5, scale: 2 }],
      }),
    );
    expect(pixel(tile, 31, 50)).toEqual(RED);
    expect(pixel(tile, 28, 50)).toEqual(WHITE);
  });

  it("throws on unknown motifs", async () => {
    await expect(
      renderTile(
        doc({
          repeat: repeat("block"),
          placements: [{ motifId: "missing", x: 1, y: 1 }],
        }),
      ),
    ).rejects.toThrow(/unknown motif/);
  });
});

describe("tile utilities", () => {
  it("rollTile is reversible", async () => {
    const tile = await renderTile(
      doc({
        repeat: repeat("block"),
        placements: [{ motifId: "split", x: 3, y: 7, rotation: 20 }],
      }),
    );
    const back = rollTile(rollTile(tile, 37, -12), -37, 12);
    expect(back.data.equals(tile.data)).toBe(true);
  });

  it("rollTile rounds fractional offsets instead of misaligning channels", async () => {
    // 10.1 cm at 10 px/cm → 101 px wide, so half the width is 50.5
    const tile = await renderTile(
      doc({ repeat: repeat("block", 10.1, 10), ground: "#336699" }),
    );
    const rolled = rollTile(tile, tile.width / 2, tile.height / 2);
    expect(pixel(rolled, 7, 3)).toEqual([0x33, 0x66, 0x99, 255]);
  });

  it("encodeTile writes the DPI into PNG and TIFF metadata", async () => {
    const tile = await renderTile(
      doc({ repeat: { ...repeat("block", 2, 2), dpi: 300 } }),
    );
    for (const format of ["png", "tiff"] as const) {
      const meta = await sharp(await encodeTile(tile, format)).metadata();
      expect(meta.format).toBe(format);
      expect(meta.width).toBe(tile.width);
      expect(Math.round(meta.density ?? 0)).toBe(300);
    }
  });

  it("renderRepeatPreview tiles cols × rows", async () => {
    const tile = await renderTile(doc({ repeat: repeat("block") }));
    const meta = await sharp(
      await renderRepeatPreview(tile, { cols: 3, rows: 2, maxWidth: 300 }),
    ).metadata();
    expect([meta.width, meta.height]).toEqual([300, 200]);
  });

  it("parseHexColor accepts short and long forms", () => {
    expect(parseHexColor("#0af")).toEqual([0, 0xaa, 0xff]);
    expect(parseHexColor("12AB34")).toEqual([0x12, 0xab, 0x34]);
    expect(() => parseHexColor("red")).toThrow();
  });
});
