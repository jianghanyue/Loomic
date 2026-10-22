import test from "node:test";
import assert from "node:assert/strict";
import { applyLocalEnv } from "../scripts/local-env-values.mjs";

test("saved local provider credentials override inherited values independently", () => {
  const inherited = { OPENAI_API_KEY: "inherited-wrong", DASHSCOPE_API_KEY: "other-wrong", KEEP: "untouched" };
  applyLocalEnv('OPENAI_API_KEY="local-openai"\nDASHSCOPE_API_KEY="local-qwen"\nEMPTY=\n', inherited);
  assert.equal(inherited.OPENAI_API_KEY, "local-openai");
  assert.equal(inherited.DASHSCOPE_API_KEY, "local-qwen");
  assert.equal(inherited.KEEP, "untouched");
  assert.equal(inherited.EMPTY, "");
});
