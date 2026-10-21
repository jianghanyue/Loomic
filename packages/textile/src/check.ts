import {
  boundingRadius,
  straightRepeatSize,
  unitCopies,
  wrappedDistance,
} from "./layout.js";
import type { PatternDoc, RenderedTile } from "./types.js";

// ---------------------------------------------------------------------------
// Seams
// ---------------------------------------------------------------------------

export interface SeamAxisReport {
  /** Mean absolute RGBA difference across the wrap edge (last ↔ first line). */
  wrapDiff: number;
  /** 99th percentile of the same measure over interior neighbouring lines. */
  typicalDiff: number;
  ok: boolean;
}

export interface SeamReport {
  /** Left ↔ right edge (columns). */
  horizontal: SeamAxisReport;
  /** Top ↔ bottom edge (rows). */
  vertical: SeamAxisReport;
  seamless: boolean;
}

export interface SeamCheckOptions {
  /** wrapDiff may be at most this multiple of typicalDiff. Default 2. */
  tolerance?: number;
  /** Absolute allowance so flat tiles don't fail on noise. Default 2 (of 255). */
  floor?: number;
}

/**
 * Detects a visible seam when the tile is repeated: compares the difference
 * between the last and first column (row) with the differences between
 * neighbouring columns (rows) inside the tile.
 */
export function checkSeams(
  tile: RenderedTile,
  opts: SeamCheckOptions = {},
): SeamReport {
  const tolerance = opts.tolerance ?? 2;
  const floor = opts.floor ?? 2;
  const { width: W, height: H, data } = tile;

  const colDiff = (a: number, b: number) => {
    let sum = 0;
    for (let y = 0; y < H; y++) {
      const ra = (y * W + a) * 4;
      const rb = (y * W + b) * 4;
      for (let c = 0; c < 4; c++)
        sum += Math.abs((data[ra + c] as number) - (data[rb + c] as number));
    }
    return sum / (H * 4);
  };
  const rowDiff = (a: number, b: number) => {
    let sum = 0;
    const ra = a * W * 4;
    const rb = b * W * 4;
    for (let i = 0; i < W * 4; i++)
      sum += Math.abs((data[ra + i] as number) - (data[rb + i] as number));
    return sum / (W * 4);
  };

  const axis = (
    n: number,
    diff: (a: number, b: number) => number,
  ): SeamAxisReport => {
    const interior: number[] = [];
    for (let i = 0; i < n - 1; i++) interior.push(diff(i, i + 1));
    const wrapDiff = n > 1 ? diff(n - 1, 0) : 0;
    const typicalDiff = percentile(interior, 0.99);
    return {
      wrapDiff,
      typicalDiff,
      ok: wrapDiff <= Math.max(typicalDiff * tolerance, floor),
    };
  };

  const horizontal = axis(W, colDiff);
  const vertical = axis(H, rowDiff);
  return { horizontal, vertical, seamless: horizontal.ok && vertical.ok };
}

function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.floor(q * sorted.length))
  ] as number;
}

// ---------------------------------------------------------------------------
// Coverage / distribution
// ---------------------------------------------------------------------------

export interface CoverageReport {
  /** Fraction of the tile covered by motifs (alpha ≥ 50%). */
  coverage: number;
  cols: number;
  rows: number;
  /** Covered fraction per grid cell, row-major. */
  cells: number[];
  /** Coefficient of variation across cells; lower is more even. */
  unevenness: number;
  /** Cells whose coverage is below `emptyBelow` — visible holes. */
  emptyCells: number;
}

export interface CoverageCheckOptions {
  /** Grid columns; rows follow the tile aspect ratio. Default 8. */
  grid?: number;
  emptyBelow?: number;
}

export function checkCoverage(
  tile: RenderedTile,
  opts: CoverageCheckOptions = {},
): CoverageReport {
  const { width: W, height: H, coverage } = tile;
  const cols = Math.max(1, opts.grid ?? 8);
  const rows = Math.max(1, Math.round((cols * H) / W));
  const emptyBelow = opts.emptyBelow ?? 0.02;

  const covered = new Float64Array(cols * rows);
  const total = new Float64Array(cols * rows);
  let all = 0;
  for (let y = 0; y < H; y++) {
    const cy = Math.min(rows - 1, Math.floor((y * rows) / H));
    for (let x = 0; x < W; x++) {
      const cell = cy * cols + Math.min(cols - 1, Math.floor((x * cols) / W));
      total[cell] = (total[cell] as number) + 1;
      if ((coverage[y * W + x] as number) >= 128) {
        covered[cell] = (covered[cell] as number) + 1;
        all++;
      }
    }
  }

  const cells = Array.from(
    covered,
    (c, i) => c / Math.max(1, total[i] as number),
  );
  const mean = cells.reduce((s, v) => s + v, 0) / cells.length;
  const variance =
    cells.reduce((s, v) => s + (v - mean) ** 2, 0) / cells.length;
  return {
    coverage: all / (W * H),
    cols,
    rows,
    cells,
    unevenness: mean > 0 ? Math.sqrt(variance) / mean : 0,
    emptyCells: cells.filter((v) => v < emptyBelow).length,
  };
}

// ---------------------------------------------------------------------------
// Overlaps
// ---------------------------------------------------------------------------

export interface Overlap {
  /** Indices into doc.placements; equal when a motif hits its own mirror copy. */
  a: number;
  b: number;
  distanceCm: number;
  requiredCm: number;
}

/**
 * Pairs of placements whose bounding circles come closer than `gapCm`,
 * including across tile edges and between mirror / drop copies.
 */
export function checkOverlaps(
  doc: PatternDoc,
  opts: { gapCm?: number } = {},
): Overlap[] {
  const gap = opts.gapCm ?? 0;
  const tile = straightRepeatSize(doc.repeat);
  const motifs = new Map(doc.motifs.map((m) => [m.id, m]));

  const copies = doc.placements.flatMap((p, index) => {
    const motif = motifs.get(p.motifId);
    if (!motif)
      throw new Error(`placement references unknown motif: ${p.motifId}`);
    const r = boundingRadius(motif, p.scale ?? 1);
    return unitCopies(p, doc.repeat).map((c) => ({ x: c.x, y: c.y, r, index }));
  });

  const worst = new Map<string, Overlap>();
  for (let i = 0; i < copies.length; i++) {
    for (let j = i + 1; j < copies.length; j++) {
      const ci = copies[i] as (typeof copies)[number];
      const cj = copies[j] as (typeof copies)[number];
      const distanceCm = wrappedDistance(ci, cj, tile);
      const requiredCm = ci.r + cj.r + gap;
      if (distanceCm >= requiredCm) continue;

      const a = Math.min(ci.index, cj.index);
      const b = Math.max(ci.index, cj.index);
      const key = `${a}:${b}`;
      const prev = worst.get(key);
      if (!prev || distanceCm < prev.distanceCm)
        worst.set(key, { a, b, distanceCm, requiredCm });
    }
  }
  return [...worst.values()].sort((x, y) => x.a - y.a || x.b - y.b);
}

// ---------------------------------------------------------------------------
// Combined
// ---------------------------------------------------------------------------

export interface PatternReport {
  seams: SeamReport;
  coverage: CoverageReport;
  overlaps: Overlap[];
}

export function checkPattern(
  doc: PatternDoc,
  tile: RenderedTile,
  opts: {
    seams?: SeamCheckOptions;
    coverage?: CoverageCheckOptions;
    gapCm?: number;
  } = {},
): PatternReport {
  return {
    seams: checkSeams(tile, opts.seams),
    coverage: checkCoverage(tile, opts.coverage),
    overlaps: checkOverlaps(
      doc,
      opts.gapCm !== undefined ? { gapCm: opts.gapCm } : {},
    ),
  };
}
