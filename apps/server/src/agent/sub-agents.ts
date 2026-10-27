import type { SubAgent } from "deepagents";

import type { ComfyClient } from "../generation/comfyui/client.js";
import type { SubmitImageJobFn } from "./tools/image-generate.js";
import { createImageGenerateTool } from "./tools/image-generate.js";
import { createImageOpTools } from "./tools/image-ops.js";
import { createPatternTools } from "./tools/pattern.js";
import { createVideoGenerateTool } from "./tools/video-generate.js";

/**
 * The textile specialist is deliberately isolated from the general agent.
 * It gets the two bundled textile skills plus the canvas-aware pattern tools,
 * so a handoff can go from a brief to a checked repeat without copying the
 * full Loomic system prompt into the specialist context.
 */
export function createTextileSubAgent(options: {
  createUserClient: (accessToken: string) => unknown;
  comfy?: ComfyClient;
  persistImage?: (
    sourceUrl: string,
    mimeType: string,
    prompt: string,
  ) => Promise<string>;
  submitImageJob?: SubmitImageJobFn;
}): SubAgent {
  const textileToolDeps = {
    createUserClient: options.createUserClient,
    ...(options.comfy ? { comfy: options.comfy } : {}),
  };

  return {
    name: "textile_design",
    description:
      "Design jacquard, brocade and home-textile repeats; generate model-adapted prompts, make canvas patterns, run seam checks and export checked swatches.",
    systemPrompt: `You are Loomic's textile design specialist.

Read and follow /skills/jacquard-textile-prompt/SKILL.md for jacquard, brocade, damask, yunjin and woven-swatch requests. Read /skills/home-textile-pattern/SKILL.md for printed home-textile repeats, transparent motifs, layout and export requests. When the user asks for source-backed prompt research, read /skills/jacquard-textile-prompt/references/prompt-catalog.md and keep source URL, source model and evidence level attached to each adaptation.

Keep concept imagery separate from CAD or mill handoff. Use create_pattern → layout_pattern → check_pattern, and only call export_pattern after the check passes. Never invent loom capacity, density, float limits or yarn specifications; state them as CAD/mill confirmation items. When the user asks for an image, use generate_image with the model available in the tool schema and preserve the requested reference-image roles. Return a compact bilingual brief, assumptions, prompt/model adapter, validation result and provenance.`,
    skills: [
      "/skills/jacquard-textile-prompt/",
      "/skills/home-textile-pattern/",
    ],
    tools: [
      createImageGenerateTool({
        ...(options.persistImage ? { persistImage: options.persistImage } : {}),
        ...(options.submitImageJob
          ? { submitImageJob: options.submitImageJob }
          : {}),
      }),
      ...createPatternTools(textileToolDeps),
      ...createImageOpTools(textileToolDeps),
    ],
  };
}

export function createVideoSubAgent(): SubAgent {
  return {
    name: "video_generate",
    description:
      "Generate a video based on a creative description. Video generation availability depends on provider configuration.",
    systemPrompt: `You are a video generation specialist. Given a description, generate a video using the generate_video tool and return the result.

If video generation is not available or fails, clearly explain the limitation.`,
    tools: [createVideoGenerateTool()],
  };
}
