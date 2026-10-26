import { getDesktopRuntimeConfig } from "./desktop";

const defaultServerBaseUrl = "http://localhost:3001";

export function getServerBaseUrl(source: NodeJS.ProcessEnv = process.env) {
  const desktopUrl = getDesktopRuntimeConfig()?.apiBaseUrl?.trim();
  if (desktopUrl) return desktopUrl.replace(/\/$/, "");

  // Must access process.env.NEXT_PUBLIC_* directly — webpack DefinePlugin
  // only replaces direct references, not indirect access via a variable.
  const configuredUrl = source.NEXT_PUBLIC_SERVER_BASE_URL?.trim();
  return configuredUrl || defaultServerBaseUrl;
}

export type WebEnv = {
  serverBaseUrl: string;
  supabaseAnonKey: string;
  supabaseUrl: string;
};

export function loadWebEnv(
  overrides: Partial<WebEnv> = {},
  source: NodeJS.ProcessEnv = process.env,
): WebEnv {
  return {
    serverBaseUrl: overrides.serverBaseUrl ?? getServerBaseUrl(source),
    supabaseUrl:
      overrides.supabaseUrl ??
      requireEnv("NEXT_PUBLIC_SUPABASE_URL", source.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKey:
      overrides.supabaseAnonKey ??
      requireEnv(
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        source.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      ),
  };
}

function requireEnv(name: string, value: string | undefined) {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    throw new Error(`Missing required browser env: ${name}`);
  }

  return normalizedValue;
}
