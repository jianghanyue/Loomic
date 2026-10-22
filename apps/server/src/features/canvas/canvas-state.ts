// Read-modify-write access to a canvas row for agent tools and HTTP routes
// that change canvas content directly (patterns, image operations).

import sharp from "sharp";

import {
  type CanvasElement,
  createElementBase,
  generateId,
} from "../../agent/tools/canvas-element-helpers.js";

type CanvasFiles = Record<string, Record<string, unknown>>;

export type CanvasState = {
  content: Record<string, unknown>;
  elements: CanvasElement[];
  files: CanvasFiles;
};

export type CanvasClient = {
  from: (table: string) => any;
  storage: { from: (bucket: string) => any };
};

/** Error with a stable code that tools return to the model. */
export class CanvasError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const OSS_MARKER_PREFIX = "oss://";

export async function loadCanvas(
  client: CanvasClient,
  canvasId: string,
): Promise<CanvasState> {
  const { data, error } = await client
    .from("canvases")
    .select("content")
    .eq("id", canvasId)
    .single();
  if (error || !data)
    throw new CanvasError(
      "canvas_not_found",
      "Canvas not found or access denied.",
    );
  const content = (data.content ?? {}) as Record<string, unknown>;
  return {
    content,
    elements: (content.elements as CanvasElement[] | undefined) ?? [],
    files: (content.files as CanvasFiles | undefined) ?? {},
  };
}

export async function saveCanvasState(
  client: CanvasClient,
  canvasId: string,
  state: CanvasState,
) {
  const { error } = await client
    .from("canvases")
    .update({
      content: {
        ...state.content,
        elements: state.elements,
        files: state.files,
      },
    })
    .eq("id", canvasId);
  if (error)
    throw new CanvasError(
      "write_failed",
      `Failed to save canvas: ${error.message}`,
    );
}

export function decodeDataUrl(dataURL: string): Buffer {
  const comma = dataURL.indexOf(",");
  return Buffer.from(dataURL.slice(comma + 1), "base64");
}

/** Bytes of a canvas image element, whether inline or offloaded to Storage. */
export async function readCanvasImage(
  client: CanvasClient,
  state: CanvasState,
  elementId: string,
): Promise<{ element: CanvasElement; buffer: Buffer }> {
  const element = state.elements.find(
    (e) => e.id === elementId && !e.isDeleted && e.type === "image",
  );
  const file = element ? state.files[element.fileId as string] : undefined;
  const dataURL = file?.dataURL as string | undefined;
  if (!element || !dataURL)
    throw new CanvasError(
      "image_not_found",
      `No image element ${elementId} on this canvas.`,
    );
  if (dataURL.startsWith("data:"))
    return { element, buffer: decodeDataUrl(dataURL) };
  if (dataURL.startsWith(OSS_MARKER_PREFIX)) {
    const ref = dataURL.slice(OSS_MARKER_PREFIX.length);
    const slash = ref.indexOf("/");
    const { data, error } = await client.storage
      .from(ref.slice(0, slash))
      .download(ref.slice(slash + 1));
    if (error || !data)
      throw new CanvasError(
        "image_fetch_failed",
        `Could not load canvas image ${elementId}.`,
      );
    return { element, buffer: Buffer.from(await data.arrayBuffer()) };
  }
  throw new CanvasError(
    "image_fetch_failed",
    `Canvas image ${elementId} has an unsupported file reference.`,
  );
}

export type NewCanvasImage = {
  buffer: Buffer;
  title: string;
  customData?: Record<string, unknown>;
  /** Embed an SVG as-is instead of re-encoding to WebP. */
  svg?: { width: number; height: number };
};

/** Long side cap for images embedded in canvas content (base64 in JSON). */
export const CANVAS_IMAGE_MAX_PX = 2048;
const GAP = 40;

/**
 * Add images in a row to the right of `anchor`, each displayed at the anchor's
 * height. Images are downscaled to CANVAS_IMAGE_MAX_PX and stored as WebP
 * (lossless when they have transparency).
 */
export async function insertImagesBeside(
  state: CanvasState,
  anchor: CanvasElement,
  images: NewCanvasImage[],
): Promise<CanvasElement[]> {
  const displayHeight = Number(anchor.height) || 400;
  let x = (Number(anchor.x) || 0) + (Number(anchor.width) || 0) + GAP;
  const y = Number(anchor.y) || 0;
  const created: CanvasElement[] = [];

  for (const image of images) {
    const { data, info, mimeType } = image.svg
      ? { data: image.buffer, info: image.svg, mimeType: "image/svg+xml" }
      : { ...(await encodeForCanvas(image.buffer)), mimeType: "image/webp" };
    const fileId = generateId();
    state.files[fileId] = {
      id: fileId,
      dataURL: `data:${mimeType};base64,${data.toString("base64")}`,
      mimeType,
      created: Date.now(),
    };
    const width = Math.round((displayHeight * info.width) / info.height);
    // Repeated edits must not cover a previous result beside the same source.
    let blocker: CanvasElement | undefined;
    while ((blocker = state.elements.find((other) =>
      !other.isDeleted && Number(other.width) > 0 && Number(other.height) > 0 &&
      x < Number(other.x) + Number(other.width) + GAP && x + width + GAP > Number(other.x) &&
      y < Number(other.y) + Number(other.height) && y + displayHeight > Number(other.y)
    ))) {
      x = Number(blocker.x) + Number(blocker.width) + GAP;
    }
    const element: CanvasElement = {
      ...createElementBase(),
      type: "image",
      x,
      y,
      width,
      height: displayHeight,
      fileId,
      status: "saved",
      scale: [1, 1],
      crop: null,
      boundElements: null,
      customData: {
        title: image.title,
        source: "generated",
        ...image.customData,
      },
    };
    state.elements.push(element);
    created.push(element);
    x += width + GAP;
  }
  return created;
}

async function encodeForCanvas(buffer: Buffer) {
  const img = sharp(buffer, { limitInputPixels: false });
  const meta = await img.metadata();
  return img
    .resize({
      width: CANVAS_IMAGE_MAX_PX,
      height: CANVAS_IMAGE_MAX_PX,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp(meta.hasAlpha ? { lossless: true } : { quality: 90 })
    .toBuffer({ resolveWithObject: true });
}
