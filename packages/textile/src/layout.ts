import type { Motif, PatternDoc, Placement, RepeatSpec } from "./types.js";

// ---------------------------------------------------------------------------
// Repeat geometry
// ---------------------------------------------------------------------------

/**
 * Size (cm) of the straight repeat tile: the smallest rectangle that tiles the
 * fabric by plain translation. This is what printers and textile CAD expect.
 */
export function straightRepeatSize(repeat: RepeatSpec): {
  widthCm: number;
  heightCm: number;
} {
  const { widthCm: w, heightCm: h } = repeat;
  switch (repeat.type) {
    case "block":
      return { widthCm: w, heightCm: h };
    case "half_drop":
      return { widthCm: 2 * w, heightCm: h };
    case "brick":
      return { widthCm: w, heightCm: 2 * h };
    case "mirror":
      return { widthCm: 2 * w, heightCm: 2 * h };
  }
}

/**
 * Copies of one unit placement inside the straight repeat tile. Together with
 * wrap-around compositing (modulo tile size) this reproduces the full repeat.
 *
 * Mirror copies toggle the flip flags and negate rotation, because a reflection
 * of "flip, then rotate by r" equals "flip again, then rotate by −r".
 */
export function unitCopies(p: Placement, repeat: RepeatSpec): Placement[] {
  const { widthCm: w, heightCm: h } = repeat;
  switch (repeat.type) {
    case "block":
      return [p];
    case "half_drop":
      return [p, { ...p, x: p.x + w, y: p.y + h / 2 }];
    case "brick":
      return [p, { ...p, x: p.x + w / 2, y: p.y + h }];
    case "mirror": {
      const r = p.rotation ?? 0;
      const fx = p.flipX ?? false;
      const fy = p.flipY ?? false;
      return [
        p,
        { ...p, x: 2 * w - p.x, rotation: -r, flipX: !fx },
        { ...p, y: 2 * h - p.y, rotation: -r, flipY: !fy },
        {
          ...p,
          x: 2 * w - p.x,
          y: 2 * h - p.y,
          rotation: r,
          flipX: !fx,
          flipY: !fy,
        },
      ];
    }
  }
}

/** All placements expanded into straight-repeat-tile coordinates (cm). */
export function expandPlacements(
  doc: Pick<PatternDoc, "repeat" | "placements">,
): Placement[] {
  return doc.placements.flatMap((p) => unitCopies(p, doc.repeat));
}

/** Centre distance on the torus of the straight tile (cm). */
export function wrappedDistance(
  a: { x: number; y: number },
  b: { x: number; y: number },
  tile: { widthCm: number; heightCm: number },
): number {
  const dx = wrapDelta(a.x - b.x, tile.widthCm);
  const dy = wrapDelta(a.y - b.y, tile.heightCm);
  return Math.hypot(dx, dy);
}

function wrapDelta(d: number, period: number): number {
  const m = ((d % period) + period) % period;
  return Math.min(m, period - m);
}

/** Radius (cm) of the circle bounding a placed motif at any rotation. */
export function boundingRadius(motif: Motif, scale = 1): number {
  const w = motif.widthCm * scale;
  const h = (motif.heightCm ?? motif.widthCm) * scale;
  return Math.hypot(w, h) / 2;
}

// ---------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------

/** mulberry32 — small, fast, deterministic PRNG returning [0, 1). */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lerp(range: readonly [number, number], t: number): number {
  return range[0] + (range[1] - range[0]) * t;
}

function pickWeighted<T>(
  items: readonly T[],
  weights: readonly number[] | undefined,
  r: number,
): T {
  if (!weights)
    return items[Math.min(items.length - 1, Math.floor(r * items.length))] as T;
  const total = weights.reduce((s, w) => s + w, 0);
  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    acc += (weights[i] ?? 0) / total;
    if (r < acc) return items[i] as T;
  }
  return items[items.length - 1] as T;
}

// ---------------------------------------------------------------------------
// Layout generators
// ---------------------------------------------------------------------------

export interface GridLayoutOptions {
  cols: number;
  rows: number;
  /** Motifs cycled across cells in reading order. */
  motifIds: string[];
  scale?: number;
  rotation?: number;
  /** Shift every other row by half a cell (diamond / drop arrangement). */
  stagger?: boolean;
  /** Random offset (cm) applied to each centre, up to ±jitterCm. */
  jitterCm?: number;
  seed?: number;
}

/** Regular grid of motifs inside the design unit. */
export function layoutGrid(
  repeat: RepeatSpec,
  opts: GridLayoutOptions,
): Placement[] {
  if (opts.cols < 1 || opts.rows < 1)
    throw new Error("cols and rows must be >= 1");
  if (opts.motifIds.length === 0) throw new Error("motifIds must not be empty");

  const rng = createRng(opts.seed ?? 1);
  const cellW = repeat.widthCm / opts.cols;
  const cellH = repeat.heightCm / opts.rows;
  const jitter = opts.jitterCm ?? 0;
  const placements: Placement[] = [];

  for (let row = 0; row < opts.rows; row++) {
    for (let col = 0; col < opts.cols; col++) {
      const shift = opts.stagger && row % 2 === 1 ? cellW / 2 : 0;
      const motifId = opts.motifIds[
        (row * opts.cols + col) % opts.motifIds.length
      ] as string;
      placements.push({
        motifId,
        x: (col + 0.5) * cellW + shift + (rng() * 2 - 1) * jitter,
        y: (row + 0.5) * cellH + (rng() * 2 - 1) * jitter,
        scale: opts.scale ?? 1,
        rotation: opts.rotation ?? 0,
      });
    }
  }
  return placements;
}

export interface TossedLayoutOptions {
  /** Target number of motifs inside the design unit. */
  count: number;
  /** Motifs to scatter; defaults to every motif in `motifs`. */
  motifIds?: string[];
  /** Relative frequency per entry of motifIds. */
  weights?: number[];
  scaleRange?: [number, number];
  /** Rotation range in degrees, e.g. [0, 360] for an all-over toss. */
  rotationRange?: [number, number];
  /** Randomly mirror motifs horizontally. */
  allowFlip?: boolean;
  /** Minimum clearance (cm) between bounding circles. Negative allows overlap. */
  gapCm?: number;
  seed?: number;
  /** Candidate draws per motif before giving up. Default 200. */
  maxAttemptsPerMotif?: number;
  /**
   * Placements already in the unit (e.g. main flowers when scattering fillers)
   * that new motifs must keep clear of. Their motifs must be in `motifs`.
   */
  avoid?: Placement[];
}

export interface TossedLayoutResult {
  placements: Placement[];
  requested: number;
  placed: number;
}

/**
 * Tossed (scattered) layout by dart throwing. Spacing is measured between all
 * copies in the straight repeat tile, with wrap-around, so motifs also keep
 * clear of their neighbours in the next repeat and of their own mirror images.
 * Stops early (placed < requested) when the unit is too full.
 */
export function layoutTossed(
  repeat: RepeatSpec,
  motifs: Motif[],
  opts: TossedLayoutOptions,
): TossedLayoutResult {
  const ids = opts.motifIds ?? motifs.map((m) => m.id);
  if (ids.length === 0) throw new Error("no motifs to scatter");
  const byId = new Map(motifs.map((m) => [m.id, m]));
  for (const id of ids)
    if (!byId.has(id)) throw new Error(`unknown motif: ${id}`);

  const rng = createRng(opts.seed ?? 1);
  const tile = straightRepeatSize(repeat);
  const gap = opts.gapCm ?? 0;
  const maxAttempts = opts.maxAttemptsPerMotif ?? 200;
  const scaleRange = opts.scaleRange ?? [1, 1];
  const rotationRange = opts.rotationRange ?? [0, 0];

  const placements: Placement[] = [];
  const occupied: { x: number; y: number; r: number }[] = [];
  for (const p of opts.avoid ?? []) {
    const motif = byId.get(p.motifId);
    if (!motif) throw new Error(`unknown motif in avoid: ${p.motifId}`);
    const r = boundingRadius(motif, p.scale ?? 1);
    for (const c of unitCopies(p, repeat)) occupied.push({ x: c.x, y: c.y, r });
  }

  for (let n = 0; n < opts.count; n++) {
    let accepted = false;
    for (let attempt = 0; attempt < maxAttempts && !accepted; attempt++) {
      const motifId = pickWeighted(ids, opts.weights, rng());
      const motif = byId.get(motifId) as Motif;
      const scale = lerp(scaleRange, rng());
      const candidate: Placement = {
        motifId,
        x: rng() * repeat.widthCm,
        y: rng() * repeat.heightCm,
        scale,
        rotation: lerp(rotationRange, rng()),
        ...(opts.allowFlip && rng() < 0.5 ? { flipX: true } : {}),
      };
      const r = boundingRadius(motif, scale);
      const copies = unitCopies(candidate, repeat);

      const clear = (
        c: Placement,
        others: { x: number; y: number; r: number }[],
      ) => others.every((o) => wrappedDistance(c, o, tile) >= r + o.r + gap);

      const selfCopies = copies.map((c) => ({ x: c.x, y: c.y, r }));
      const ok =
        copies.every((c) => clear(c, occupied)) &&
        copies.every((c, i) =>
          clear(
            c,
            selfCopies.filter((_, j) => j !== i),
          ),
        );
      if (!ok) continue;

      placements.push(candidate);
      occupied.push(...selfCopies);
      accepted = true;
    }
    if (!accepted) break;
  }

  return { placements, requested: opts.count, placed: placements.length };
}
