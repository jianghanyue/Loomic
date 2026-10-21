// Pattern documents live on the canvas: each pattern is an image element whose
// customData carries the pattern doc and whose file is a repeat preview.
// No extra table yet — see docs in the contra repo for the planned `patterns` table.

import {
  type PatternDoc,
  type PatternReport,
  type Placement,
  type RepeatSpec,
  checkPattern,
  renderRepeatPreview,
  renderTile,
  straightRepeatSize,
} from "@loomic/textile";
import sharp from "sharp";

import {
  type CanvasElement,
  bumpVersion,
  createElementBase,
  generateId,
} from "../../agent/tools/canvas-element-helpers.js";
import { calculateAutoPlacement } from "../canvas/canvas-element-writer.js";
import {
  CanvasError,
  type CanvasClient,
  type CanvasState,
  decodeDataUrl,
  loadCanvas,
  readCanvasImage,
  saveCanvasState,
} from "../canvas/canvas-state.js";
import {
  getBuiltinMotif,
  isBuiltinSource,
  renderBuiltinMotif,
} from "./motif-library.js";

export const PATTERN_ELEMENT_KIND = "pattern";

export type PatternMotifSpec = {
  id: string;
  /** `builtin:<name>`, `element:<canvas image element id>`, an http(s) URL or a data URL. */
  source: string;
  colors?: string[];
  widthCm: number;
  heightCm?: number;
};

export type StoredPattern = {
  version: 1;
  name: string;
  repeat: RepeatSpec;
  ground: string | null;
  motifs: PatternMotifSpec[];
  placements: Placement[];
};

const PREVIEW_TILE_PX = 512;
const PREVIEW_DISPLAY_WIDTH = 560;
const CHECK_MAX_DPI = 72;

/** Pattern tools report canvas and pattern problems with the same error type. */
export const PatternError = CanvasError;
export type { CanvasClient, CanvasState };
export { loadCanvas, saveCanvasState };

export function findPatternElement(
  state: CanvasState,
  patternId: string,
): CanvasElement {
  const el = state.elements.find((e) => e.id === patternId && !e.isDeleted);
  const data = el?.customData as { kind?: string } | undefined;
  if (!el || data?.kind !== PATTERN_ELEMENT_KIND) {
    throw new PatternError(
      "pattern_not_found",
      `No pattern with id ${patternId} on this canvas.`,
    );
  }
  return el;
}

export function readPattern(el: CanvasElement): StoredPattern {
  return (el.customData as { pattern: StoredPattern }).pattern;
}

// ---------------------------------------------------------------------------
// Motif sources
// ---------------------------------------------------------------------------

export async function resolveMotifSource(
  spec: PatternMotifSpec,
  ctx: { client: CanvasClient; state: CanvasState },
): Promise<Buffer> {
  const { source } = spec;
  if (isBuiltinSource(source)) return renderBuiltinMotif(source, spec.colors);
  if (source.startsWith("data:")) return decodeDataUrl(source);
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const res = await fetch(source);
    if (!res.ok)
      throw new PatternError(
        "motif_fetch_failed",
        `Could not fetch motif ${spec.id}: HTTP ${res.status}`,
      );
    return Buffer.from(await res.arrayBuffer());
  }
  if (source.startsWith("element:")) {
    const elementId = source.slice("element:".length);
    try {
      return (await readCanvasImage(ctx.client, ctx.state, elementId)).buffer;
    } catch {
      throw new PatternError(
        "motif_not_found",
        `Canvas image ${elementId} not found for motif ${spec.id}.`,
      );
    }
  }
  throw new PatternError(
    "invalid_motif_source",
    `Unsupported motif source for ${spec.id}: ${source.slice(0, 60)}`,
  );
}


/** Fill in heightCm from the motif's aspect ratio so overlap checks are accurate. */
export async function measureMotif(
  spec: PatternMotifSpec,
  src: Buffer,
): Promise<PatternMotifSpec> {
  if (spec.heightCm) return spec;
  let aspect = 1;
  if (isBuiltinSource(spec.source)) {
    aspect = getBuiltinMotif(spec.source).aspect;
  } else {
    const meta = await sharp(src).metadata();
    if (meta.width && meta.height) aspect = meta.height / meta.width;
  }
  return { ...spec, heightCm: Math.round(spec.widthCm * aspect * 100) / 100 };
}

/** Resolve every motif source into bytes for @loomic/textile. */
export async function toTextileDoc(
  pattern: StoredPattern,
  ctx: { client: CanvasClient; state: CanvasState },
): Promise<PatternDoc> {
  const motifs = await Promise.all(
    pattern.motifs.map(async (m) => ({
      id: m.id,
      src: await resolveMotifSource(m, ctx),
      widthCm: m.widthCm,
      ...(m.heightCm ? { heightCm: m.heightCm } : {}),
    })),
  );
  return {
    repeat: pattern.repeat,
    ground: pattern.ground,
    motifs,
    placements: pattern.placements,
  };
}

// ---------------------------------------------------------------------------
// Preview + checks
// ---------------------------------------------------------------------------

export type PatternPreview = {
  buffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
};

/** 2×2 repeat preview, rendered at roughly PREVIEW_TILE_PX per straight tile. */
export async function renderPatternPreview(
  doc: PatternDoc,
): Promise<PatternPreview> {
  const tileCm = straightRepeatSize(doc.repeat);
  const dpi = Math.min(
    doc.repeat.dpi,
    (PREVIEW_TILE_PX * 2.54) / tileCm.widthCm,
  );
  const tile = await renderTile(doc, { dpi });
  const png = await renderRepeatPreview(tile, {
    cols: 2,
    rows: 2,
    maxWidth: PREVIEW_TILE_PX * 2,
  });
  const img = sharp(png);
  const meta = await img.metadata();
  const buffer =
    doc.ground === null ? png : await img.jpeg({ quality: 88 }).toBuffer();
  return {
    buffer,
    mimeType: doc.ground === null ? "image/png" : "image/jpeg",
    width: meta.width ?? PREVIEW_TILE_PX * 2,
    height: meta.height ?? PREVIEW_TILE_PX * 2,
  };
}

export async function checkPatternDoc(
  doc: PatternDoc,
  gapCm?: number,
): Promise<PatternReport> {
  const tile = await renderTile(doc, {
    dpi: Math.min(doc.repeat.dpi, CHECK_MAX_DPI),
  });
  return checkPattern(doc, tile, gapCm !== undefined ? { gapCm } : {});
}

// ---------------------------------------------------------------------------
// Element upsert
// ---------------------------------------------------------------------------

/**
 * Create the pattern's preview element, or swap the preview of an existing one.
 * Keeps position and display width; height follows the new preview's aspect.
 */
export function upsertPatternElement(
  state: CanvasState,
  pattern: StoredPattern,
  preview: PatternPreview,
  existing?: CanvasElement,
): CanvasElement {
  const fileId = generateId();
  state.files[fileId] = {
    id: fileId,
    dataURL: `data:${preview.mimeType};base64,${preview.buffer.toString("base64")}`,
    mimeType: preview.mimeType,
    created: Date.now(),
  };
  const customData = {
    kind: PATTERN_ELEMENT_KIND,
    title: pattern.name,
    source: "generated",
    pattern,
  };

  if (existing) {
    const oldFileId = existing.fileId as string | undefined;
    if (oldFileId && oldFileId !== fileId) delete state.files[oldFileId];
    const width = Number(existing.width) || PREVIEW_DISPLAY_WIDTH;
    existing.fileId = fileId;
    existing.height = Math.round((width * preview.height) / preview.width);
    existing.customData = { ...(existing.customData as object), ...customData };
    existing.status = "saved";
    bumpVersion(existing);
    return existing;
  }

  const placement = calculateAutoPlacement(
    state.elements,
    PREVIEW_DISPLAY_WIDTH,
    Math.round((PREVIEW_DISPLAY_WIDTH * preview.height) / preview.width),
    PREVIEW_DISPLAY_WIDTH,
  );
  const element: CanvasElement = {
    ...createElementBase(),
    type: "image",
    ...placement,
    fileId,
    status: "saved",
    scale: [1, 1],
    crop: null,
    boundElements: null,
    customData,
  };
  state.elements.push(element);
  return element;
}

// ---------------------------------------------------------------------------
// Report formatting
// ---------------------------------------------------------------------------

export function summarizeReport(report: PatternReport, pattern: StoredPattern) {
  const { seams, coverage, overlaps } = report;
  const issues: string[] = [];
  if (!seams.seamless) issues.push("visible seam at the repeat edge");
  if (overlaps.length > 0)
    issues.push(`${overlaps.length} overlapping motif pair(s)`);
  if (coverage.emptyCells > 0)
    issues.push(
      `${coverage.emptyCells} empty area(s) of ${coverage.cells.length}`,
    );
  if (coverage.unevenness > 0.8) issues.push("uneven motif distribution");
  return {
    ok: issues.length === 0,
    issues,
    seamless: seams.seamless,
    seamDetail: {
      leftRight: round(
        seams.horizontal.wrapDiff /
          Math.max(seams.horizontal.typicalDiff, 1e-6),
      ),
      topBottom: round(
        seams.vertical.wrapDiff / Math.max(seams.vertical.typicalDiff, 1e-6),
      ),
    },
    coveragePercent: round(coverage.coverage * 100),
    unevenness: round(coverage.unevenness),
    emptyCells: coverage.emptyCells,
    overlaps: overlaps.slice(0, 10).map((o) => ({
      a: describePlacement(pattern, o.a),
      b: describePlacement(pattern, o.b),
      distanceCm: round(o.distanceCm),
      requiredCm: round(o.requiredCm),
    })),
  };
}

function describePlacement(pattern: StoredPattern, index: number): string {
  const p = pattern.placements[index];
  return p
    ? `#${index} ${p.motifId} @(${round(p.x)}, ${round(p.y)})cm`
    : `#${index}`;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
