export type DesktopRuntimeConfig = {
  apiBaseUrl: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  authRedirectUrl: string;
  appVersion: string;
  platform: string;
};

type AuthCallbackPayload = { url: string };

export type DesktopUpdateStatus = {
  state:
    | "disabled"
    | "checking"
    | "available"
    | "not-available"
    | "downloading"
    | "downloaded"
    | "error";
  version?: string;
  percent?: number;
  message?: string;
};

export type DesktopFilePickerOptions = {
  multiple?: boolean;
  accept?: string[];
};

type DesktopFilePayload = {
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
};

type DesktopApi = {
  isDesktop: true;
  runtimeConfig: DesktopRuntimeConfig;
  openExternal: (url: string) => Promise<void>;
  onAuthCallback: (
    listener: (payload: AuthCallbackPayload) => void,
  ) => () => void;
  openFiles: (
    options?: DesktopFilePickerOptions,
  ) => Promise<DesktopFilePayload[]>;
  saveDataUrl: (
    dataUrl: string,
    suggestedName: string,
  ) => Promise<{ canceled: boolean; filePath?: string }>;
  saveUrl: (
    url: string,
    suggestedName: string,
  ) => Promise<{ canceled: boolean; filePath?: string }>;
  checkForUpdates: () => Promise<DesktopUpdateStatus>;
  downloadUpdate: () => Promise<DesktopUpdateStatus>;
  installUpdate: () => Promise<void>;
  onUpdateStatus: (
    listener: (status: DesktopUpdateStatus) => void,
  ) => () => void;
};

declare global {
  interface Window {
    loomicDesktop?: DesktopApi;
  }
}

export function getDesktopRuntimeConfig(): DesktopRuntimeConfig | null {
  if (typeof window === "undefined") return null;
  return window.loomicDesktop?.runtimeConfig ?? null;
}

export function isDesktop(): boolean {
  return getDesktopRuntimeConfig() !== null;
}

function dataUrlToFile(payload: DesktopFilePayload): File {
  const [, encoded = ""] = payload.dataUrl.split(",", 2);
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], payload.name, {
    type: payload.mimeType,
    lastModified: Date.now(),
  });
}

export async function pickFiles(
  options: DesktopFilePickerOptions = {},
): Promise<File[] | null> {
  const desktop =
    typeof window === "undefined" ? undefined : window.loomicDesktop;
  if (!desktop) return null;
  const payloads = await desktop.openFiles(options);
  return payloads.map(dataUrlToFile);
}

export async function saveDataUrl(
  dataUrl: string,
  suggestedName: string,
): Promise<boolean> {
  const desktop =
    typeof window === "undefined" ? undefined : window.loomicDesktop;
  if (!desktop) return false;
  const result = await desktop.saveDataUrl(dataUrl, suggestedName);
  return !result.canceled;
}

export async function saveUrl(
  url: string,
  suggestedName: string,
): Promise<boolean> {
  const desktop =
    typeof window === "undefined" ? undefined : window.loomicDesktop;
  if (!desktop) return false;
  if (url.startsWith("data:")) {
    const result = await desktop.saveDataUrl(url, suggestedName);
    return !result.canceled;
  }
  const result = await desktop.saveUrl(url, suggestedName);
  return !result.canceled;
}

export function subscribeToUpdateStatus(
  listener: (status: DesktopUpdateStatus) => void,
): (() => void) | null {
  const desktop =
    typeof window === "undefined" ? undefined : window.loomicDesktop;
  if (!desktop) return null;
  return desktop.onUpdateStatus(listener);
}

export function getAuthRedirectUrl(): string {
  return (
    getDesktopRuntimeConfig()?.authRedirectUrl ??
    `${window.location.origin}/auth/callback`
  );
}

export async function openExternal(url: string): Promise<void> {
  const desktop =
    typeof window === "undefined" ? undefined : window.loomicDesktop;
  if (desktop) {
    await desktop.openExternal(url);
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

export function subscribeToAuthCallback(
  listener: (url: string) => void,
): (() => void) | null {
  const desktop =
    typeof window === "undefined" ? undefined : window.loomicDesktop;
  if (!desktop) return null;
  return desktop.onAuthCallback(({ url }) => listener(url));
}
