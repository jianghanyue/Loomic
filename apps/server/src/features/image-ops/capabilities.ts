import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { ComfyClient, PromptGraph } from "../../generation/comfyui/client.js";
import { operationWorkflows } from "../../generation/comfyui/operation-workflows.js";
import type { ImageOpName } from "./image-ops.js";

type Detail = { available: boolean; backend: string; reason?: string };
export type ImageOpCapabilities = {
  comfyui: boolean;
  ops: Record<ImageOpName, boolean>;
  details: Record<ImageOpName, Detail>;
};

export async function imageOpCapabilities(comfy?: ComfyClient): Promise<ImageOpCapabilities> {
  const details: Record<ImageOpName, Detail> = {
    remove_background: { available: !comfy, backend: comfy ? "BiRefNet" : "纯色背景抠图" },
    upscale_image: { available: !comfy, backend: comfy ? "4x-UltraSharp" : "Lanczos 缩放（无新增细节）" },
    split_layers: { available: false, backend: "Qwen-Image-Layered" },
    erase_region: { available: false, backend: "LaMa" },
    edit_image: { available: false, backend: comfy?.editModel === "flux2-klein-9b" ? "FLUX.2 Klein 9B" : "Qwen-Image-Edit" },
    vectorize_image: { available: true, backend: "本地 ImageTracer → SVG（无需模型）" },
  };
  if (!comfy) {
    for (const d of Object.values(details)) if (!d.available) d.reason = "未配置 ComfyUI";
  } else {
    try {
      if (!comfy.getObjectInfo) throw new Error("ComfyUI 未提供节点清单");
      const info = await comfy.getObjectInfo();
      const wf = operationWorkflows(comfy);
      const graphs: Partial<Record<ImageOpName, PromptGraph>> = {
        remove_background: wf.cutout("input.png").graph,
        upscale_image: wf.upscale("input.png", 512, 512, 2).graph,
        split_layers: wf.layers("input.png", 4, "").graph,
        erase_region: wf.erase("input.png", "mask.png").graph,
        edit_image: wf.edit("input.png", "edit").graph,
      };
      for (const [name, graph] of Object.entries(graphs)) {
        const detail = details[name as ImageOpName];
        const missing = new Set<string>();
        for (const node of Object.values(graph)) {
          const nodeInfo = info[node.class_type];
          if (!nodeInfo) { missing.add(`节点 ${node.class_type}`); continue; }
          for (const key of ["unet_name", "clip_name", "vae_name", "model_name", "bg_removal_name", "model"]) {
            const value = node.inputs[key];
            if (typeof value !== "string") continue;
            const spec = nodeInfo.input?.required?.[key];
            const choices: unknown = Array.isArray(spec?.[0]) ? spec[0] : spec?.[1]?.options;
            if (Array.isArray(choices) && !choices.includes(value)) missing.add(`模型 ${value}`);
          }
        }
        if (comfy.opsProfile === "layerstyle") {
          const files = name === "remove_background"
            ? ["BiRefNet/pth/BiRefNet-general-local-cache.pth"]
            : name === "erase_region" ? ["lama/big-lama.pt"] : [];
          for (const file of files) {
            const ready = comfy.modelsDir && await stat(join(comfy.modelsDir, file)).then(s => s.isFile() && s.size > 0).catch(() => false);
            if (!ready) missing.add(`模型文件 ${file}`);
          }
        }
        detail.available = missing.size === 0;
        if (missing.size) detail.reason = `缺少${[...missing].join("、")}`;
      }
    } catch (error) {
      for (const [op, d] of Object.entries(details)) {
        if (op !== "vectorize_image") { d.available = false; d.reason = `ComfyUI 不可用：${error instanceof Error ? error.message : String(error)}`; }
      }
    }
  }
  return { comfyui: Boolean(comfy), ops: Object.fromEntries(Object.entries(details).map(([op, d]) => [op, d.available])) as Record<ImageOpName, boolean>, details };
}
