import { HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { createMiddleware } from "langchain";

/** Chat Completions requires an object here; string shorthand is not portable. */
export function imageMessageBlock(url: string) {
  return { type: "image_url" as const, image_url: { url } };
}

/**
 * Old failed runs may already have string-form image blocks in their checkpoint.
 * Normalize the model request only, without editing or deleting saved history.
 */
export function normalizeImageMessages(messages: BaseMessage[]): BaseMessage[] {
  return messages.map((message) => {
    if (!HumanMessage.isInstance(message) || !Array.isArray(message.content)) return message;
    let changed = false;
    const content = message.content.map((block) => {
      if (block.type === "image_url" && typeof block.image_url === "string") {
        changed = true;
        return { ...block, image_url: { url: block.image_url } };
      }
      return block;
    });
    return changed ? new HumanMessage({ ...message, content }) : message;
  });
}

export const imageMessageMiddleware = createMiddleware({
  name: "NormalizeImageMessages",
  wrapModelCall: (request, handler) => handler({
    ...request,
    messages: normalizeImageMessages(request.messages),
  }),
});
