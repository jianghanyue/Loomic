import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { MemorySaver } from "@langchain/langgraph";
import { createAgent } from "langchain";
import { describe, expect, it } from "vitest";
import { imageMessageBlock, imageMessageMiddleware, normalizeImageMessages } from "./image-messages.js";

describe("agent image message format", () => {
  it.each(["data:image/png;base64,aGVsbG8=", "https://example.test/image.png"])("wraps %s in the required image_url object", (url) => {
    expect(imageMessageBlock(url)).toEqual({ type: "image_url", image_url: { url } });
  });

  it("repairs legacy checkpoint images without mutating history or losing metadata", () => {
    const message = new HumanMessage({ id: "old-message", name: "user", additional_kwargs: { marker: "kept" },
      content: [{ type: "text", text: "look" }, { type: "image_url", image_url: "data:image/png;base64,abc" }] });
    const [normalized] = normalizeImageMessages([message]);
    expect(normalized).toBeInstanceOf(HumanMessage);
    expect(normalized).not.toBe(message);
    expect(normalized?.id).toBe(message.id);
    expect(normalized?.name).toBe(message.name);
    expect(normalized?.additional_kwargs).toEqual(message.additional_kwargs);
    expect(normalized?.content).toEqual([{ type: "text", text: "look" }, imageMessageBlock("data:image/png;base64,abc")]);
    expect(message.content).toEqual([{ type: "text", text: "look" }, { type: "image_url", image_url: "data:image/png;base64,abc" }]);
  });

  it("preserves already-valid blocks, detail and non-image messages", () => {
    const messages = [new HumanMessage("plain"), new AIMessage("answer"),
      new ToolMessage({ content: "result", tool_call_id: "tool-id" }),
      new HumanMessage({ content: [{ type: "image_url", image_url: { url: "https://example.test/a.png", detail: "low" } }] })];
    expect(normalizeImageMessages(messages).every((m, i) => m === messages[i])).toBe(true);
  });

  it("sends valid Chat Completions payloads for legacy history and later text-only turns", async () => {
    const requests: any[] = [];
    const model = new ChatOpenAI({ model: "gpt-4.1-mini", apiKey: "test-only", maxRetries: 0,
      configuration: { baseURL: "https://mock.invalid/v1", fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        requests.push(body);
        for (const message of body.messages) {
          if (Array.isArray(message.content)) for (const block of message.content) {
            if (block.type === "image_url") expect(block.image_url).toEqual(expect.objectContaining({ url: expect.any(String) }));
          }
        }
        return new Response(JSON.stringify({ id: "chat-test", object: "chat.completion", created: 1,
          model: "gpt-4.1-mini", choices: [{ index: 0, message: { role: "assistant", content: "I see the image." }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }), { headers: { "Content-Type": "application/json" } });
      } } });
    const agent = createAgent({ model, tools: [], middleware: [imageMessageMiddleware], checkpointer: new MemorySaver() });
    const config = { configurable: { thread_id: "legacy-image-test" } };
    await agent.updateState(config, { messages: [new HumanMessage({ id: "legacy", content: [
      { type: "text", text: "old image" }, { type: "image_url", image_url: "data:image/png;base64,aGVsbG8=" },
    ] })] });
    await agent.invoke({ messages: [new HumanMessage("can you see it?")] }, config);
    await agent.invoke({ messages: [new HumanMessage("what about now?")] }, config);
    expect(requests).toHaveLength(2);
    expect(requests[1].messages.some((m: any) => Array.isArray(m.content) && m.content.some((b: any) => b.type === "image_url"))).toBe(true);
    // Middleware must not rewrite old saved conversation content.
    const state = await agent.getState(config) as { values: { messages: HumanMessage[] } };
    const legacy = state.values.messages.find((m: any) => m.id === "legacy");
    expect(legacy?.content).toEqual([
      { type: "text", text: "old image" }, { type: "image_url", image_url: "data:image/png;base64,aGVsbG8=" },
    ]);
  });
});
