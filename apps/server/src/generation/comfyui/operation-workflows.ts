import type { ComfyClient } from "./client.js";
import { flux2EditGraph } from "./flux2-edit.js";
import { layerStyleCutoutGraph, layerStyleEraseGraph } from "./layerstyle.js";
import { cutoutGraph, editGraph, eraseGraph, layersGraph, upscaleGraph } from "./workflows.js";

/** One selection point shared by execution and dependency inspection. */
export function operationWorkflows(comfy: Pick<ComfyClient, "opsProfile" | "editModel">) {
  const local = comfy.opsProfile === "layerstyle";
  return {
    cutout: local ? layerStyleCutoutGraph : cutoutGraph,
    erase: local ? layerStyleEraseGraph : eraseGraph,
    edit: comfy.editModel === "flux2-klein-9b" ? flux2EditGraph : editGraph,
    upscale: (image: string, w: number, h: number, factor: number) => upscaleGraph(
      image, w, h, factor, local ? "4x-UltraSharp\\4x-UltraSharp.pth" : "4x-UltraSharp.pth",
    ),
    layers: (image: string, count: number, prompt: string) => layersGraph(image, count, prompt, local),
  };
}
