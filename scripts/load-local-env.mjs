// Explicit local startup: the user's saved project configuration wins over
// environment variables inherited from the application launching Node.
import { readFileSync } from "node:fs";
import { applyLocalEnv } from "./local-env-values.mjs";

applyLocalEnv(readFileSync(new URL("../.env.local", import.meta.url), "utf8"), process.env);
