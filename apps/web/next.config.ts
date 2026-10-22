import type { NextConfig } from "next";
import { cpSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// Excalidraw otherwise fetches scene fonts from esm.sh at runtime. Serve the
// installed version's assets locally in both `next dev` and the static export.
const resolveWebDependency = createRequire(join(process.cwd(), "package.json"));
cpSync(
  join(dirname(resolveWebDependency.resolve("@excalidraw/excalidraw")), "fonts"),
  join(process.cwd(), "public", "excalidraw", "fonts"),
  { recursive: true },
);

const nextConfig: NextConfig = {
  output: "export",
  typescript: {
    ignoreBuildErrors: true,
  },
  env: {
    NEXT_PUBLIC_SERVER_BASE_URL: process.env.NEXT_PUBLIC_SERVER_BASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
};

export default nextConfig;
