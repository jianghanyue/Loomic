import { promises as fs, existsSync, lstatSync } from "node:fs";
import {
  basename,
  extname,
  join,
  normalize,
  relative,
  resolve,
} from "node:path";
import {
  BrowserWindow,
  Menu,
  app,
  clipboard,
  dialog,
  ipcMain,
  protocol,
  session,
  shell,
} from "electron";
import { autoUpdater } from "electron-updater";

import { type DesktopRuntimeConfig, getRuntimeConfig } from "./runtime-config";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

const DESKTOP_ORIGIN = "app://loomic";
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["https:"]);
const ALLOWED_EXTERNAL_HOSTS = new Set([
  "app.lemonsqueezy.com",
  "accounts.google.com",
  "github.com",
  "supabase.co",
  "supabase.com",
]);

let mainWindow: BrowserWindow | null = null;
let pendingDeepLink: string | null = null;
let updaterEnabled = false;

const MAX_DESKTOP_FILE_BYTES = 100 * 1024 * 1024;
const MAX_DESKTOP_DOWNLOAD_BYTES = 512 * 1024 * 1024;

type DesktopFilePickerOptions = {
  multiple?: boolean;
  accept?: string[];
};

type DesktopFilePayload = {
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
};

type UpdateStatus = {
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

function rendererRoot(): string {
  const candidates = [
    resolve(__dirname, "../renderer"),
    resolve(__dirname, "../../web/out"),
    resolve(process.resourcesPath, "renderer"),
  ];
  const root = candidates.find((candidate) => existsSync(candidate));
  if (root) return root;
  throw new Error(
    `Static renderer output was not found. Checked: ${candidates.join(", ")}. Run pnpm --filter @loomic/desktop build:renderer first.`,
  );
}

function contentTypeFor(pathname: string): string {
  const extension = pathname.slice(pathname.lastIndexOf(".")).toLowerCase();
  const types: Record<string, string> = {
    ".css": "text/css; charset=utf-8",
    ".gif": "image/gif",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };
  return types[extension] ?? "application/octet-stream";
}

function mimeTypeForPath(filePath: string): string {
  const extension = extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".gif": "image/gif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webm": "video/webm",
    ".webp": "image/webp",
  };
  return mimeTypes[extension] ?? "application/octet-stream";
}

function normalizeFileExtensions(accept: string[] | undefined): string[] {
  return (accept ?? [])
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.startsWith("."))
    .map((value) => value.slice(1))
    .filter(Boolean);
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const match = /^data:[^;,]+;base64,(.+)$/s.exec(dataUrl);
  const encoded = match?.[1];
  if (!encoded) throw new Error("Only base64 data URLs can be saved");
  const buffer = Buffer.from(encoded, "base64");
  if (buffer.byteLength > MAX_DESKTOP_DOWNLOAD_BYTES) {
    throw new Error("The file is too large to save from the desktop app");
  }
  return buffer;
}

function resolveRendererPath(requestUrl: string): string {
  const root = rendererRoot();
  const url = new URL(requestUrl);
  const requestedPath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const candidates = [
    requestedPath,
    requestedPath ? `${requestedPath}.html` : "index.html",
    join(requestedPath, "index.html"),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const filePath = resolve(root, normalize(candidate));
    const relativePath = relative(root, filePath);
    if (
      relativePath.startsWith("..") ||
      relativePath.includes(`${pathSeparator()}..`)
    ) {
      continue;
    }
    if (existsSync(filePath) && lstatSync(filePath).isFile()) return filePath;
  }

  return join(root, "404.html");
}

function pathSeparator(): string {
  return process.platform === "win32" ? "\\" : "/";
}

async function registerRendererProtocol() {
  const root = rendererRoot();
  await protocol.handle("app", async (request) => {
    const filePath = resolveRendererPath(request.url);
    const relativePath = relative(root, filePath);
    if (relativePath.startsWith("..")) {
      return new Response("Not found", { status: 404 });
    }

    try {
      const body = await fs.readFile(filePath);
      return new Response(body, {
        headers: {
          "content-type": contentTypeFor(filePath),
          "cache-control": filePath.includes(
            `${pathSeparator()}_next${pathSeparator()}`,
          )
            ? "public, max-age=31536000, immutable"
            : "no-cache",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

function isAllowedExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      ALLOWED_EXTERNAL_PROTOCOLS.has(url.protocol) &&
      [...ALLOWED_EXTERNAL_HOSTS].some(
        (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
      )
    );
  } catch {
    return false;
  }
}

function deliverDeepLink(url: string) {
  if (!url.startsWith("loomic://")) return;
  if (!mainWindow || mainWindow.isDestroyed()) {
    pendingDeepLink = url;
    return;
  }
  mainWindow.webContents.send("desktop:auth-callback", { url });
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function extractDeepLink(argv: string[]): string | null {
  return argv.find((value) => value.startsWith("loomic://")) ?? null;
}

function configureWindowPolicy(window: BrowserWindow) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`${DESKTOP_ORIGIN}/`)) {
      void window.loadURL(url);
      return { action: "deny" };
    }
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(`${DESKTOP_ORIGIN}/`)) return;
    event.preventDefault();
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
  });
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: "#ffffff",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, "preload.js"),
    },
  });

  configureWindowPolicy(window);
  // Some macOS packaged builds swallow Cmd/Ctrl+V before Chromium dispatches
  // a paste event. Insert the system clipboard text through Electron so all
  // editable renderer controls, including login credentials, remain pasteable.
  window.webContents.on("before-input-event", (event, input) => {
    const isPasteShortcut =
      input.type === "keyDown" &&
      input.key.toLowerCase() === "v" &&
      (input.meta || input.control);
    if (!isPasteShortcut || !isDesktopFrame(window.webContents.getURL())) return;

    event.preventDefault();
    void clipboard.readText().then((text) => {
      if (text) void window.webContents.insertText(text);
    });
  });
  window.webContents.once("did-finish-load", () => {
    console.info("[desktop] renderer ready");
  });
  window.webContents.once(
    "did-fail-load",
    (_event, errorCode, errorDescription) => {
      console.error(
        `[desktop] renderer failed to load (${errorCode}): ${errorDescription}`,
      );
    },
  );
  window.once("ready-to-show", () => window.show());
  void window.loadURL(`${DESKTOP_ORIGIN}/`);
  return window;
}

function isDesktopFrame(url: string | undefined): boolean {
  return url?.startsWith(`${DESKTOP_ORIGIN}/`) ?? false;
}

function isAllowedClipboardPermission(permission: string): boolean {
  return permission === "clipboard-read" || permission === "clipboard-sanitized-write";
}

async function openDesktopFiles(
  options: DesktopFilePickerOptions = {},
): Promise<DesktopFilePayload[]> {
  const extensions = normalizeFileExtensions(options.accept);
  const properties: Electron.OpenDialogOptions["properties"] = ["openFile"];
  if (options.multiple) properties.push("multiSelections");
  const result = await dialog.showOpenDialog({
    properties,
    ...(extensions.length > 0
      ? { filters: [{ name: "Supported files", extensions }] }
      : {}),
  });
  if (result.canceled) return [];

  const files: DesktopFilePayload[] = [];
  for (const filePath of result.filePaths) {
    const buffer = await fs.readFile(filePath);
    if (buffer.byteLength > MAX_DESKTOP_FILE_BYTES) {
      throw new Error(`${basename(filePath)} is larger than 100 MB`);
    }
    const mimeType = mimeTypeForPath(filePath);
    files.push({
      name: basename(filePath),
      mimeType,
      size: buffer.byteLength,
      dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`,
    });
  }
  return files;
}

async function saveBufferWithDialog(
  buffer: Buffer,
  suggestedName: string,
): Promise<{ canceled: boolean; filePath?: string }> {
  const safeName = basename(suggestedName) || "loomic-export";
  const result = await dialog.showSaveDialog({
    defaultPath: safeName,
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  await fs.writeFile(result.filePath, buffer);
  return { canceled: false, filePath: result.filePath };
}

async function saveDesktopDataUrl(dataUrl: string, suggestedName: string) {
  return saveBufferWithDialog(dataUrlToBuffer(dataUrl), suggestedName);
}

async function saveDesktopUrl(urlValue: string, suggestedName: string) {
  const url = new URL(urlValue);
  if (url.protocol !== "https:") {
    throw new Error("Only HTTPS URLs can be saved by the desktop app");
  }
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Download failed with status ${response.status}`);
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_DESKTOP_DOWNLOAD_BYTES) {
    throw new Error("The remote file is too large to save");
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_DESKTOP_DOWNLOAD_BYTES) {
    throw new Error("The remote file is too large to save");
  }
  return saveBufferWithDialog(buffer, suggestedName);
}

function sendUpdateStatus(status: UpdateStatus) {
  mainWindow?.webContents.send("desktop:update-status", status);
}

async function checkForUpdates(): Promise<UpdateStatus> {
  if (!updaterEnabled) {
    const status: UpdateStatus = { state: "disabled" };
    sendUpdateStatus(status);
    return status;
  }

  sendUpdateStatus({ state: "checking" });
  try {
    const result = await autoUpdater.checkForUpdates();
    if (!result?.updateInfo) {
      const status: UpdateStatus = { state: "not-available" };
      sendUpdateStatus(status);
      return status;
    }
    const status: UpdateStatus = {
      state: "available",
      version: result.updateInfo.version,
    };
    sendUpdateStatus(status);
    return status;
  } catch (error) {
    const status: UpdateStatus = {
      state: "error",
      message: error instanceof Error ? error.message : String(error),
    };
    sendUpdateStatus(status);
    return status;
  }
}

function setupAutoUpdater() {
  const updateUrl = process.env.LOOMIC_UPDATE_URL?.trim();
  if (!app.isPackaged) {
    sendUpdateStatus({ state: "disabled" });
    return;
  }

  if (updateUrl) {
    autoUpdater.setFeedURL({ provider: "generic", url: updateUrl });
  }
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  updaterEnabled = true;

  autoUpdater.on("checking-for-update", () =>
    sendUpdateStatus({ state: "checking" }),
  );
  autoUpdater.on("update-available", (info) => {
    sendUpdateStatus({ state: "available", version: info.version });
  });
  autoUpdater.on("update-not-available", () => {
    sendUpdateStatus({ state: "not-available" });
  });
  autoUpdater.on("download-progress", (progress) => {
    sendUpdateStatus({ state: "downloading", percent: progress.percent });
  });
  autoUpdater.on("update-downloaded", (info) => {
    sendUpdateStatus({ state: "downloaded", version: info.version });
  });
  autoUpdater.on("error", (error) => {
    sendUpdateStatus({ state: "error", message: error.message });
  });

  void checkForUpdates();
}

function installApplicationMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "帮助",
      submenu: [
        {
          label: "检查更新",
          click: () => void checkForUpdates(),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerIpc(runtimeConfig: DesktopRuntimeConfig) {
  ipcMain.on("desktop:get-runtime-config", (event) => {
    event.returnValue = runtimeConfig;
  });

  ipcMain.handle("desktop:open-external", async (event, value: unknown) => {
    if (!isDesktopFrame(event.senderFrame?.url)) {
      throw new Error("Desktop IPC sender is not allowed");
    }
    if (typeof value !== "string" || !isAllowedExternalUrl(value)) {
      throw new Error("External URL is not allowed");
    }
    await shell.openExternal(value);
  });

  ipcMain.handle(
    "desktop:open-files",
    async (event, options: DesktopFilePickerOptions) => {
      if (!isDesktopFrame(event.senderFrame?.url)) {
        throw new Error("Desktop IPC sender is not allowed");
      }
      return openDesktopFiles(options);
    },
  );

  ipcMain.handle(
    "desktop:save-data-url",
    async (event, payload: { dataUrl: string; suggestedName: string }) => {
      if (!isDesktopFrame(event.senderFrame?.url)) {
        throw new Error("Desktop IPC sender is not allowed");
      }
      return saveDesktopDataUrl(payload.dataUrl, payload.suggestedName);
    },
  );

  ipcMain.handle(
    "desktop:save-url",
    async (event, payload: { url: string; suggestedName: string }) => {
      if (!isDesktopFrame(event.senderFrame?.url)) {
        throw new Error("Desktop IPC sender is not allowed");
      }
      return saveDesktopUrl(payload.url, payload.suggestedName);
    },
  );

  ipcMain.handle("desktop:check-for-updates", () => checkForUpdates());
  ipcMain.handle("desktop:download-update", async () => {
    if (!updaterEnabled) return { state: "disabled" } satisfies UpdateStatus;
    await autoUpdater.downloadUpdate();
    return { state: "downloading" } satisfies UpdateStatus;
  });
  ipcMain.handle("desktop:install-update", () => {
    if (updaterEnabled) autoUpdater.quitAndInstall();
  });
}

async function checkApiHealth(runtimeConfig: DesktopRuntimeConfig) {
  try {
    const response = await fetch(`${runtimeConfig.apiBaseUrl}/api/health`);
    if (!response.ok) throw new Error(`status=${response.status}`);
    console.info(`[desktop] API ready at ${runtimeConfig.apiBaseUrl}`);
  } catch (error) {
    console.warn(
      "[desktop] API health check failed; the app will continue:",
      error,
    );
  }
}

function registerDeepLinkHandlers() {
  if (process.platform === "darwin") {
    app.on("open-url", (event, url) => {
      event.preventDefault();
      deliverDeepLink(url);
    });
  }

  app.on("second-instance", (_event, argv) => {
    const url = extractDeepLink(argv);
    if (url) deliverDeepLink(url);
    mainWindow?.show();
    mainWindow?.focus();
  });
}

async function boot() {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  const initialDeepLink = extractDeepLink(process.argv);
  if (initialDeepLink) pendingDeepLink = initialDeepLink;

  if (process.defaultApp) {
    const entryPoint = process.argv[1];
    if (entryPoint) {
      app.setAsDefaultProtocolClient("loomic", process.execPath, [
        resolve(entryPoint),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient("loomic");
  }
  const runtimeConfig = getRuntimeConfig();
  registerIpc(runtimeConfig);
  registerDeepLinkHandlers();

  await app.whenReady();
  await registerRendererProtocol();
  installApplicationMenu();

  // Prevent renderer pages from requesting powerful permissions silently.
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      callback(
        isDesktopFrame(webContents.getURL()) &&
          isAllowedClipboardPermission(permission),
      );
    },
  );
  // Chromium checks clipboard access separately from permission requests. If
  // this handler is omitted, paste can be silently denied even though the
  // request handler above allows it (notably in the login form).
  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin) =>
      isDesktopFrame(webContents?.getURL() ?? requestingOrigin) &&
      isAllowedClipboardPermission(permission),
  );

  mainWindow = createMainWindow();
  setupAutoUpdater();
  void checkApiHealth(runtimeConfig);

  if (pendingDeepLink) {
    const url = pendingDeepLink;
    pendingDeepLink = null;
    mainWindow.webContents.once("did-finish-load", () => deliverDeepLink(url));
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}

void boot().catch((error) => {
  console.error("[desktop] failed to start:", error);
  app.quit();
});
