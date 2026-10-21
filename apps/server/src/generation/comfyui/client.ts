// Minimal ComfyUI HTTP client: upload inputs, queue an API-format prompt,
// poll /history until the output node has images, download them.

export type PromptGraph = Record<
  string,
  {
    class_type: string;
    inputs: Record<string, unknown>;
    _meta?: { title?: string };
  }
>;

type ImageRef = { filename: string; subfolder?: string; type?: string };

export class ComfyError extends Error {
  constructor(
    readonly code:
      | "comfyui_unreachable"
      | "comfyui_rejected"
      | "comfyui_failed"
      | "comfyui_timeout",
    message: string,
  ) {
    super(message);
  }
}

export type ComfyClient = {
  /** Upload an input image; returns the value to put in a LoadImage node. */
  uploadImage(buffer: Buffer, name: string): Promise<string>;
  /** Queue `graph` and return the images produced by node `outputNode`. */
  run(graph: PromptGraph, outputNode: string): Promise<Buffer[]>;
};

export type ComfyClientOptions = {
  baseUrl: string;
  /** Overall wait per prompt. Default 5 minutes. */
  timeoutMs?: number;
  pollMs?: number;
  fetch?: typeof fetch;
};

export function createComfyClient(opts: ComfyClientOptions): ComfyClient {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const pollMs = opts.pollMs ?? 1000;
  const doFetch = opts.fetch ?? fetch;
  const clientId = `loomic-${Math.random().toString(36).slice(2)}`;

  async function request(path: string, init?: RequestInit) {
    try {
      return await doFetch(`${base}${path}`, init);
    } catch (err) {
      throw new ComfyError(
        "comfyui_unreachable",
        `ComfyUI at ${base} is unreachable: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    async uploadImage(buffer, name) {
      const body = new FormData();
      body.append("image", new Blob([new Uint8Array(buffer)]), name);
      body.append("subfolder", "loomic");
      body.append("type", "input");
      body.append("overwrite", "true");
      const res = await request("/upload/image", { method: "POST", body });
      if (!res.ok)
        throw new ComfyError(
          "comfyui_rejected",
          `ComfyUI upload failed: HTTP ${res.status}`,
        );
      const data = (await res.json()) as { name: string; subfolder?: string };
      const sub = data.subfolder ?? "loomic";
      return `${sub ? `${sub}/` : ""}${data.name} [input]`;
    },

    async run(graph, outputNode) {
      const res = await request("/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: graph, client_id: clientId }),
      });
      const body = (await res.json().catch(() => null)) as any;
      if (!res.ok || !body?.prompt_id)
        throw new ComfyError("comfyui_rejected", promptError(body, res.status));
      const promptId = String(body.prompt_id);

      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const hres = await request(`/history/${encodeURIComponent(promptId)}`);
        const hist = hres.ok
          ? ((await hres.json().catch(() => ({}))) as any)?.[promptId]
          : undefined;
        if (hist) {
          const messages: [string, any][] = hist.status?.messages ?? [];
          const err = messages.find((m) => m[0] === "execution_error");
          if (err)
            throw new ComfyError(
              "comfyui_failed",
              `ComfyUI execution failed: ${err[1]?.exception_message ?? "unknown error"}`,
            );
          const images: ImageRef[] = hist.outputs?.[outputNode]?.images ?? [];
          if (images.length > 0) return Promise.all(images.map(download));
          if (hist.status?.completed || hist.status?.status_str === "error")
            throw new ComfyError(
              "comfyui_failed",
              "ComfyUI finished without producing an image.",
            );
        }
        await new Promise((r) => setTimeout(r, pollMs));
      }
      throw new ComfyError(
        "comfyui_timeout",
        `ComfyUI did not finish within ${Math.round(timeoutMs / 1000)}s.`,
      );
    },
  };

  async function download(ref: ImageRef): Promise<Buffer> {
    const q = new URLSearchParams({
      filename: ref.filename,
      subfolder: ref.subfolder ?? "",
      type: ref.type ?? "output",
    });
    const res = await request(`/view?${q}`);
    if (!res.ok)
      throw new ComfyError(
        "comfyui_failed",
        `Could not download ${ref.filename}: HTTP ${res.status}`,
      );
    return Buffer.from(await res.arrayBuffer());
  }
}

function promptError(body: any, status: number): string {
  const lines = Object.entries<any>(body?.node_errors ?? {}).flatMap(
    ([id, ne]) =>
      (ne?.errors ?? []).map(
        (er: any) =>
          `${ne.class_type ?? ""} #${id}: ${er.message}${er.details ? ` — ${er.details}` : ""}`,
      ),
  );
  if (lines.length) return `ComfyUI rejected the workflow: ${lines.join("; ")}`;
  const top = body?.error;
  if (!top?.message) return `ComfyUI rejected the workflow: HTTP ${status}`;
  return `ComfyUI rejected the workflow: ${top.message}${top.details ? `: ${top.details}` : ""}`;
}
