import { contextBridge, ipcRenderer } from "electron";

import type { DesktopRuntimeConfig } from "./runtime-config";

export type AuthCallbackPayload = {
  url: string;
};

export type DesktopFilePickerOptions = {
  multiple?: boolean;
  accept?: string[];
};

export type DesktopFilePayload = {
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
};

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

const runtimeConfig = ipcRenderer.sendSync(
  "desktop:get-runtime-config",
) as DesktopRuntimeConfig;
const authListeners = new Set<(payload: AuthCallbackPayload) => void>();
const pendingAuthCallbacks: AuthCallbackPayload[] = [];
const updateListeners = new Set<(status: DesktopUpdateStatus) => void>();
const pendingUpdateStatuses: DesktopUpdateStatus[] = [];

ipcRenderer.on("desktop:auth-callback", (_event, payload: unknown) => {
  if (
    !payload ||
    typeof payload !== "object" ||
    typeof (payload as { url?: unknown }).url !== "string"
  ) {
    return;
  }

  const callback = payload as AuthCallbackPayload;
  if (authListeners.size === 0) {
    pendingAuthCallbacks.push(callback);
    return;
  }

  for (const listener of authListeners) listener(callback);
});

ipcRenderer.on(
  "desktop:update-status",
  (_event, status: DesktopUpdateStatus) => {
    if (updateListeners.size === 0) {
      pendingUpdateStatuses.push(status);
      return;
    }
    for (const listener of updateListeners) listener(status);
  },
);

const api: DesktopApi = {
  isDesktop: true,
  runtimeConfig,
  openExternal: (url) => ipcRenderer.invoke("desktop:open-external", url),
  onAuthCallback: (listener) => {
    authListeners.add(listener);
    for (const callback of pendingAuthCallbacks.splice(0)) listener(callback);
    return () => authListeners.delete(listener);
  },
  openFiles: (options) => ipcRenderer.invoke("desktop:open-files", options),
  saveDataUrl: (dataUrl, suggestedName) =>
    ipcRenderer.invoke("desktop:save-data-url", { dataUrl, suggestedName }),
  saveUrl: (url, suggestedName) =>
    ipcRenderer.invoke("desktop:save-url", { url, suggestedName }),
  checkForUpdates: () => ipcRenderer.invoke("desktop:check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("desktop:download-update"),
  installUpdate: () => ipcRenderer.invoke("desktop:install-update"),
  onUpdateStatus: (listener) => {
    updateListeners.add(listener);
    for (const status of pendingUpdateStatuses.splice(0)) listener(status);
    return () => updateListeners.delete(listener);
  },
};

contextBridge.exposeInMainWorld("loomicDesktop", api);
