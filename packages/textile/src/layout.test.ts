import { describe, expect, it } from "vitest";

import { checkOverlaps } from "./check.js";
import {
  expandPlacements,
  layoutGrid,
  layoutTossed,
  straightRepeatSize,
  unitCopies,
  wrappedDistance,
} from "./layout.js";
import { doc, dot, redSquare, repeat } from "./test-fixtures.js";

describe("straightRepeatSize", () => {
  it.each([
    ["block", 10, 6],
    ["half_drop", 20, 6],
    ["brick", 10, 12],
    ["mirror", 20, 12],
  ] as const)("%s → %d × %d cm", (type, w, h) => {
    expect(straightRepeatSize(repeat(type, 10, 6))).toEqual({
      widthCm: w,
      heightCm: h,
    });
  });
});

describe("unitCopies", () => {
  const p = { motifId: "m", x: 2, y: 3, rotation: 30 };

  it("half_drop adds a copy one unit right and half a unit down", () => {
    expect(unitCopies(p, repeat("half_drop", 10, 6))).toEqual([
      p,
      { ...p, x: 12, y: 6 },
    ]);
  });

  it("brick adds a copy half a unit right and one unit down", () => {
    expect(unitCopies(p, repeat("brick", 10, 6))).toEqual([
      p,
      { ...p, x: 7, y: 9 },
    ]);
  });

  it("mirror reflects position, toggles flips and negates rotation", () => {
    const [, h, v, both] = unitCopies(p, repeat("mirror", 10, 6));
    expect(h).toMatchObject({ x: 18, y: 3, rotation: -30, flipX: true });
    expect(v).toMatchObject({ x: 2, y: 9, rotation: -30, flipY: true });
    expect(both).toMatchObject({
      x: 18,
      y: 9,
      rotation: 30,
      flipX: true,
      flipY: true,
    });
  });

  it("expandPlacements flattens copies for every placement", () => {
    const d = doc({
      repeat: repeat("mirror"),
      placements: [p, { ...p, x: 5 }],
    });
    expect(expandPlacements(d)).toHaveLength(8);
  });
});

describe("wrappedDistance", () => {
  it("measures the short way round the tile", () => {
    const tile = { widthCm: 10, heightCm: 10 };
    expect(
      wrappedDistance({ x: 0.5, y: 5 }, { x: 9.5, y: 5 }, tile),
    ).toBeCloseTo(1);
    expect(wrappedDistance({ x: 1, y: 1 }, { x: 9, y: 9 }, tile)).toBeCloseTo(
      Math.SQRT2 * 2,
    );
  });
});

describe("layoutGrid", () => {
  it("places one motif per cell, cycling motif ids", () => {
    const placements = layoutGrid(repeat("block", 10, 10), {
      cols: 2,
      rows: 2,
      motifIds: ["a", "b"],
    });
    expect(placements.map((p) => [p.motifId, p.x, p.y])).toEqual([
      ["a", 2.5, 2.5],
      ["b", 7.5, 2.5],
      ["a", 2.5, 7.5],
      ["b", 7.5, 7.5],
    ]);
  });

  it("stagger shifts odd rows by half a cell", () => {
    const placements = layoutGrid(repeat("block", 10, 10), {
      cols: 2,
      rows: 2,
      motifIds: ["a"],
      stagger: true,
    });
    expect(placements[2]?.x).toBe(5);
  });

  it("rejects empty grids", () => {
    expect(() =>
      layoutGrid(repeat("block"), { cols: 0, rows: 1, motifIds: ["a"] }),
    ).toThrow();
  });
});

describe("layoutTossed", () => {
  const motifs = [redSquare, dot];

  it("is deterministic for a given seed", () => {
    const a = layoutTossed(repeat("block", 30, 30), motifs, {
      count: 12,
      seed: 7,
      rotationRange: [0, 360],
    });
    const b = layoutTossed(repeat("block", 30, 30), motifs, {
      count: 12,
      seed: 7,
      rotationRange: [0, 360],
    });
    const c = layoutTossed(repeat("block", 30, 30), motifs, {
      count: 12,
      seed: 8,
      rotationRange: [0, 360],
    });
    expect(a).toEqual(b);
    expect(c.placements).not.toEqual(a.placements);
  });

  it.each(["block", "half_drop", "brick", "mirror"] as const)(
    "%s: no bounding circles overlap, including across edges and copies",
    (type) => {
      const r = repeat(type, 20, 20);
      const result = layoutTossed(r, motifs, {
        count: 15,
        seed: 3,
        gapCm: 0.2,
        scaleRange: [0.8, 1.2],
      });
      expect(result.placed).toBe(15);
      const overlaps = checkOverlaps(
        doc({ repeat: r, motifs, placements: result.placements }),
        { gapCm: 0.2 },
      );
      expect(overlaps).toEqual([]);
    },
  );

  it("stops early instead of overlapping when the unit is full", () => {
    const result = layoutTossed(repeat("block", 5, 5), [redSquare], {
      count: 50,
      seed: 1,
    });
    expect(result.placed).toBeLessThan(50);
    expect(result.placed).toBeGreaterThan(0);
    expect(result.requested).toBe(50);
  });

  it("honours weights", () => {
    const result = layoutTossed(repeat("block", 60, 60), motifs, {
      count: 40,
      seed: 2,
      weights: [0, 1],
    });
    expect(result.placements.every((p) => p.motifId === "dot")).toBe(true);
  });

  it.each(["block", "half_drop", "mirror"] as const)(
    "%s: a second layer avoids the first one",
    (type) => {
      const r = repeat(type, 20, 20);
      const first = layoutTossed(r, motifs, {
        count: 8,
        seed: 1,
        motifIds: ["square"],
      });
      const second = layoutTossed(r, motifs, {
        count: 30,
        seed: 2,
        motifIds: ["dot"],
        gapCm: 0.1,
        avoid: first.placements,
      });
      expect(second.placed).toBeGreaterThan(0);
      const all = [...first.placements, ...second.placements];
      expect(
        checkOverlaps(doc({ repeat: r, motifs, placements: all }), {
          gapCm: 0.1,
          // only pairs involving the second layer (a ≤ b)
        }).filter((o) => o.b >= first.placements.length),
      ).toEqual([]);
    },
  );

  it("rejects unknown motif ids", () => {
    expect(() =>
      layoutTossed(repeat("block"), motifs, { count: 1, motifIds: ["nope"] }),
    ).toThrow(/unknown motif/);
  });
});
