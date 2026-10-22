import { describe, expect, it } from "vitest";
import { operationWorkflows } from "./operation-workflows.js";

describe("installed local image-op profile", () => {
  const wf = operationWorkflows({ opsProfile: "layerstyle", editModel: "flux2-klein-9b" });
  it("uses installed BiRefNet nodes and no VITMatte auto-download", () => {
    const { graph } = wf.cutout("cup.png");
    expect(graph.model?.class_type).toBe("LayerMask: LoadBiRefNetModel");
    expect(graph.cutout?.inputs.process_detail).toBe(false);
    expect(graph.save?.inputs.images).toEqual(["cutout", 0]);
  });
  it("uses the local LaMa bridge with a non-inverted alpha mask", () => {
    const { graph } = wf.erase("cup.png", "erase.png");
    expect(graph.mask?.inputs).toEqual({ image: "erase.png", channel: "alpha" });
    expect(graph.erase?.class_type).toBe("LoomicLaMaErase");
    expect(graph.erase?.inputs).toEqual({ image: ["scale", 0], mask: ["mask", 0] });
    expect(graph.scale?.inputs.largest_size).toBe(512);
    expect(graph.compose?.inputs).toMatchObject({ destination: ["image", 0], source: ["restore", 0], mask: ["mask", 0] });
  });
  it("uses the actual nested UltraSharp path and a 640px FP8 layer graph", () => {
    const upscale = wf.upscale("x", 100, 80, 2).graph;
    expect(upscale["2"]?.inputs.model_name).toBe("4x-UltraSharp\\4x-UltraSharp.pth");
    const layers = wf.layers("x", 4, "cup").graph;
    expect(Object.values(layers).find(n => n.class_type === "UNETLoader")?.inputs.unet_name).toContain("fp8mixed");
    expect(Object.values(layers).find(n => n.class_type === "ImageScaleToMaxDimension")?.inputs.largest_size).toBe(640);
    expect(Object.values(layers).find(n => n.class_type === "KSampler")?.inputs).toMatchObject({ steps: 50, cfg: 4 });
    expect(Object.values(layers).some(n => n.class_type === "VAEEncode")).toBe(true);
  });
});
