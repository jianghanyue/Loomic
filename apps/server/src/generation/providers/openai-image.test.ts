import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OpenAIImageProvider } from "./openai-image.js";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  edit: vi.fn(),
}));

vi.mock("openai", async (importOriginal) => {
  const original = await importOriginal<typeof import("openai")>();
  return {
    ...original,
    default: class {
      images = { generate: mocks.generate, edit: mocks.edit };
    },
  };
});

describe("OpenAIImageProvider", () => {
  beforeEach(() => {
    mocks.generate.mockReset();
    mocks.edit.mockReset();
  });

  it("exposes the three direct OpenAI models and returns decodable image data", async () => {
    const png = await sharp({
      create: { width: 32, height: 24, channels: 4, background: "red" },
    })
      .png()
      .toBuffer();
    mocks.generate.mockResolvedValue({
      data: [{ b64_json: png.toString("base64") }],
    });

    const provider = new OpenAIImageProvider("test-key");
    expect(provider.models.map((model) => model.id)).toEqual([
      "openai-official/gpt-image-2.5-sunburst",
      "openai-official/gpt-image-2.5-flare",
      "openai-official/gpt-image-2",
    ]);

    const result = await provider.generate({
      model: "openai-official/gpt-image-2.5-flare",
      prompt: "A red square",
      aspectRatio: "16:9",
      quality: "ultra",
    });
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-image-2.5-flare",
        size: "3840x2160",
        quality: "high",
        output_format: "png",
      }),
    );
    expect(result).toEqual({
      url: `data:image/png;base64,${png.toString("base64")}`,
      mimeType: "image/png",
      width: 32,
      height: 24,
    });
  });

  it("uses the edits endpoint when reference images are supplied", async () => {
    const png = await sharp({
      create: { width: 16, height: 16, channels: 4, background: "blue" },
    })
      .png()
      .toBuffer();
    mocks.edit.mockResolvedValue({
      data: [{ b64_json: png.toString("base64") }],
    });

    const provider = new OpenAIImageProvider("test-key");
    await provider.generate({
      model: "openai-official/gpt-image-2",
      prompt: "Make it blue",
      quality: "standard",
      inputImages: [`data:image/png;base64,${png.toString("base64")}`],
    });

    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-image-2",
        quality: "low",
        size: "1024x1024",
        image: [
          expect.objectContaining({
            name: "reference-0.png",
            type: "image/png",
          }),
        ],
      }),
    );
  });

  it("generates with the requested Image 2 model rather than a newer sibling", async () => {
    const png = await sharp({ create: { width: 32, height: 32, channels: 4, background: "blue" } }).png().toBuffer();
    mocks.generate.mockResolvedValue({ data: [{ b64_json: png.toString("base64") }] });
    const provider = new OpenAIImageProvider("test-key");
    await provider.generate({ model: "openai-official/gpt-image-2", prompt: "A blue mug", quality: "standard", aspectRatio: "1:1" });
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-image-2", size: "1024x1024", quality: "low", n: 1 }));
    expect(mocks.edit).not.toHaveBeenCalled();
  });

  it.each(["gpt-image-2.5-sunburst", "gpt-image-2.5-flare"])("generates with the exact %s model", async (model) => {
    const png = await sharp({ create: { width: 32, height: 32, channels: 4, background: "orange" } }).png().toBuffer();
    mocks.generate.mockResolvedValue({ data: [{ b64_json: png.toString("base64") }] });
    const provider = new OpenAIImageProvider("test-key");
    const result = await provider.generate({ model: `openai-official/${model}`, prompt: "An orange mug", quality: "standard", aspectRatio: "1:1" });
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ model, size: "1024x1024", quality: "low", n: 1, output_format: "png" }));
    expect(mocks.edit).not.toHaveBeenCalled();
    expect(result.width).toBe(32);
    expect(result.height).toBe(32);
  });

  it.each(["gpt-image-2.5-sunburst", "gpt-image-2.5-flare"])("uses multipart multi-image edits for %s", async (model) => {
    const png = await sharp({ create: { width: 16, height: 16, channels: 4, background: "green" } }).png().toBuffer();
    mocks.edit.mockResolvedValue({ data: [{ b64_json: png.toString("base64") }] });
    const provider = new OpenAIImageProvider("test-key");
    const image = `data:image/png;base64,${png.toString("base64")}`;
    await provider.generate({ model: `openai-official/${model}`, prompt: "Use both references", quality: "hd", inputImages: [image, image] });
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.edit).toHaveBeenCalledWith(expect.objectContaining({ model, size: "2048x2048", quality: "medium",
      image: [expect.objectContaining({ name: "reference-0.png", type: "image/png" }), expect.objectContaining({ name: "reference-1.png", type: "image/png" })],
    }));
  });

  it("rejects an unknown model before calling OpenAI", async () => {
    const provider = new OpenAIImageProvider("test-key");
    await expect(
      provider.generate({ model: "openai-official/other", prompt: "test" }),
    ).rejects.toMatchObject({ code: "model_not_found" });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it.each(["gpt-image-2.5-sunburst", "gpt-image-2.5-flare"])("preserves actual PNG alpha for generation and edits with %s", async (model) => {
    const png = await sharp({ create: { width: 16, height: 16, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.4 } } }).png().toBuffer();
    const response = { data: [{ b64_json: png.toString("base64") }] };
    mocks.generate.mockResolvedValue(response);
    mocks.edit.mockResolvedValue(response);
    const provider = new OpenAIImageProvider("test-key");
    const params = { model: `openai-official/${model}`, prompt: "A transparent cutout", background: "transparent" as const };
    const generated = await provider.generate(params);
    const edited = await provider.generate({ ...params, inputImages: [generated.url] });
    for (const mock of [mocks.generate, mocks.edit]) {
      expect(mock).toHaveBeenCalledWith(expect.objectContaining({ background: "transparent", output_format: "png" }));
    }
    expect(edited.mimeType).toBe("image/png");
    expect(edited.url).toBe(generated.url);
    expect((await sharp(Buffer.from(edited.url.split(",")[1]!, "base64")).stats()).channels[3]!.min).toBeLessThan(255);
  });

  it.each(["png", "jpg", "webp"] as const)("returns the actual MIME type for opaque %s output", async (outputFormat) => {
    const format = outputFormat === "jpg" ? "jpeg" : outputFormat;
    const buffer = await sharp({ create: { width: 16, height: 16, channels: 3, background: "green" } }).toFormat(format).toBuffer();
    mocks.generate.mockResolvedValue({ data: [{ b64_json: buffer.toString("base64") }] });
    const result = await new OpenAIImageProvider("test-key").generate({ model: "openai-official/gpt-image-2.5-flare", prompt: "A green square", outputFormat, background: "opaque" });
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ output_format: format, background: "opaque" }));
    expect(result.mimeType).toBe(`image/${format}`);
    expect(result.url).toBe(`data:image/${format};base64,${buffer.toString("base64")}`);
  });

  it("allows transparent WebP through the edit endpoint", async () => {
    const webp = await sharp({ create: { width: 16, height: 16, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 0.5 } } }).webp().toBuffer();
    mocks.edit.mockResolvedValue({ data: [{ b64_json: webp.toString("base64") }] });
    const result = await new OpenAIImageProvider("test-key").generate({ model: "openai-official/gpt-image-2.5-sunburst", prompt: "Preserve alpha", outputFormat: "webp", background: "transparent", inputImages: [`data:image/webp;base64,${webp.toString("base64")}`] });
    expect(result.mimeType).toBe("image/webp");
    expect(mocks.edit).toHaveBeenCalledWith(expect.objectContaining({ output_format: "webp", background: "transparent" }));
  });

  it("rejects conflicting/unsupported transparency before any paid call", async () => {
    const provider = new OpenAIImageProvider("test-key");
    await expect(provider.generate({ model: "openai-official/gpt-image-2.5-flare", prompt: "cutout", background: "transparent", outputFormat: "jpg" })).rejects.toMatchObject({ code: "invalid_image_options" });
    await expect(provider.generate({ model: "openai-official/gpt-image-2", prompt: "cutout", background: "transparent" })).rejects.toMatchObject({ code: "invalid_image_options" });
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.edit).not.toHaveBeenCalled();
  });

  it("rejects opaque pixels or mismatched file bytes instead of claiming transparency", async () => {
    const opaque = await sharp({ create: { width: 16, height: 16, channels: 4, background: "white" } }).png().toBuffer();
    mocks.generate.mockResolvedValue({ data: [{ b64_json: opaque.toString("base64") }] });
    const provider = new OpenAIImageProvider("test-key");
    await expect(provider.generate({ model: "openai-official/gpt-image-2.5-flare", prompt: "cutout", background: "transparent" })).rejects.toMatchObject({ code: "transparency_missing" });
    await expect(provider.generate({ model: "openai-official/gpt-image-2.5-flare", prompt: "photo", outputFormat: "jpg" })).rejects.toMatchObject({ code: "invalid_output_format" });
  });
});
