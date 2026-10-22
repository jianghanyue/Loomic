import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearProviders,
  registerImageProvider,
} from "../../../generation/providers/registry.js";
import type { ImageProvider } from "../../../generation/types.js";
import { getExecutor, type ExecutorContext } from "../job-executor.js";
import "./image-generation.js";

afterEach(clearProviders);

describe("image worker output persistence", () => {
  it.each(["png", "jpg", "webp"] as const)(
    "carries %s/background to the provider and keeps file bytes, MIME and extension aligned",
    async (outputFormat) => {
      const format = outputFormat === "jpg" ? "jpeg" : outputFormat;
      const background = outputFormat === "jpg" ? "opaque" : "transparent";
      const buffer = await sharp({
        create: {
          width: 16,
          height: 16,
          channels: 4,
          background: {
            r: 0,
            g: 255,
            b: 0,
            alpha: background === "transparent" ? 0.5 : 1,
          },
        },
      })
        .toFormat(format)
        .toBuffer();
      const mimeType = `image/${format}`;
      const generate = vi
        .fn<ImageProvider["generate"]>()
        .mockResolvedValue({
          url: `data:${mimeType};base64,${buffer.toString("base64")}`,
          mimeType,
          width: 16,
          height: 16,
        });
      registerImageProvider({
        name: "test",
        models: [
          {
            id: "test/image",
            displayName: "Test",
            description: "Test",
            outputFormats: ["png", "jpg", "webp"],
            supportsTransparentBackground: true,
          },
        ],
        generate,
      });
      const upload = vi.fn().mockResolvedValue({ error: null });
      const insert = vi.fn();
      const job = {
        workspace_id: "workspace",
        created_by: "user",
        payload: {
          prompt: "cutout",
          model: "test/image",
          output_format: outputFormat,
          background,
        },
      };
      const admin = {
        from(table: string) {
          const chain = {
            select: () => chain,
            eq: () => chain,
            insert: (record: unknown) => {
              insert(record);
              return chain;
            },
            single: async () => ({
              data: table === "background_jobs" ? job : { id: "asset" },
            }),
            maybeSingle: async () => ({ data: { plan: "ultra" } }),
          };
          return chain;
        },
        storage: {
          from: () => ({
            upload,
            createSignedUrl: async () => ({
              data: { signedUrl: "https://example.test/signed" },
            }),
          }),
        },
      };
      const result = await getExecutor("image_generation")!("job-1", {}, {
        getAdminClient: () => admin,
        renewVt: vi.fn(),
      } as unknown as ExecutorContext);
      expect(generate).toHaveBeenCalledWith(
        expect.objectContaining({ outputFormat, background }),
      );
      const [path, savedBuffer, options] = upload.mock.calls[0]!;
      expect(path).toMatch(new RegExp(`\\.${outputFormat}$`));
      expect(savedBuffer.equals(buffer)).toBe(true);
      expect(options.contentType).toBe(mimeType);
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({ object_path: path, mime_type: mimeType }),
      );
      expect(result).toMatchObject({ object_path: path, mime_type: mimeType });
      if (background === "transparent") {
        expect(
          (await sharp(savedBuffer).stats()).channels[3]!.min,
        ).toBeLessThan(255);
      }
    },
  );
});
