import { app } from "electron";

export type DesktopRuntimeConfig = {
  apiBaseUrl: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  authRedirectUrl: string;
  appVersion: string;
  platform: NodeJS.Platform;
};

function normalizeBaseUrl(value: string | undefined): string {
  const normalized = value?.trim().replace(/\/$/, "");
  return normalized || "http://localhost:3001";
}

export function getRuntimeConfig(): DesktopRuntimeConfig {
  return {
    apiBaseUrl: normalizeBaseUrl(
      process.env.LOOMIC_DESKTOP_API_URL ??
        process.env.NEXT_PUBLIC_SERVER_BASE_URL,
    ),
    ...(process.env.NEXT_PUBLIC_SUPABASE_URL
      ? { supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL }
      : {}),
    ...(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ? { supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY }
      : {}),
    authRedirectUrl: "loomic://auth/callback",
    appVersion: app.getVersion(),
    platform: process.platform,
  };
}
