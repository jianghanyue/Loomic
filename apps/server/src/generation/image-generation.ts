import type { GeneratedImage, ImageGenerateParams } from "./types.js";
import { getImageProvider } from "./providers/registry.js";
import { normalizeImageOutputOptions } from "./image-output.js";

export async function generateImage(
  providerName: string,
  params: ImageGenerateParams,
): Promise<GeneratedImage> {
  const provider = getImageProvider(providerName);
  const model = provider.models.find((candidate) => candidate.id === params.model);
  const output = model ? normalizeImageOutputOptions(model, params) : {};
  return provider.generate({ ...params, ...output });
}
