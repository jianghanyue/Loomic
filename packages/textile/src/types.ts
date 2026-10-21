/**
 * How the design unit repeats across the fabric.
 * - block:     straight / full repeat, unit tiles on a plain grid
 * - half_drop: every other column shifted down by half the unit height
 * - brick:     every other row shifted right by half the unit width (half-brick)
 * - mirror:    unit, horizontal mirror, vertical mirror and both, in a 2×2 block
 */
export type RepeatType = "block" | "half_drop" | "brick" | "mirror";

export interface RepeatSpec {
  type: RepeatType;
  /** Design unit size in centimetres. */
  widthCm: number;
  heightCm: number;
  /** Output resolution (dots per inch). Print files are typically 150–300. */
  dpi: number;
}

export interface Motif {
  id: string;
  /** Image with alpha (PNG/WebP/SVG): file path or encoded bytes. */
  src: string | Buffer;
  /** Physical width at scale 1, in centimetres. */
  widthCm: number;
  /** Physical height at scale 1. Defaults to widthCm (only used by checks). */
  heightCm?: number;
}

/** One motif instance. x/y is the motif centre inside the design unit, in cm. */
export interface Placement {
  motifId: string;
  x: number;
  y: number;
  /** Multiplier on the motif's physical size. Default 1. */
  scale?: number;
  /** Clockwise rotation in degrees. Default 0. */
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;
}

export interface PatternDoc {
  repeat: RepeatSpec;
  /** Ground (background) colour as #rgb / #rrggbb, or null for transparent. */
  ground: string | null;
  motifs: Motif[];
  /** Placements in design-unit coordinates; may extend past the unit edges. */
  placements: Placement[];
}

/** Raw RGBA raster of the straight repeat tile. */
export interface RenderedTile {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major, straight (non-premultiplied) alpha. */
  data: Buffer;
  /** Max motif alpha per pixel (0–255); 0 means ground only. */
  coverage: Uint8Array;
  dpi: number;
}
