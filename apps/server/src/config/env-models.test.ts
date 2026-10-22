import { describe, expect, it } from "vitest";
import { loadServerEnv } from "./env.js";

describe("temporary Qwen disable", () => {
  it("removes Qwen even when a saved or inherited credential exists", () => {
    const source = { LOOMIC_ENABLE_DASHSCOPE: "false", DASHSCOPE_API_KEY: "saved-qwen-key",
      OPENAI_API_KEY: "openai-key", LOOMIC_AGENT_MODEL: "openai:gpt-6.1-sol", OPENAI_AGENT_MODEL: "gpt-6.1-sol" };
    const env = loadServerEnv({}, source);
    expect(env.dashscopeApiKey).toBeUndefined();
    expect(env.agentModel).toBe("openai:gpt-6.1-sol");
    expect(env.openAIAgentModel).toBe("gpt-6.1-sol");
    expect(env.openAIApiKey).toBe("openai-key");
    expect(source.DASHSCOPE_API_KEY).toBe("saved-qwen-key");
  });
  it("keeps Qwen usable if explicitly enabled again", () => {
    expect(loadServerEnv({}, { LOOMIC_ENABLE_DASHSCOPE: "true", DASHSCOPE_API_KEY: "saved-qwen-key" }).dashscopeApiKey).toBe("saved-qwen-key");
  });
});
