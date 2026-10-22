import { describe, expect, it } from "vitest";
import { resolveChatConnection } from "./model-connection.js";

describe("separate chat provider credentials", () => {
  const env = { openAIApiKey: "openai-test", openAIApiBase: "https://api.openai.com/v1", dashscopeApiKey: "qwen-test", dashscopeApiBase: "https://dashscope.aliyuncs.com/compatible-mode/v1" };
  it("keeps OpenAI and Qwen connections isolated", () => {
    expect(resolveChatConnection("dashscope:qwen3-vl-plus", env)).toMatchObject({ apiKey: "qwen-test", provider: "dashscope", baseURL: env.dashscopeApiBase });
    expect(resolveChatConnection("openai:gpt-4.1-mini", env)).toMatchObject({ apiKey: "openai-test", provider: "openai", baseURL: env.openAIApiBase });
  });
  it("supports existing Qwen selections saved with the old openai prefix", () => {
    expect(resolveChatConnection("openai:qwen3-vl-plus", env).apiKey).toBe("qwen-test");
  });
  it("never falls back to an inherited credential or mutates the process environment", () => {
    const previous = process.env.OPENAI_API_KEY;
    resolveChatConnection("dashscope:qwen3-vl-plus", env);
    expect(process.env.OPENAI_API_KEY).toBe(previous);
    expect(() => resolveChatConnection("dashscope:qwen3-vl-plus", {})).toThrow("DASHSCOPE_API_KEY");
    expect(() => resolveChatConnection("openai:gpt-4.1-mini", {})).toThrow("OPENAI_API_KEY");
  });
});
