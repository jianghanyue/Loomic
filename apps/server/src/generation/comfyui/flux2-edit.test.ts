import { describe, expect, it } from "vitest";
import { flux2EditGraph } from "./flux2-edit.js";

describe("local FLUX.2 Klein editing workflow", () => {
  it("conditions both branches on the actual source image and preserves the source aspect ratio", () => {
    const { graph, output } = flux2EditGraph("loomic/source.png [input]", "Change the mug to blue");
    expect(output).toBe("19");
    expect(graph["1"]?.inputs.image).toBe("loomic/source.png [input]");
    expect(graph["4"]?.inputs).toMatchObject({ clip_name: "qwen_3_8b_fp8mixed.safetensors", type: "flux2" });
    expect(graph["6"]?.inputs.text).toBe("Change the mug to blue");
    expect(graph["9"]?.inputs.latent).toEqual(["8", 0]);
    expect(graph["10"]?.inputs.latent).toEqual(["8", 0]);
    expect(graph["16"]?.inputs).toMatchObject({ steps: 4, width: ["11", 0], height: ["11", 1] });
    expect(graph["19"]?.inputs.filename_prefix).toMatch(/^loomic\/flux2-edit-/);
  });
  it("adds a separate second reference without replacing the original image", () => {
    const { graph } = flux2EditGraph("source.png", "Use this style", "style.png");
    expect(graph.ref?.inputs.image).toBe("style.png");
    expect(graph.refPositive?.inputs.conditioning).toEqual(["9", 0]);
    expect(graph["14"]?.inputs.positive).toEqual(["refPositive", 0]);
    expect(graph["1"]?.inputs.image).toBe("source.png");
  });
});
