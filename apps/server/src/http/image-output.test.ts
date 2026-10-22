import Fastify from "fastify";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerGenerateRoutes } from "./generate.js";
import { registerJobRoutes } from "./jobs.js";
import {
  clearProviders,
  registerImageProvider,
} from "../generation/providers/registry.js";
import { applicationErrorResponseSchema } from "@loomic/shared";

afterEach(clearProviders);
const id = "00000000-0000-4000-8000-000000000001";
const modelId = "test/image";

async function setup() {
  const generate = vi.fn(async (input) => {
    const format =
      input.outputFormat === "jpg" ? "jpeg" : (input.outputFormat ?? "png");
    const buffer = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 4,
        background: {
          r: 255,
          g: 0,
          b: 0,
          alpha: input.background === "transparent" ? 0.5 : 1,
        },
      },
    })
      .toFormat(format)
      .toBuffer();
    return {
      url: `data:image/${format};base64,${buffer.toString("base64")}`,
      mimeType: `image/${format}`,
      width: 16,
      height: 16,
    };
  });
  registerImageProvider({
    name: "test",
    models: [
      {
        id: modelId,
        displayName: "Test",
        description: "Test",
        supportsTransparentBackground: true,
        outputFormats: ["png", "jpg", "webp"],
      },
    ],
    generate,
  });
  const uploadFile = vi
    .fn()
    .mockResolvedValue({ url: "https://example.test/signed", asset: { id } });
  const deductCredits = vi.fn();
  const createJob = vi.fn(async (_user, input) => ({
    id,
    workspace_id: id,
    project_id: null,
    canvas_id: null,
    session_id: null,
    thread_id: null,
    queue_name: "image_generation",
    job_type: "image_generation",
    status: "queued",
    payload: input.payload,
    result: null,
    error_code: null,
    error_message: null,
    attempt_count: 0,
    max_attempts: 3,
    created_by: id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    failed_at: null,
    canceled_at: null,
  }));
  const deps = {
    auth: { authenticate: async () => ({ id, accessToken: "test" }) },
    viewerService: { ensureViewer: async () => ({ workspace: { id } }) },
    uploadService: { uploadFile },
    creditService: {
      getSubscription: async () => ({ plan: "ultra" }),
      deductCredits,
    },
    tierGuard: {
      checkModelAccess: vi.fn(),
      checkResolution: vi.fn(),
      checkConcurrency: vi.fn(),
      calculateCreditCost: () => 0,
    },
    jobService: { createJob },
  };
  const app = Fastify();
  await registerGenerateRoutes(
    app,
    deps as unknown as Parameters<typeof registerGenerateRoutes>[1],
  );
  await registerJobRoutes(
    app,
    deps as unknown as Parameters<typeof registerJobRoutes>[1],
  );
  return { app, generate, uploadFile, deductCredits, createJob };
}

describe("image output HTTP contracts", () => {
  it.each(["png", "jpg", "webp"] as const)(
    "direct endpoint forwards %s/background and persists with matching extension",
    async (outputFormat) => {
      const { app, generate, uploadFile } = await setup();
      try {
        const response = await app.inject({
          method: "POST",
          url: "/api/agent/generate-image",
          payload: {
            model: modelId,
            prompt: "A leaf",
            outputFormat,
            background: "opaque",
          },
        });
        expect(response.statusCode).toBe(200);
        expect(generate).toHaveBeenCalledWith(
          expect.objectContaining({ outputFormat, background: "opaque" }),
        );
        expect(uploadFile.mock.calls[0]![1].fileName).toMatch(
          new RegExp(`\\.${outputFormat}$`),
        );
        expect(response.json().mimeType).toBe(
          outputFormat === "jpg" ? "image/jpeg" : `image/${outputFormat}`,
        );
      } finally {
        await app.close();
      }
    },
  );

  it("queued endpoint defaults transparent output to PNG and preserves edit references", async () => {
    const { app, createJob } = await setup();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/jobs/image-generation",
        payload: {
          model: modelId,
          prompt: "A transparent leaf",
          background: "transparent",
          input_images: ["https://example.test/leaf.png"],
        },
      });
      expect(response.statusCode).toBe(201);
      expect(createJob.mock.calls[0]![1].payload).toMatchObject({
        output_format: "png",
        background: "transparent",
        input_images: ["https://example.test/leaf.png"],
      });
    } finally {
      await app.close();
    }
  });

  it("both endpoints reject incompatible JPEG transparency before queueing or billing", async () => {
    const { app, createJob, deductCredits, generate } = await setup();
    try {
      for (const [url, formatKey] of [
        ["/api/agent/generate-image", "outputFormat"],
        ["/api/jobs/image-generation", "output_format"],
      ]) {
        const response = await app.inject({
          method: "POST",
          url: url!,
          payload: {
            model: modelId,
            prompt: "A leaf",
            background: "transparent",
            [formatKey!]: "jpg",
          },
        });
        expect(response.statusCode).toBe(400);
        expect(
          applicationErrorResponseSchema.parse(response.json()).error.code,
        ).toBe("invalid_image_options");
      }
      expect(createJob).not.toHaveBeenCalled();
      expect(generate).not.toHaveBeenCalled();
      expect(deductCredits).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
