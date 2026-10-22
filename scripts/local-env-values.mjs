import { parseEnv } from "node:util";

/** Apply explicit project values without changing persistent Windows environment settings. */
export function applyLocalEnv(text, target) {
  Object.assign(target, parseEnv(text));
}
