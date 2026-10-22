import type { ImageBackground, ModelInfo, OutputFormat } from "./types.js";

export interface ImageOutputOptions {
  outputFormat?: OutputFormat;
  background?: ImageBackground;
}

export class ImageOutputOptionsError extends Error {
  readonly code = "invalid_image_options";
  readonly statusCode = 400;
}

/** Validate before queueing/billing, not just inside a provider. */
export function normalizeImageOutputOptions(
  model: ModelInfo,
  options: ImageOutputOptions,
): ImageOutputOptions {
  const { background } = options;
  const outputFormat =
    options.outputFormat ?? (background === "transparent" ? "png" : undefined);
  if (background && !["auto", "opaque", "transparent"].includes(background)) {
    throw new ImageOutputOptionsError(
      "background must be auto, opaque, or transparent.",
    );
  }
  if (outputFormat && !["png", "jpg", "webp"].includes(outputFormat)) {
    throw new ImageOutputOptionsError(
      "outputFormat must be png, jpg, or webp.",
    );
  }
  if (background === "transparent") {
    if (!model.supportsTransparentBackground) {
      throw new ImageOutputOptionsError(
        `${model.id} does not advertise native transparent backgrounds. Choose a GPT Image 2.5 model instead; no model is substituted automatically.`,
      );
    }
    if (outputFormat === "jpg") {
      throw new ImageOutputOptionsError(
        "JPG cannot contain transparency. Use outputFormat=png or webp with background=transparent.",
      );
    }
  }
  if (
    outputFormat &&
    model.outputFormats &&
    !model.outputFormats.includes(outputFormat)
  ) {
    throw new ImageOutputOptionsError(
      `${model.id} does not support ${outputFormat} output.`,
    );
  }
  return {
    ...(outputFormat ? { outputFormat } : {}),
    ...(background ? { background } : {}),
  };
}

/** Same mapping for Agent jobs, REST jobs, and their worker. */
export function imageOutputJobFields(options: ImageOutputOptions) {
  return {
    ...(options.outputFormat ? { output_format: options.outputFormat } : {}),
    ...(options.background ? { background: options.background } : {}),
  };
}

export function imageExtension(mimeType: string): string {
  switch (mimeType.split(";")[0]) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/png":
      return "png";
    default:
      throw new Error(`Unsupported generated image MIME type: ${mimeType}`);
  }
}
