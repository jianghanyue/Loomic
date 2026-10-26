import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isDesktop,
  pickFiles,
  saveDataUrl,
  saveUrl,
  subscribeToUpdateStatus,
} from "../src/lib/desktop";

const pngDataUrl = "data:image/png;base64,aGVsbG8=";

afterEach(() => {
  delete window.loomicDesktop;
});

describe("desktop bridge helpers", () => {
  it("converts native file payloads into browser File objects", async () => {
    window.loomicDesktop = {
      isDesktop: true,
      runtimeConfig: {
        apiBaseUrl: "http://127.0.0.1:3001",
        authRedirectUrl: "loomic://auth/callback",
        appVersion: "0.0.0",
        platform: "darwin",
      },
      openExternal: vi.fn(),
      onAuthCallback: vi.fn(() => () => undefined),
      openFiles: vi.fn(async () => [
        {
          name: "hello.png",
          mimeType: "image/png",
          size: 5,
          dataUrl: pngDataUrl,
        },
      ]),
      saveDataUrl: vi.fn(async () => ({ canceled: false })),
      saveUrl: vi.fn(async () => ({ canceled: false })),
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      installUpdate: vi.fn(),
      onUpdateStatus: vi.fn(() => () => undefined),
    };

    expect(isDesktop()).toBe(true);
    const files = await pickFiles({ multiple: false, accept: [".png"] });
    expect(files?.[0]?.name).toBe("hello.png");
    expect(files?.[0]?.type).toBe("image/png");
    expect(files?.[0]?.size).toBe(5);
  });

  it("routes saves and update listeners through the preload bridge", async () => {
    const statusListener = vi.fn();
    const desktop = {
      isDesktop: true as const,
      runtimeConfig: {
        apiBaseUrl: "http://127.0.0.1:3001",
        authRedirectUrl: "loomic://auth/callback",
        appVersion: "0.0.0",
        platform: "darwin",
      },
      openExternal: vi.fn(),
      onAuthCallback: vi.fn(() => () => undefined),
      openFiles: vi.fn(async () => []),
      saveDataUrl: vi.fn(async () => ({ canceled: false })),
      saveUrl: vi.fn(async () => ({ canceled: false })),
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      installUpdate: vi.fn(),
      onUpdateStatus: vi.fn((listener: (status: { state: "downloaded" }) => void) => {
        listener({ state: "downloaded" });
        return () => undefined;
      }),
    };
    window.loomicDesktop = desktop;

    await expect(saveDataUrl(pngDataUrl, "hello.png")).resolves.toBe(true);
    await expect(saveUrl("https://example.com/hello.png", "hello.png")).resolves.toBe(true);
    const unsubscribe = subscribeToUpdateStatus(statusListener);

    expect(desktop.saveDataUrl).toHaveBeenCalledWith(pngDataUrl, "hello.png");
    expect(desktop.saveUrl).toHaveBeenCalledWith("https://example.com/hello.png", "hello.png");
    expect(statusListener).toHaveBeenCalledWith({ state: "downloaded" });
    unsubscribe?.();
  });
});
