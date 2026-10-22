"use client";

import {
  Eraser,
  Layers,
  Loader2,
  Maximize2,
  PenTool,
  Scissors,
  Wand2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  ApiApplicationError,
  type ImageOpCapabilities,
  type ImageOpName,
  fetchImageOpCapabilities,
  runImageOp,
  saveCanvas,
} from "../lib/server-api";
import type { CanvasSelectedElement } from "./canvas-editor";
import { useToast } from "./toast";

type Action = {
  op: ImageOpName;
  label: string;
  icon: typeof Scissors;
  done: string;
  params?: Record<string, unknown>;
  /** Needs extra input (a region or a prompt) before it can run. */
  mode?: "erase" | "edit" | "layers";
};

const ACTIONS: Action[] = [
  { op: "remove_background", label: "抠图", icon: Scissors, done: "已抠图" },
  {
    op: "upscale_image",
    label: "放大 2×",
    icon: Maximize2,
    params: { factor: 2 },
    done: "已放大",
  },
  { op: "split_layers", label: "拆分图层", icon: Layers, done: "已拆分图层", mode: "layers" },
  {
    op: "erase_region",
    label: "擦除",
    icon: Eraser,
    done: "已擦除",
    mode: "erase",
  },
  {
    op: "edit_image",
    label: "改图",
    icon: Wand2,
    done: "已生成修改版",
    mode: "edit",
  },
  { op: "vectorize_image", label: "矢量化", icon: PenTool, done: "已转为矢量" },
];

type Rect = { x: number; y: number; width: number; height: number };

const BUTTON =
  "flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[13px] transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";
const BUTTON_IDLE =
  "text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground";
const BUTTON_ACTIVE = "bg-foreground/[0.08] text-foreground";
const PANEL =
  "rounded-xl p-1 bg-card/75 backdrop-blur-lg border border-border shadow-card";

/**
 * Quick image operations shown above the canvas when exactly one image is
 * selected. Results are written next to the image by the server; the canvas
 * is then re-synced. The scene is saved first so the server sees the image.
 */
export function ImageOpsBar({
  accessToken,
  canvasId,
  excalidrawApi,
  selected,
  onCanvasSync,
}: {
  accessToken: string;
  canvasId: string;
  excalidrawApi: any;
  selected: CanvasSelectedElement[];
  onCanvasSync: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [capabilities, setCapabilities] = useState<ImageOpCapabilities | null>(
    null,
  );
  const [running, setRunning] = useState<ImageOpName | null>(null);
  const [mode, setMode] = useState<"erase" | "edit" | "layers" | null>(null);
  const [layerCount, setLayerCount] = useState(4);
  const [layerPrompt, setLayerPrompt] = useState("");
  const [prompt, setPrompt] = useState("");
  /** Erase region in fractions (0–1) of the image. */
  const [region, setRegion] = useState<Rect | null>(null);

  useEffect(() => {
    fetchImageOpCapabilities(accessToken)
      .then(setCapabilities)
      .catch(() => setCapabilities(null));
  }, [accessToken]);

  const image =
    selected.length === 1 && selected[0]?.type === "image" ? selected[0] : null;
  const imageId = image?.id;
  // Re-check on selecting a new image, e.g. after a model download finishes.
  useEffect(() => {
    if (!imageId) return;
    let canceled = false;
    const refresh = () => fetchImageOpCapabilities(accessToken).then((caps) => { if (!canceled) setCapabilities(caps); }).catch(() => {});
    void refresh();
    const interval = setInterval(refresh, 15_000);
    return () => { canceled = true; clearInterval(interval); };
  }, [accessToken, imageId]);
  const bounds = useScreenBounds(excalidrawApi, imageId ?? "");
  const stackRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (mode === "edit") promptRef.current?.focus();
  }, [mode]);
  const [stackSize, setStackSize] = useState({ width: 0, height: 0 });
  // Measure the toolbar (and its erase/edit row) so it can be centred and kept on screen.
  useLayoutEffect(() => {
    const el = stackRef.current;
    if (!el) return;
    const measure = () =>
      setStackSize((prev) =>
        prev.width === el.offsetWidth && prev.height === el.offsetHeight
          ? prev
          : { width: el.offsetWidth, height: el.offsetHeight },
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  });

  // Leave erase/edit mode when the selection changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on selection change only
  useEffect(() => {
    setMode(null);
    setRegion(null);
  }, [imageId]);

  const exitMode = useCallback(() => {
    setMode(null);
    setRegion(null);
  }, []);

  useEffect(() => {
    if (!mode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitMode();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, exitMode]);

  const run = useCallback(
    async (action: Action, params: Record<string, unknown> = {}) => {
      if (!image || running) return;
      setRunning(action.op);
      try {
        if (excalidrawApi)
          await saveCanvas(accessToken, canvasId, scenePayload(excalidrawApi));
        await runImageOp(accessToken, canvasId, {
          op: action.op,
          elementId: image.id,
          ...action.params,
          ...params,
        });
        await onCanvasSync();
        toast.success(action.done);
        exitMode();
        setPrompt("");
      } catch (err) {
        toast.error(
          err instanceof ApiApplicationError
            ? err.message
            : "操作失败，请稍后重试",
        );
      } finally {
        setRunning(null);
      }
    },
    [
      accessToken,
      canvasId,
      excalidrawApi,
      exitMode,
      image,
      onCanvasSync,
      running,
      toast,
    ],
  );

  const onActionClick = (action: Action) => {
    if (!action.mode) return run(action);
    if (mode === action.mode) return exitMode();
    if (
      action.mode === "erase" &&
      image &&
      isRotated(excalidrawApi, image.id)
    ) {
      toast.error("暂不支持在旋转后的图片上框选擦除区域");
      return;
    }
    setRegion(null);
    setMode(action.mode);
  };

  if (!image) return null;

  const eraseAction = ACTIONS.find((a) => a.op === "erase_region") as Action;
  const editAction = ACTIONS.find((a) => a.op === "edit_image") as Action;
  const layersAction = ACTIONS.find((a) => a.op === "split_layers") as Action;

  return (
    <>
      {mode === "erase" && (
        <RegionPicker
          excalidrawApi={excalidrawApi}
          elementId={image.id}
          region={region}
          onChange={setRegion}
        />
      )}
      <div
        ref={stackRef}
        className="absolute z-20 flex flex-col items-center gap-1.5"
        style={toolbarPosition(bounds, stackSize)}
      >
        <div className={`flex items-center gap-0.5 ${PANEL}`}>
          {ACTIONS.map((action) => {
            const available = capabilities?.ops[action.op] ?? false;
            const detail = capabilities?.details?.[action.op];
            const isRunning = running === action.op;
            const Icon = isRunning ? Loader2 : action.icon;
            return (
              <button
                key={action.op}
                type="button"
                disabled={!available || running !== null}
                title={
                  available
                    ? `${action.label} · ${detail?.backend ?? "本地处理"}`
                    : `${action.label}（${detail?.reason ?? (capabilities ? "需要服务端配置 ComfyUI" : "正在检查本地模型")}）`
                }
                onClick={() => onActionClick(action)}
                className={`${BUTTON} ${action.mode && mode === action.mode ? BUTTON_ACTIVE : BUTTON_IDLE}`}
              >
                <Icon
                  className={`size-[15px] ${isRunning ? "animate-spin" : ""}`}
                />
                {action.label}
              </button>
            );
          })}
        </div>

        {mode === "erase" && (
          <div className={`flex items-center gap-1 pl-3 ${PANEL}`}>
            <span className="text-[13px] text-muted-foreground mr-1">
              {region ? "已框选区域" : "在图片上拖动，框出要擦除的区域"}
            </span>
            <button
              type="button"
              onClick={exitMode}
              className={`${BUTTON} ${BUTTON_IDLE}`}
            >
              取消
            </button>
            <button
              type="button"
              disabled={!region || running !== null}
              onClick={() => region && run(eraseAction, { region })}
              className={`${BUTTON} bg-foreground text-background hover:bg-foreground/90`}
            >
              {running === "erase_region" && (
                <Loader2 className="size-[15px] animate-spin" />
              )}
              擦除
            </button>
          </div>
        )}

        {mode === "layers" && (
          <div className={`flex flex-col items-stretch gap-1 p-2 ${PANEL}`}>
            <input value={layerPrompt} onChange={(e) => setLayerPrompt(e.target.value)}
              placeholder="可选：描述画面内容，帮助拆分"
              className="min-w-0 h-8 px-2 bg-transparent text-[13px] outline-none" />
            <div className="flex items-center gap-2">
            <label className="text-[13px] text-muted-foreground flex items-center gap-2">
              图层数量
              <select aria-label="拆分图层数量" value={layerCount} disabled={running !== null}
                onChange={(e) => setLayerCount(Number(e.target.value))}
                className="h-8 px-2 rounded-lg bg-background border border-border text-foreground">
                {[2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <span className="text-[12px] text-muted-foreground">2–8 层，内容越多耗时越长</span>
            <button type="button" onClick={exitMode} className={`${BUTTON} ${BUTTON_IDLE}`}>取消</button>
            <button type="button" disabled={running !== null} onClick={() => run(layersAction, { layers: layerCount, ...(layerPrompt.trim() ? { prompt: layerPrompt.trim() } : {}) })}
              className={`${BUTTON} bg-foreground text-background hover:bg-foreground/90`}>开始拆分</button>
            </div>
          </div>
        )}

        {mode === "edit" && (
          <form
            className={`flex items-center gap-1 w-[min(480px,calc(100vw-32px))] ${PANEL}`}
            onSubmit={(e) => {
              e.preventDefault();
              if (prompt.trim()) run(editAction, { prompt: prompt.trim() });
            }}
          >
            <input
              ref={promptRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="描述要怎么改，例如：把花换成雾蓝色"
              className="flex-1 min-w-0 h-8 px-2.5 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground outline-none"
            />
            <button
              type="button"
              onClick={exitMode}
              className={`${BUTTON} ${BUTTON_IDLE}`}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!prompt.trim() || running !== null}
              className={`${BUTTON} bg-foreground text-background hover:bg-foreground/90`}
            >
              {running === "edit_image" && (
                <Loader2 className="size-[15px] animate-spin" />
              )}
              生成
            </button>
          </form>
        )}
      </div>
    </>
  );
}

/**
 * Where an element sits in the canvas container, in CSS pixels, kept current
 * through pans and zooms. Scene coords map to ((x + scrollX) * zoom, …).
 */
function useScreenBounds(api: any, elementId: string) {
  const [state, setState] = useState<{
    rect: Rect;
    viewport: { width: number; height: number };
  } | null>(null);
  useEffect(() => {
    const update = () => {
      const el = api?.getSceneElements().find((e: any) => e.id === elementId);
      if (!el) return setState(null);
      const { scrollX, scrollY, zoom, width, height } = api.getAppState();
      const next = {
        rect: {
          x: (el.x + scrollX) * zoom.value,
          y: (el.y + scrollY) * zoom.value,
          width: el.width * zoom.value,
          height: el.height * zoom.value,
        },
        viewport: { width, height },
      };
      // onChange fires on every pointer move; only re-render on real changes.
      setState((prev) =>
        prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
      );
    };
    update();
    return api?.onChange?.(update);
  }, [api, elementId]);
  return state;
}

const ANCHOR_GAP = 40; // clears Excalidraw's rotation handle above the image
const EDGE = 12;
const HEADER_CLEARANCE = 56;

/**
 * Place the toolbar centred above the image at a fixed size. Falls back to
 * below the image, then to the top of the canvas, when there is no room.
 */
function toolbarPosition(
  bounds: ReturnType<typeof useScreenBounds>,
  size: { width: number; height: number },
): React.CSSProperties {
  if (!bounds)
    return {
      left: "50%",
      top: HEADER_CLEARANCE,
      transform: "translateX(-50%)",
    };
  const { rect, viewport } = bounds;
  const half = size.width / 2;
  const centre = Math.min(
    Math.max(rect.x + rect.width / 2, EDGE + half),
    Math.max(EDGE + half, viewport.width - EDGE - half),
  );
  let top = rect.y - ANCHOR_GAP - size.height;
  if (top < HEADER_CLEARANCE) {
    const below = rect.y + rect.height + ANCHOR_GAP;
    top =
      below + size.height <= viewport.height - 72 ? below : HEADER_CLEARANCE;
  }
  return { left: centre - half, top };
}

function isRotated(api: any, elementId: string): boolean {
  const el = api?.getSceneElements().find((e: any) => e.id === elementId);
  return Boolean(el?.angle);
}

/**
 * Transparent layer over the selected image for dragging out a rectangle.
 * Positioned in the canvas container, where scene coords map to
 * ((x + scrollX) * zoom, (y + scrollY) * zoom).
 */
function RegionPicker({
  excalidrawApi,
  elementId,
  region,
  onChange,
}: {
  excalidrawApi: any;
  elementId: string;
  region: Rect | null;
  onChange: (region: Rect | null) => void;
}) {
  const bounds = useScreenBounds(excalidrawApi, elementId)?.rect ?? null;
  const start = useRef<{ x: number; y: number } | null>(null);

  if (!bounds) return null;

  const toFraction = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)),
    };
  };

  return (
    <div
      className="absolute z-10 cursor-crosshair touch-none ring-1 ring-foreground/30"
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = toFraction(e);
        onChange(null);
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const p = toFraction(e);
        onChange({
          x: Math.min(start.current.x, p.x),
          y: Math.min(start.current.y, p.y),
          width: Math.abs(p.x - start.current.x),
          height: Math.abs(p.y - start.current.y),
        });
      }}
      onPointerUp={() => {
        start.current = null;
        if (region && (region.width < 0.01 || region.height < 0.01))
          onChange(null);
      }}
    >
      {region && (
        <div
          className="absolute border-2 border-dashed border-destructive bg-destructive/15"
          style={{
            left: `${region.x * 100}%`,
            top: `${region.y * 100}%`,
            width: `${region.width * 100}%`,
            height: `${region.height * 100}%`,
          }}
        />
      )}
    </div>
  );
}

/** Same payload shape the editor's autosave sends. */
function scenePayload(api: any) {
  const appState = api.getAppState();
  const files: Record<string, Record<string, unknown>> = {};
  for (const [id, file] of Object.entries(
    api.getFiles() as Record<string, any>,
  )) {
    files[id] = {
      id: file.id,
      dataURL: file.dataURL,
      mimeType: file.mimeType,
      created: file.created,
    };
  }
  return {
    elements: (api.getSceneElements() as Record<string, unknown>[]).filter(
      (el) => !el.isDeleted,
    ),
    appState: {
      viewBackgroundColor: appState.viewBackgroundColor,
      gridModeEnabled: appState.gridModeEnabled,
    },
    files,
  };
}
