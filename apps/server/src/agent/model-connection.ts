import type { ServerEnv } from "../config/env.js";

/** Resolve credentials per model instance. Never rewrite global API credentials. */
export function resolveChatConnection(specifier: string, env: Pick<ServerEnv,
  "openAIApiKey" | "openAIApiBase" | "dashscopeApiKey" | "dashscopeApiBase"
>) {
  const colon = specifier.indexOf(":");
  const provider = colon > 0 ? specifier.slice(0, colon) : "openai";
  const model = colon > 0 ? specifier.slice(colon + 1) : specifier;
  // Preserve already-saved workspace/client selections from the old single-provider setup.
  const dashscope = provider === "dashscope" || (provider === "openai" && /^qwen/i.test(model) && !!env.dashscopeApiKey);
  const apiKey = dashscope ? env.dashscopeApiKey : env.openAIApiKey;
  const baseURL = dashscope
    ? env.dashscopeApiBase ?? "https://dashscope.aliyuncs.com/compatible-mode/v1"
    : env.openAIApiBase ?? "https://api.openai.com/v1";
  if (!apiKey) throw new Error(`${dashscope ? "DASHSCOPE_API_KEY" : "OPENAI_API_KEY"} is not configured.`);
  return { model, apiKey, baseURL, provider: dashscope ? "dashscope" : "openai" };
}
