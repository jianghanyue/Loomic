import { describe, expect, it } from "vitest";
import { createStreamingChatModel } from "./deep-agent.js";
import { loadServerEnv } from "../config/env.js";

describe("GPT-6.1 Sol agent routing", () => {
  it("keeps the requested exact model and uses Responses for tool calling", () => {
    const env = loadServerEnv({}, { OPENAI_API_KEY: "test-key", OPENAI_API_BASE: "https://api.openai.com/v1" });
    const model = createStreamingChatModel("openai:gpt-6.1-sol", env) as any;
    expect(model.model).toBe("gpt-6.1-sol");
    expect(model.useResponsesApi).toBe(true);
    expect(model.reasoning).toMatchObject({ effort: "low" });
    expect(model.temperature).toBeUndefined();
  });
});
