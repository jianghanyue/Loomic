import { describe, expect, it } from "vitest";

import {
  checkCoverage,
  checkOverlaps,
  checkPattern,
  checkSeams,
} from "./check.js";
import { layoutTossed } from "./layout.js";
import { renderTile, rollTile } from "./render.js";
import { doc, dot, redSquare, repeat, synthTile } from "./test-fixtures.js";

describe("checkSeams", () => {
  it.each(["block", "half_drop", "brick", "mirror"] as const)(
    "%s: engine output with motifs straddling every edge is seamless",
    async (type) => {
      const tile = await renderTile(
        doc({
          repeat: repeat(type),
          ground: "#f4efe6",
          placements: [
            { motifId: "dot", x: 0, y: 5 },
            { motifId: "split", x: 5, y: 0, rotation: 25 },
            { motifId: "dot", x: 9.8, y: 9.9 },
            { motifId: "square", x: 4, y: 6, rotation: 45, scale: 0.7 },
          ],
        }),
      );
      expect(checkSeams(tile).seamless).toBe(true);
      // rolling a seamless tile keeps it seamless
      expect(checkSeams(rollTile(tile, 33, 21)).seamless).toBe(true);
    },
  );

  it("flags a horizontal gradient as a left/right seam only", () => {
    const tile = synthTile(100, 60, (x) => {
      const v = Math.round((x / 99) * 255);
      return [v, v, v];
    });
    const report = checkSeams(tile);
    expect(report.horizontal.ok).toBe(false);
    expect(report.vertical.ok).toBe(true);
    expect(report.seamless).toBe(false);
  });

  it("flags a vertical colour shift as a top/bottom seam", () => {
    const tile = synthTile(80, 80, (x, y) => [
      120 + Math.round(y * 1.2),
      80,
      Math.round((x * 7) % 50),
    ]);
    const report = checkSeams(tile);
    expect(report.vertical.ok).toBe(false);
    expect(report.horizontal.ok).toBe(true);
  });

  it("passes periodic texture and flat colour", () => {
    const stripes = synthTile(96, 48, (x, y) => {
      const v = Math.round(
        127 +
          100 *
            Math.sin((2 * Math.PI * x) / 32) *
            Math.cos((2 * Math.PI * y) / 24),
      );
      return [v, v, 200];
    });
    expect(checkSeams(stripes).seamless).toBe(true);
    expect(checkSeams(synthTile(40, 40, () => [10, 20, 30])).seamless).toBe(
      true,
    );
  });
});

describe("checkCoverage", () => {
  it("reports holes when motifs crowd one side", async () => {
    const tile = await renderTile(
      doc({
        repeat: repeat("block", 20, 20),
        placements: [
          { motifId: "square", x: 2, y: 2 },
          { motifId: "square", x: 2, y: 8 },
          { motifId: "square", x: 2, y: 14 },
        ],
      }),
    );
    const report = checkCoverage(tile, { grid: 4 });
    expect([report.cols, report.rows]).toEqual([4, 4]);
    expect(report.emptyCells).toBeGreaterThanOrEqual(8);
    expect(report.unevenness).toBeGreaterThan(1);
  });

  it("a dense toss is more even than a one-sided layout", async () => {
    const r = repeat("block", 20, 20);
    const motifs = [dot];
    const { placements } = layoutTossed(r, motifs, {
      count: 60,
      seed: 5,
      gapCm: 0.1,
    });
    const even = checkCoverage(
      await renderTile(doc({ repeat: r, motifs, placements })),
      { grid: 4 },
    );
    expect(even.emptyCells).toBe(0);
    expect(even.unevenness).toBeLessThan(0.5);
    expect(even.coverage).toBeGreaterThan(0.1);
  });
});

describe("checkOverlaps", () => {
  it("detects overlap across the tile edge", () => {
    const overlaps = checkOverlaps(
      doc({
        repeat: repeat("block"),
        motifs: [redSquare],
        placements: [
          { motifId: "square", x: 0.5, y: 5 },
          { motifId: "square", x: 9.5, y: 5 },
        ],
      }),
    );
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]).toMatchObject({ a: 0, b: 1 });
    expect(overlaps[0]?.distanceCm).toBeCloseTo(1);
  });

  it("detects a motif colliding with its own mirror copy", () => {
    const overlaps = checkOverlaps(
      doc({
        repeat: repeat("mirror"),
        motifs: [dot],
        placements: [{ motifId: "dot", x: 0.2, y: 5 }],
      }),
    );
    expect(overlaps).toEqual([expect.objectContaining({ a: 0, b: 0 })]);
  });

  it("is empty for well-spaced motifs", () => {
    expect(
      checkOverlaps(
        doc({
          repeat: repeat("block"),
          placements: [
            { motifId: "dot", x: 2.5, y: 2.5 },
            { motifId: "dot", x: 7.5, y: 7.5 },
          ],
        }),
      ),
    ).toEqual([]);
  });
});

describe("checkPattern", () => {
  it("combines all checks", async () => {
    const d = doc({
      repeat: repeat("half_drop"),
      placements: [{ motifId: "dot", x: 5, y: 5 }],
    });
    const report = checkPattern(d, await renderTile(d));
    expect(report.seams.seamless).toBe(true);
    expect(report.overlaps).toEqual([]);
    expect(report.coverage.coverage).toBeGreaterThan(0);
  });
});
