import { describe, expect, it, vi } from "vitest";
import {
  createImageGenerateTool,
  runImageGenerate,
  type SubmitImageJobFn,
} from "./image-generate.js";
import type { AvailableModel } from "../../generation/providers/registry.js";
import {
  imageExtension,
  imageOutputJobFields,
  normalizeImageOutputOptions,
} from "../../generation/image-output.js";
import {
  createImageJobRequestSchema,
  imageGenerationPayloadSchema,
} from "@loomic/shared";

const model: AvailableModel = {
  id: "openai-official/gpt-image-2.5-flare",
  displayName: "Flare",
  description: "Test",
  provider: "openai",
  outputFormats: ["png", "jpg", "webp"],
  supportsTransparentBackground: true,
};
const input = { title: "Cutout", prompt: "An isolated leaf", model: model.id };

describe("Agent image output contract", () => {
  it.each(["png", "jpg", "webp"] as const)(
    "keeps %s and background through Agent submission and shared job schemas",
    async (outputFormat) => {
      const submit = vi
        .fn<SubmitImageJobFn>()
        .mockResolvedValue({
          jobId: "test",
          imageUrl: "https://example.test/image",
          mimeType:
            outputFormat === "jpg" ? "image/jpeg" : `image/${outputFormat}`,
        });
      const result = await runImageGenerate(
        { ...input, outputFormat, background: "opaque" },
        undefined,
        submit,
        undefined,
        [model],
      );
      expect(result.error).toBeUndefined();
      expect(submit).toHaveBeenCalledWith(
        expect.objectContaining({ outputFormat, background: "opaque" }),
      );
      const fields = imageOutputJobFields(submit.mock.calls[0]![0]);
      for (const schema of [
        createImageJobRequestSchema,
        imageGenerationPayloadSchema,
      ]) {
        expect(schema.parse({ prompt: input.prompt, ...fields })).toMatchObject(
          { output_format: outputFormat, background: "opaque" },
        );
      }
    },
  );

  it("defaults transparent output to PNG, and exposes both knobs to the dialogue model", async () => {
    const submit = vi
      .fn<SubmitImageJobFn>()
      .mockResolvedValue({ jobId: "test", mimeType: "image/png" });
    const tool = createImageGenerateTool({
      availableModels: [model],
      submitImageJob: submit,
    });
    await tool.invoke({ ...input, background: "transparent" });
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        background: "transparent",
        outputFormat: "png",
      }),
    );
    expect(tool.schema.shape.model.description).toContain(
      "Native transparency: yes",
    );
    expect(tool.schema.shape.outputFormat).toBeDefined();
    expect(tool.schema.shape.background).toBeDefined();
  });

  it("does not enqueue/bill an incompatible request, or substitute its model", async () => {
    const submit = vi.fn<SubmitImageJobFn>();
    const conflict = await runImageGenerate(
      { ...input, background: "transparent", outputFormat: "jpg" },
      undefined,
      submit,
      undefined,
      [model],
    );
    const unsupported = await runImageGenerate(
      { ...input, background: "transparent" },
      undefined,
      submit,
      undefined,
      [{ ...model, supportsTransparentBackground: false }],
    );
    expect(conflict.error).toContain("JPG");
    expect(unsupported.error).toContain("no model is substituted");
    expect(submit).not.toHaveBeenCalled();
  });

  it("preserves old defaults and never equates PNG with transparency", () => {
    expect(normalizeImageOutputOptions(model, {})).toEqual({});
    expect(normalizeImageOutputOptions(model, { outputFormat: "png" })).toEqual(
      { outputFormat: "png" },
    );
    expect(
      normalizeImageOutputOptions(model, {
        background: "transparent",
        outputFormat: "webp",
      }),
    ).toEqual({ background: "transparent", outputFormat: "webp" });
    expect(
      ["image/png", "image/jpeg", "image/webp"].map(imageExtension),
    ).toEqual(["png", "jpg", "webp"]);
    expect(() =>
      createImageJobRequestSchema.parse({
        prompt: "test",
        output_format: "gif",
      }),
    ).toThrow();
  });
});
