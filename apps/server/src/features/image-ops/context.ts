import { resolveWorkspaceId } from "../../agent/workspace-skills.js";
import type { ServerEnv } from "../../config/env.js";
import {
  type ComfyClient,
  createComfyClient,
} from "../../generation/comfyui/client.js";
import type { CanvasClient } from "../canvas/canvas-state.js";
import type { ImageOpContext } from "./image-ops.js";

const ASSETS_BUCKET = "project-assets";

/** One shared client per server process; undefined when ComfyUI isn't set up. */
let shared: { key: string; client: ComfyClient } | undefined;

export function comfyFromEnv(
  env: Pick<ServerEnv, "comfyuiBaseUrl" | "comfyuiTimeoutMs">,
): ComfyClient | undefined {
  if (!env.comfyuiBaseUrl) return undefined;
  const key = `${env.comfyuiBaseUrl}|${env.comfyuiTimeoutMs ?? ""}`;
  if (shared?.key !== key) {
    shared = {
      key,
      client: createComfyClient({
        baseUrl: env.comfyuiBaseUrl,
        ...(env.comfyuiTimeoutMs ? { timeoutMs: env.comfyuiTimeoutMs } : {}),
      }),
    };
  }
  return shared.client;
}

export function createImageOpContext(opts: {
  client: CanvasClient;
  canvasId: string;
  comfy?: ComfyClient | undefined;
}): ImageOpContext {
  return {
    client: opts.client,
    canvasId: opts.canvasId,
    comfy: opts.comfy,
    // Full-size results go to the workspace's asset folder (first path
    // segment must be the workspace id for storage RLS).
    storeOriginal: async (buffer, name) => {
      const workspaceId = await resolveWorkspaceId(
        opts.client as any,
        opts.canvasId,
      );
      if (!workspaceId) return undefined;
      const path = `${workspaceId}/edits/${Date.now()}-${name}`;
      const bucket = opts.client.storage.from(ASSETS_BUCKET);
      const { error } = await bucket.upload(path, buffer, {
        contentType: "image/png",
        upsert: false,
      });
      if (error) return undefined;
      return bucket.getPublicUrl(path).data?.publicUrl as string | undefined;
    },
  };
}
