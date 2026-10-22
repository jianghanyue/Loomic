import type { Built } from "./workflows.js";

/** Uses the already installed LayerStyle nodes, not ComfyArt-only node names. */
export function layerStyleCutoutGraph(image: string): Built {
  return { output: "save", graph: {
    image: { class_type: "LoadImage", inputs: { image } },
    model: { class_type: "LayerMask: LoadBiRefNetModel", inputs: { model: "BiRefNet-general-local-cache.pth" } },
    cutout: { class_type: "LayerMask: BiRefNetUltraV2", inputs: {
      image: ["image", 0], birefnet_model: ["model", 0], detail_method: "GuidedFilter",
      detail_erode: 4, detail_dilate: 2, black_point: 0.01, white_point: 0.99,
      process_detail: false, device: "cuda", max_megapixels: 2,
    } },
    save: { class_type: "SaveImage", inputs: { images: ["cutout", 0], filename_prefix: "loomic/cutout" } },
  } };
}

export function layerStyleEraseGraph(image: string, mask: string): Built {
  return { output: "save", graph: {
    image: { class_type: "LoadImage", inputs: { image } },
    mask: { class_type: "LoadImageMask", inputs: { image: mask, channel: "alpha" } },
    scale: { class_type: "ImageScaleToMaxDimension", inputs: { image: ["image", 0], upscale_method: "lanczos", largest_size: 512 } },
    size: { class_type: "GetImageSize", inputs: { image: ["image", 0] } },
    erase: { class_type: "LoomicLaMaErase", inputs: { image: ["scale", 0], mask: ["mask", 0] } },
    restore: { class_type: "ImageScale", inputs: { image: ["erase", 0], upscale_method: "lanczos", width: ["size", 0], height: ["size", 1], crop: "disabled" } },
    compose: { class_type: "ImageCompositeMasked", inputs: { destination: ["image", 0], source: ["restore", 0], mask: ["mask", 0], x: 0, y: 0, resize_source: false } },
    save: { class_type: "SaveImage", inputs: { images: ["compose", 0], filename_prefix: "loomic/erase" } },
  } };
}
