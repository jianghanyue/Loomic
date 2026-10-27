"use client";

import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { WebSocketHandle } from "../hooks/use-websocket";
import { getServerBaseUrl } from "../lib/env";
import { saveCanvas, uploadThumbnail } from "../lib/server-api";
import { ErrorBoundary } from "./error-boundary";
import { CanvasToolMenu } from "./canvas-tool-menu";
import {
  ReactFlowCanvas,
  type CanvasAppState,
  type CanvasElement,
  type CanvasFlowApi,
} from "./canvas-react-flow";

export type CanvasSelectedElement = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  fileId?: string;
  dataUrl?: string;
  /** Supabase storage public URL -- prefer over dataUrl for message attachments */
  storageUrl?: string;
};

type CanvasEditorProps = {
  canvasId: string;
  projectId: string;
  accessToken: string;
  initialContent: {
    elements: CanvasElement[];
    appState: Record<string, unknown>;
    files: Record<string, Record<string, unknown>>;
  };
  onApiReady?: (api: CanvasFlowApi) => void;
  ws?: WebSocketHandle;
  leftPanelOpen?: boolean;
  onSelectionChange?: (elements: CanvasSelectedElement[]) => void;
};

const SAVE_DEBOUNCE_MS = 1500;
const THUMBNAIL_DEBOUNCE_MS = 10_000;
const THUMBNAIL_MAX_SIZE = 400;

type RenderRegion = { x: number; y: number; width: number; height: number };

function imageSource(element: CanvasElement, files: Record<string, any>) {
  return files[element.fileId]?.dataURL ?? files[element.fileId]?.storageUrl ?? element.customData?.storageUrl ?? "";
}

async function loadImage(source: string): Promise<HTMLImageElement | null> {
  if (!source) return null;
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

function elementBounds(elements: CanvasElement[], region?: RenderRegion): RenderRegion {
  if (region) return region;
  const visible = elements.filter((element) => !element.isDeleted);
  if (!visible.length) return { x: 0, y: 0, width: 1, height: 1 };
  const left = Math.min(...visible.map((element) => Number(element.x) || 0));
  const top = Math.min(...visible.map((element) => Number(element.y) || 0));
  const right = Math.max(...visible.map((element) => (Number(element.x) || 0) + (Number(element.width) || 1)));
  const bottom = Math.max(...visible.map((element) => (Number(element.y) || 0) + (Number(element.height) || 1)));
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

/** Render the legacy canvas payload into a PNG for thumbnails and agent screenshots. */
async function renderCanvasBlob(
  elements: CanvasElement[],
  files: Record<string, any>,
  appState: CanvasAppState,
  maxDimension: number,
  region?: RenderRegion,
): Promise<{ blob: Blob; width: number; height: number }> {
  const bounds = elementBounds(elements, region);
  const scale = Math.min(1, maxDimension / Math.max(bounds.width, bounds.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(bounds.width * scale));
  canvas.height = Math.max(1, Math.ceil(bounds.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas rendering is unavailable");

  if (appState.viewBackgroundColor && appState.viewBackgroundColor !== "transparent") {
    context.fillStyle = appState.viewBackgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.scale(scale, scale);
  context.translate(-bounds.x, -bounds.y);

  for (const element of elements.filter((candidate) => !candidate.isDeleted)) {
    const x = Number(element.x) || 0;
    const y = Number(element.y) || 0;
    const width = Number(element.width) || 1;
    const height = Number(element.height) || 1;
    const opacity = Math.max(0, Math.min(1, Number(element.opacity ?? 100) / 100));
    context.save();
    context.globalAlpha = opacity;
    if (element.type === "image") {
      const image = await loadImage(imageSource(element, files));
      if (image) context.drawImage(image, x, y, width, height);
    } else if (element.type === "text") {
      context.fillStyle = element.strokeColor ?? "#111827";
      context.font = String(Number(element.fontSize) || 24) + "px sans-serif";
      const lines = String(element.text ?? "").split("\n");
      lines.forEach((line, index) => context.fillText(line, x, y + (index + 1) * (Number(element.fontSize) || 24) * 1.25));
    } else if (element.type === "line" || element.type === "arrow") {
      const points: number[][] = Array.isArray(element.points) && element.points.length > 1
        ? element.points as number[][]
        : [[0, height / 2], [width, height / 2]];
      context.strokeStyle = element.strokeColor ?? "#111827";
      context.lineWidth = Math.max(1, Number(element.strokeWidth) || 2);
      context.beginPath();
      points.forEach((point: number[], index: number) => {
        const pointX = point[0] ?? 0;
        const pointY = point[1] ?? 0;
        if (index === 0) context.moveTo(x + pointX, y + pointY);
        else context.lineTo(x + pointX, y + pointY);
      });
      context.stroke();
    } else {
      context.fillStyle = element.backgroundColor && element.backgroundColor !== "transparent" ? element.backgroundColor : "transparent";
      context.strokeStyle = element.strokeColor ?? "#111827";
      context.lineWidth = Math.max(1, Number(element.strokeWidth) || 1);
      if (element.type === "ellipse") {
        context.beginPath();
        context.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
        context.fill();
        context.stroke();
      } else {
        context.fillRect(x, y, width, height);
        context.strokeRect(x, y, width, height);
      }
    }
    context.restore();
  }

  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Canvas export failed")), "image/png"));
  return { blob, width: canvas.width, height: canvas.height };
}

function payloadFromApi(api: CanvasFlowApi): { elements: CanvasElement[]; appState: Record<string, unknown>; files: Record<string, Record<string, unknown>> } {
  const appState = api.getAppState();
  const files: Record<string, Record<string, unknown>> = {};
  for (const [id, file] of Object.entries(api.getFiles())) {
    files[id] = {
      id: file.id,
      dataURL: file.dataURL,
      storageUrl: file.storageUrl,
      mimeType: file.mimeType,
      created: file.created,
    };
  }
  return {
    elements: api.getSceneElements().filter((element) => !element.isDeleted) as CanvasElement[],
    appState: {
      viewBackgroundColor: appState.viewBackgroundColor,
      gridModeEnabled: appState.gridModeEnabled,
      currentItemFontFamily: appState.currentItemFontFamily,
      currentItemFontSize: appState.currentItemFontSize,
      selectedElementIds: appState.selectedElementIds,
      zoom: appState.zoom,
      scrollX: appState.scrollX,
      scrollY: appState.scrollY,
    },
    files,
  };
}

function selectedElementsToPayload(elements: CanvasElement[], api: CanvasFlowApi): CanvasSelectedElement[] {
  const files = api.getFiles();
  return elements.map((element) => {
    const selected: CanvasSelectedElement = {
      id: element.id,
      type: element.type,
      x: Number(element.x) || 0,
      y: Number(element.y) || 0,
      width: Number(element.width) || 0,
      height: Number(element.height) || 0,
    };
    if (element.type === "text" && element.text) selected.text = element.text;
    if (element.type === "image" && element.fileId) {
      selected.fileId = element.fileId;
      const file = files[element.fileId];
      if (file?.dataURL) selected.dataUrl = file.dataURL;
      const storageUrl = element.customData?.storageUrl ?? file?.storageUrl;
      if (typeof storageUrl === "string" && storageUrl) selected.storageUrl = storageUrl;
    }
    return selected;
  });
}

export function CanvasEditor({
  canvasId,
  projectId,
  accessToken,
  initialContent,
  onApiReady,
  ws,
  leftPanelOpen,
  onSelectionChange,
}: CanvasEditorProps) {
  const { resolvedTheme } = useTheme();
  const apiRef = useRef<CanvasFlowApi | null>(null);
  const [apiState, setApiState] = useState<CanvasFlowApi | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thumbnailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;
  const canvasIdRef = useRef(canvasId);
  canvasIdRef.current = canvasId;
  const pendingSaveRef = useRef(false);
  const hydratedRef = useRef(false);
  const initialElementCountRef = useRef(initialContent.elements.filter((element) => !element.isDeleted).length);
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  const handleSelectionChange = useCallback((elements: CanvasElement[]) => {
    const api = apiRef.current;
    if (!api) return;
    onSelectionChangeRef.current?.(selectedElementsToPayload(elements, api));
  }, []);

  const handleApiReady = useCallback((api: CanvasFlowApi) => {
    apiRef.current = api;
    setApiState(api);
    onApiReady?.(api);
  }, [onApiReady]);

  const handleCanvasChange = useCallback(async (elements: CanvasElement[], appState: CanvasAppState) => {
    const api = apiRef.current;
    if (!api || !hydratedRef.current) return;
    pendingSaveRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const currentApi = apiRef.current;
      if (!currentApi) return;
      const payload = payloadFromApi(currentApi);
      saveCanvas(accessTokenRef.current, canvasIdRef.current, payload)
        .then(() => { pendingSaveRef.current = false; })
        .catch((error) => console.error("[canvas-editor] save failed:", error));
    }, SAVE_DEBOUNCE_MS);

    if (thumbnailTimerRef.current) clearTimeout(thumbnailTimerRef.current);
    thumbnailTimerRef.current = setTimeout(async () => {
      const currentApi = apiRef.current;
      if (!currentApi || !elements.some((element) => !element.isDeleted)) return;
      try {
        const rendered = await renderCanvasBlob(elements, currentApi.getFiles(), appState, THUMBNAIL_MAX_SIZE);
        await uploadThumbnail(accessTokenRef.current, projectId, rendered.blob);
      } catch (error) {
        console.warn("[canvas-editor] thumbnail generation/upload failed:", error);
      }
    }, THUMBNAIL_DEBOUNCE_MS);
  }, [projectId]);

  useEffect(() => {
    const api = apiState;
    if (!api) return;
    const unsubscribe = api.onChange((elements, appState) => { void handleCanvasChange(elements, appState); });
    // The API emits the current snapshot immediately to new listeners. Mark the
    // canvas hydrated only after that initial snapshot has been ignored.
    hydratedRef.current = true;
    return unsubscribe;
  }, [apiState, handleCanvasChange]);

  useEffect(() => {
    const api = apiState;
    if (!ws || !api) return;
    return ws.registerRPC("canvas.screenshot", async (params) => {
      const { mode, region, max_dimension = 1024 } = params as {
        mode: string;
        region?: RenderRegion;
        max_dimension?: number;
      };
      const appState = api.getAppState();
      const allElements = api.getSceneElements().filter((element) => !element.isDeleted) as CanvasElement[];
      let renderRegion = region;
      if (mode === "viewport") {
        renderRegion = {
          x: -appState.scrollX,
          y: -appState.scrollY,
          width: appState.width / appState.zoom.value,
          height: appState.height / appState.zoom.value,
        };
      }
      const rendered = await renderCanvasBlob(allElements, api.getFiles(), appState, max_dimension, renderRegion);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(rendered.blob);
      });
      return { url: dataUrl, width: rendered.width, height: rendered.height };
    });
  }, [apiState, ws]);

  const buildSavePayload = useCallback(() => {
    const api = apiRef.current;
    if (!api || !hydratedRef.current) return null;
    const payload = payloadFromApi(api);
    if (payload.elements.length === 0 && initialElementCountRef.current > 0) return null;
    return payload;
  }, []);

  useEffect(() => {
    const flush = () => {
      if (!pendingSaveRef.current) return;
      const payload = buildSavePayload();
      if (!payload) return;
      try {
        fetch(getServerBaseUrl() + "/api/canvases/" + canvasIdRef.current, {
          method: "PUT",
          headers: { Authorization: "Bearer " + accessTokenRef.current, "Content-Type": "application/json" },
          body: JSON.stringify({ content: payload }),
          keepalive: true,
        });
      } catch {
        // Best effort during page teardown.
      }
      pendingSaveRef.current = false;
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (thumbnailTimerRef.current) clearTimeout(thumbnailTimerRef.current);
      const payload = buildSavePayload();
      if (payload && pendingSaveRef.current) void saveCanvas(accessTokenRef.current, canvasIdRef.current, payload);
    };
  }, [buildSavePayload]);

  const flowTheme = resolvedTheme === "dark" ? "dark" : "light";
  const initialContentMemo = useMemo(() => initialContent, [initialContent]);

  return (
    <ErrorBoundary onError={(error) => console.error("[canvas-editor] render crashed:", error)}>
      <div className={"canvas-editor-shell " + flowTheme + " relative h-full w-full"}>
        <ReactFlowCanvas
          initialContent={initialContentMemo}
          onApiReady={handleApiReady}
          onSelectionChange={handleSelectionChange}
        />
        {apiState ? (
          <CanvasToolMenu
            accessToken={accessToken}
            canvasApi={apiState}
            leftPanelOpen={leftPanelOpen ?? false}
          />
        ) : null}
      </div>
    </ErrorBoundary>
  );
}
