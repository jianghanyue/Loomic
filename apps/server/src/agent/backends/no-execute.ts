import { CompositeBackend } from "deepagents";

/**
 * CompositeBackend that never advertises shell execution.
 *
 * deepagents@1.8.4 detects sandboxes with
 * `typeof backend.execute === "function" && typeof backend.id === "string"`.
 * CompositeBackend always has an execute() method and its `id` getter returns
 * "" for a non-sandbox default — still a string — so the `execute` tool and its
 * system prompt stay exposed and fail at call time. Shadowing `execute` with
 * undefined makes the check return false: the tool is filtered out of model
 * calls, and a hallucinated call gets a plain "Execution not available" result.
 */
export class NoExecuteCompositeBackend extends CompositeBackend {
  constructor(...args: ConstructorParameters<typeof CompositeBackend>) {
    super(...args);
    Object.defineProperty(this, "execute", { value: undefined });
  }
}
