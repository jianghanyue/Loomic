"use client";

import "@xyflow/react/dist/style.css";

import {
  Background,
  Handle,
  MarkerType,
  MiniMap,
  NodeResizer,
  Position,
  ReactFlow,
  SelectionMode,
  applyEdgeChanges,
  applyNodeChanges,
  type Node,
  type NodeChange,
  type NodeProps,
  type Connection,
  type Edge,
  type EdgeChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isVideoUrl } from "../lib/canvas-elements";
import { VideoCanvasElement } from "./canvas/video-canvas-element";

export type CanvasElement = Record<string, any>;

export type CanvasAppState = {
  viewBackgroundColor: string;
  gridModeEnabled: boolean;
  currentItemFontFamily?: number;
  currentItemFontSize?: number;
  selectedElementIds: Record<string, boolean>;
  activeTool: { type: string };
  zoom: { value: number };
  scrollX: number;
  scrollY: number;
  width: number;
  height: number;
};

export type CanvasChangeListener = (
  elements: CanvasElement[],
  appState: CanvasAppState,
) => void;

export type CanvasFlowApi = {
  getSceneElements: () => readonly CanvasElement[];
  getAppState: () => CanvasAppState;
  getFiles: () => Record<string, any>;
  addFiles: (files: any[]) => void;
  updateScene: (scene: {
    elements?: CanvasElement[];
    appState?: Partial<CanvasAppState> & { zoom?: { value: number } };
    captureUpdate?: string;
  }) => void;
  onChange: (listener: CanvasChangeListener) => () => void;
  setActiveTool: (tool: { type: string }) => void;
  scrollToContent: () => void;
  undo: () => void;
  redo: () => void;
};

type CanvasNodeData = {
  element: CanvasElement;
  files: Record<string, any>;
  onResize: (id: string, width: number, height: number) => void;
};

type CanvasNode = Node<CanvasNodeData, "canvas-element">;
type CanvasEdge = Edge<{ elementId: string }>;

type Binding = {
  elementId?: string;
  fixedPoint?: unknown;
};

type HandleSide = "top" | "right" | "bottom" | "left";

const SOURCE_HANDLE = { side: "right" as HandleSide, position: Position.Right };
const TARGET_HANDLE = { side: "left" as HandleSide, position: Position.Left };

const DEFAULT_ELEMENT_WIDTH = 240;
const DEFAULT_ELEMENT_HEIGHT = 160;

function elementSize(element: CanvasElement) {
  return {
    width: Math.max(1, Number(element.width) || DEFAULT_ELEMENT_WIDTH),
    height: Math.max(1, Number(element.height) || DEFAULT_ELEMENT_HEIGHT),
  };
}

function bindingFrom(value: unknown): Binding | null {
  return typeof value === "object" && value !== null ? value as Binding : null;
}

function isBoundLineElement(element: CanvasElement) {
  if (element.isDeleted) return false;
  if (element.type !== "line" && element.type !== "arrow") return false;
  const start = bindingFrom(element.startBinding);
  const end = bindingFrom(element.endBinding);
  return Boolean(start?.elementId && end?.elementId);
}

function fixedPointForSide(side: HandleSide): [number, number] {
  switch (side) {
    case "top": return [0.5, 0];
    case "right": return [1, 0.5];
    case "left": return [0, 0.5];
    case "bottom": return [0.5, 1];
  }
}

function pointForSide(element: CanvasElement, side: HandleSide) {
  const x = Number(element.x) || 0;
  const y = Number(element.y) || 0;
  const { width, height } = elementSize(element);
  switch (side) {
    case "top": return { x: x + width / 2, y };
    case "right": return { x: x + width, y: y + height / 2 };
    case "left": return { x, y: y + height / 2 };
    case "bottom": return { x: x + width / 2, y: y + height };
  }
}

function handleOffset(type: "source" | "target", side: HandleSide): React.CSSProperties {
  const offset = side === "top" || side === "bottom"
    ? { marginLeft: type === "source" ? 8 : -8 }
    : { marginTop: type === "source" ? 8 : -8 };
  return { ...offset, zIndex: 10, pointerEvents: "all" };
}

function boundConnectionIds(element: CanvasElement): { source: string; target: string } | null {
  if (!isBoundLineElement(element)) return null;
  const start = bindingFrom(element.startBinding)?.elementId;
  const end = bindingFrom(element.endBinding)?.elementId;
  if (!start || !end) return null;
  return { source: String(start), target: String(end) };
}

type ConnectionLike = { source: string; target: string; sourceHandle?: string | null };

function normalizeConnection(connection: ConnectionLike): { source: string; target: string } | null {
  if (!connection.source || !connection.target || connection.source === connection.target) return null;
  if (connection.sourceHandle === "target") {
    return { source: connection.target, target: connection.source };
  }
  return { source: connection.source, target: connection.target };
}

function hasConnectionBetween(elements: CanvasElement[], source: string, target: string): boolean {
  return elements.some((element) => {
    const connection = boundConnectionIds(element);
    if (!connection) return false;
    return (
      (connection.source === source && connection.target === target) ||
      (connection.source === target && connection.target === source)
    );
  });
}

function wouldCreateCycle(elements: CanvasElement[], source: string, target: string): boolean {
  const adjacency = new Map<string, string[]>();
  for (const element of elements) {
    const connection = boundConnectionIds(element);
    if (!connection) continue;
    const next = adjacency.get(connection.source) ?? [];
    next.push(connection.target);
    adjacency.set(connection.source, next);
  }

  const visited = new Set<string>();
  const pending = [target];
  while (pending.length) {
    const current = pending.pop();
    if (!current || visited.has(current)) continue;
    if (current === source) return true;
    visited.add(current);
    pending.push(...(adjacency.get(current) ?? []));
  }
  return false;
}

function buildEdges(elements: CanvasElement[]): CanvasEdge[] {
  const activeIds = new Set(elements.filter((element) => !element.isDeleted).map((element) => String(element.id)));
  const seenPairs = new Set<string>();
  return elements.flatMap<CanvasEdge>((element) => {
    if (!isBoundLineElement(element)) return [];
    const connection = boundConnectionIds(element);
    const source = connection?.source ?? "";
    const target = connection?.target ?? "";
    if (!source || !target || source === target || !activeIds.has(source) || !activeIds.has(target)) return [];
    const pairKey = [source, target].sort().join("::");
    if (seenPairs.has(pairKey)) return [];
    seenPairs.add(pairKey);
    const stroke = element.strokeColor ?? "currentColor";
    const edge: CanvasEdge = {
      id: String(element.id),
      source,
      target,
      sourceHandle: "source",
      targetHandle: "target",
      type: "smoothstep",
      data: { elementId: String(element.id) },
      style: {
        stroke,
        strokeWidth: Math.max(1, Number(element.strokeWidth) || 2),
        strokeDasharray: "10 8",
        animation: "loomic-flow-edge 0.9s linear infinite",
      },
      animated: true,
    };
    if (element.type === "arrow") edge.markerEnd = { type: MarkerType.ArrowClosed, color: stroke };
    return [edge];
  });
}

function fileSource(element: CanvasElement, files: Record<string, any>) {
  const file = element.fileId ? files[element.fileId] : undefined;
  return file?.dataURL ?? file?.storageUrl ?? element.customData?.storageUrl ?? "";
}

function shapeStyle(element: CanvasElement): React.CSSProperties {
  return {
    width: "100%",
    height: "100%",
    border: `${Math.max(1, Number(element.strokeWidth) || 1)}px ${element.strokeStyle === "dashed" ? "dashed" : "solid"} ${element.strokeColor ?? "currentColor"}`,
    background: element.backgroundColor && element.backgroundColor !== "transparent"
      ? element.backgroundColor
      : "transparent",
    opacity: Math.max(0, Math.min(1, Number(element.opacity ?? 100) / 100)),
    borderRadius: element.type === "ellipse" ? "50%" : element.roundness ? 16 : 0,
  };
}

function pointsForElement(element: CanvasElement): string {
  const points = Array.isArray(element.points) ? element.points : [];
  if (points.length < 2) {
    const { width, height } = elementSize(element);
    return `0,${height / 2} ${width},${height / 2}`;
  }
  return points
    .map((point: unknown) => {
      if (!Array.isArray(point)) return "0,0";
      return `${Number(point[0]) || 0},${Number(point[1]) || 0}`;
    })
    .join(" ");
}

function renderElement(element: CanvasElement, files: Record<string, any>) {
  const { width, height } = elementSize(element);
  const customData = element.customData ?? {};

  if (customData.kind === "workflow-node") {
    const status = customData.status ?? "idle";
    const statusLabel = status === "success"
      ? "已完成"
      : status === "running"
        ? "处理中"
        : status === "error"
          ? "失败"
          : status === "warning"
            ? "需检查"
            : "待运行";
    const statusClass = status === "success"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : status === "running"
        ? "border-primary/40 bg-primary/10 text-primary"
        : status === "error"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : status === "warning"
            ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
            : "border-border bg-muted/60 text-muted-foreground";
    const preview = typeof customData.previewUrl === "string" ? customData.previewUrl : "";
    return (
      <div className="flex h-full w-full flex-col rounded-2xl border border-border bg-card/95 p-3 shadow-card backdrop-blur-sm">
        <div className="flex items-start gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-foreground text-background text-sm font-semibold">
            {String(customData.step ?? "✦")}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">{customData.title ?? "图案工作流"}</div>
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{customData.subtitle ?? "图像处理节点"}</div>
          </div>
          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${statusClass}`}>{statusLabel}</span>
        </div>
        <div className="mt-3 flex min-h-0 flex-1 items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-2">
          {preview ? (
            <img src={preview} alt="" className="h-full min-h-12 w-16 rounded-lg object-cover" draggable={false} />
          ) : (
            <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg bg-background text-lg text-muted-foreground">{status === "running" ? "…" : "＋"}</div>
          )}
          <div className="min-w-0 text-[11px] leading-4 text-muted-foreground">
            <div className="truncate">{customData.outputLabel ?? "等待上一步输出"}</div>
            {customData.note ? <div className="mt-1 line-clamp-2 text-amber-700 dark:text-amber-300">{customData.note}</div> : null}
          </div>
        </div>
      </div>
    );
  }

  if (element.type === "image") {
    const src = fileSource(element, files);
    return src ? (
      <img
        src={src}
        alt={customData.title ?? ""}
        draggable={false}
        className="block h-full w-full select-none object-contain"
      />
    ) : (
      <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">
        图片加载中
      </div>
    );
  }

  if (element.type === "text") {
    return (
      <div
        className="h-full w-full overflow-hidden whitespace-pre-wrap break-words"
        style={{
          color: element.strokeColor ?? "currentColor",
          fontSize: Number(element.fontSize) || 24,
          lineHeight: 1.25,
          fontFamily: "var(--font-sans), sans-serif",
          textAlign: element.textAlign ?? "left",
          opacity: Math.max(0, Math.min(1, Number(element.opacity ?? 100) / 100)),
        }}
      >
        {element.text ?? ""}
      </div>
    );
  }

  if (element.type === "embeddable" && isVideoUrl(element.link)) {
    return <VideoCanvasElement src={element.link} width={width} height={height} />;
  }

  if (customData.type === "image-generator" || customData.type === "video-generator") {
    const video = customData.type === "video-generator";
    const status = customData.status === "generating" ? "生成中…" : video ? "AI 视频" : "AI 图片";
    return (
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/70 text-muted-foreground"
        style={{ borderColor: video ? "#93C5FD" : "#D1D5DB" }}
      >
        <span className="text-2xl">{video ? "◉" : "✦"}</span>
        <span className="text-xs font-medium">{status}</span>
        {customData.prompt ? <span className="max-w-[80%] truncate text-[11px]">{customData.prompt}</span> : null}
      </div>
    );
  }

  if (element.type === "line" || element.type === "arrow") {
    return (
      <svg className="pointer-events-none h-full w-full overflow-visible" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <polyline
          points={pointsForElement(element)}
          fill="none"
          stroke={element.strokeColor ?? "currentColor"}
          strokeWidth={Math.max(1, Number(element.strokeWidth) || 2)}
          strokeLinecap="round"
          strokeLinejoin="round"
          markerEnd={element.type === "arrow" ? "url(#loomic-arrow)" : undefined}
        />
        {element.type === "arrow" ? (
          <defs>
            <marker id="loomic-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={element.strokeColor ?? "currentColor"} />
            </marker>
          </defs>
        ) : null}
      </svg>
    );
  }

  if (element.type === "diamond") {
    return <div className="h-full w-full rotate-45 scale-[0.7]" style={shapeStyle(element)} />;
  }

  if (element.type === "rectangle" || element.type === "ellipse") {
    return <div style={shapeStyle(element)} />;
  }

  return (
    <div className="flex h-full w-full items-center justify-center rounded-lg border border-border bg-card/80 px-3 text-xs text-muted-foreground">
      {element.type ?? "元素"}
    </div>
  );
}

const CanvasFlowNode = memo(function CanvasFlowNode({ id, data, selected }: NodeProps<CanvasNode>) {
  const { element, files, onResize } = data;
  const { width, height } = elementSize(element);

  return (
    <>
      <Handle
        id="target"
        type="target"
        position={TARGET_HANDLE.position}
        style={handleOffset("target", TARGET_HANDLE.side)}
        className="!h-3 !w-3 !border-2 !border-background !bg-emerald-500"
      />
      <Handle
        id="source"
        type="source"
        position={SOURCE_HANDLE.position}
        style={handleOffset("source", SOURCE_HANDLE.side)}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />
      <NodeResizer
        isVisible={selected}
        minWidth={24}
        minHeight={24}
        onResizeEnd={(_, params) => onResize(id, params.width, params.height)}
        lineClassName="border-primary"
        handleClassName="h-2 w-2 rounded-sm border-primary bg-card"
      />
      <div
        className={`loomic-flow-node h-full w-full overflow-hidden ${selected ? "ring-2 ring-primary/60" : ""}`}
        style={{ width, height, transform: `rotate(${Number(element.angle) || 0}deg)` }}
        data-canvas-element-id={id}
      >
        {renderElement(element, files)}
      </div>
    </>
  );
});

const nodeTypes = { "canvas-element": CanvasFlowNode };

function selectedIdsFromNodes(nodes: CanvasNode[]) {
  return nodes.reduce<Record<string, boolean>>((result, node) => {
    if (node.selected) result[node.id] = true;
    return result;
  }, {});
}

function makeAppState(
  input: Record<string, unknown> | undefined,
  width: number,
  height: number,
): CanvasAppState {
  const zoomValue = typeof input?.zoom === "object" && input.zoom !== null
    ? Number((input.zoom as Record<string, unknown>).value) || 1
    : Number(input?.zoom) || 1;
  return {
    viewBackgroundColor: typeof input?.viewBackgroundColor === "string" ? input.viewBackgroundColor : "#FFFFFF",
    gridModeEnabled: true,
    currentItemFontFamily: typeof input?.currentItemFontFamily === "number" ? input.currentItemFontFamily : 6,
    currentItemFontSize: typeof input?.currentItemFontSize === "number" ? input.currentItemFontSize : 24,
    selectedElementIds: (input?.selectedElementIds as Record<string, boolean> | undefined) ?? {},
    activeTool: (input?.activeTool as { type: string } | undefined) ?? { type: "selection" },
    zoom: { value: zoomValue },
    scrollX: Number(input?.scrollX) || 0,
    scrollY: Number(input?.scrollY) || 0,
    width,
    height,
  };
}

function viewportFromAppState(appState: CanvasAppState) {
  return {
    x: appState.scrollX * appState.zoom.value,
    y: appState.scrollY * appState.zoom.value,
    zoom: appState.zoom.value,
  };
}

function createLegacyElement(type: string, x: number, y: number): CanvasElement {
  const isLine = type === "line" || type === "arrow";
  return {
    id: `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.slice(0, 20),
    type,
    x,
    y,
    width: isLine ? 180 : type === "text" ? 280 : 240,
    height: isLine ? 2 : type === "text" ? 48 : 160,
    points: isLine ? [[0, 0], [180, 0]] : undefined,
    text: type === "text" ? "双击编辑文字" : undefined,
    strokeColor: "#1f2937",
    backgroundColor: type === "text" || isLine ? "transparent" : "#ffffff",
    strokeWidth: 2,
    opacity: 100,
    angle: 0,
    isDeleted: false,
    customData: {},
  };
}

function createBoundLineElement(source: CanvasElement, target: CanvasElement, sourceSide: HandleSide, targetSide: HandleSide): CanvasElement {
  const start = pointForSide(source, sourceSide);
  const end = pointForSide(target, targetSide);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const id = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.slice(0, 20);
  return {
    ...createLegacyElement("arrow", start.x, start.y),
    id,
    x: start.x,
    y: start.y,
    width: Math.max(1, Math.abs(dx)),
    height: Math.max(1, Math.abs(dy)),
    points: [[0, 0], [dx, dy]],
    startBinding: {
      elementId: source.id,
      focus: 0,
      gap: 8,
      fixedPoint: fixedPointForSide(sourceSide),
    },
    endBinding: {
      elementId: target.id,
      focus: 0,
      gap: 8,
      fixedPoint: fixedPointForSide(targetSide),
    },
    startArrowhead: null,
    endArrowhead: "arrow",
  };
}

export function ReactFlowCanvas({
  initialContent,
  onApiReady,
  onSelectionChange,
}: {
  initialContent: {
    elements: CanvasElement[];
    appState: Record<string, unknown>;
    files: Record<string, Record<string, unknown>>;
  };
  onApiReady?: (api: CanvasFlowApi) => void;
  onSelectionChange?: (elements: CanvasElement[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<ReactFlowInstance<CanvasNode, CanvasEdge> | null>(null);
  const listenersRef = useRef(new Set<CanvasChangeListener>());
  const elementsRef = useRef<CanvasElement[]>(initialContent.elements ?? []);
  const filesRef = useRef<Record<string, any>>(initialContent.files ?? {});
  const appStateRef = useRef<CanvasAppState>(makeAppState(initialContent.appState, 1, 1));
  const historyRef = useRef<Array<{ elements: CanvasElement[]; appState: CanvasAppState }>>([]);
  const futureRef = useRef<Array<{ elements: CanvasElement[]; appState: CanvasAppState }>>([]);
  const [containerSize, setContainerSize] = useState({ width: 1, height: 1 });
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const nodesRef = useRef<CanvasNode[]>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);
  const edgesRef = useRef<CanvasEdge[]>([]);
  const [activeTool, setActiveToolState] = useState("selection");
  const [backgroundColor, setBackgroundColor] = useState("#FFFFFF");
  const [gridEnabled, setGridEnabled] = useState(true);

  const emit = useCallback(() => {
    const elements = elementsRef.current;
    const state = appStateRef.current;
    for (const listener of listenersRef.current) listener(elements, state);
    const selected = elements.filter((element) => state.selectedElementIds[element.id] && !element.isDeleted);
    onSelectionChange?.(selected);
  }, [onSelectionChange]);

  const setCurrentNodes = useCallback((nextNodes: CanvasNode[]) => {
    nodesRef.current = nextNodes;
    setNodes(nextNodes);
    const nextEdges = buildEdges(elementsRef.current);
    edgesRef.current = nextEdges;
    setEdges(nextEdges);
  }, []);

  const buildNodes = useCallback((elements: CanvasElement[], files: Record<string, any>, selectedIds: Record<string, boolean>) => {
    return elements
      .filter((element) => !element.isDeleted && !isBoundLineElement(element))
      .map<CanvasNode>((element) => {
        const { width, height } = elementSize(element);
        return {
          id: String(element.id),
          type: "canvas-element",
          position: { x: Number(element.x) || 0, y: Number(element.y) || 0 },
          style: { width, height },
          width,
          height,
          selected: selectedIds[element.id] === true,
          data: { element, files, onResize: () => undefined },
          draggable: true,
          selectable: true,
        };
      });
  }, []);

  const pushHistory = useCallback(() => {
    historyRef.current.push({
      elements: elementsRef.current.map((element) => ({ ...element })),
      appState: { ...appStateRef.current, selectedElementIds: { ...appStateRef.current.selectedElementIds }, zoom: { ...appStateRef.current.zoom } },
    });
    if (historyRef.current.length > 50) historyRef.current.shift();
    futureRef.current = [];
  }, []);

  const updateViewportAppState = useCallback((viewport: { x: number; y: number; zoom: number }) => {
    const zoom = viewport.zoom || 1;
    appStateRef.current = {
      ...appStateRef.current,
      zoom: { value: zoom },
      scrollX: viewport.x / zoom,
      scrollY: viewport.y / zoom,
      width: containerRef.current?.clientWidth ?? containerSize.width,
      height: containerRef.current?.clientHeight ?? containerSize.height,
    };
  }, [containerSize.height, containerSize.width]);

  const handleResize = useCallback((id: string, width: number, height: number) => {
    const next = elementsRef.current.map((element) => element.id === id ? { ...element, width, height, updated: Date.now() } : element);
    pushHistory();
    elementsRef.current = next;
    setCurrentNodes(buildNodes(next, filesRef.current, appStateRef.current.selectedElementIds).map((node) => ({
      ...node,
      data: { ...node.data, onResize: handleResize },
    })));
    emit();
  }, [buildNodes, emit, pushHistory, setCurrentNodes]);

  const nodesWithCallbacks = useCallback((elements: CanvasElement[], files: Record<string, any>, selectedIds: Record<string, boolean>) =>
    buildNodes(elements, files, selectedIds).map((node) => ({
      ...node,
      data: { ...node.data, onResize: handleResize },
    })), [buildNodes, handleResize]);

  const api = useMemo<CanvasFlowApi>(() => ({
    getSceneElements: () => elementsRef.current,
    getAppState: () => ({
      ...appStateRef.current,
      selectedElementIds: { ...appStateRef.current.selectedElementIds },
      zoom: { ...appStateRef.current.zoom },
    }),
    getFiles: () => filesRef.current,
    addFiles: (files) => {
      for (const file of files) {
        if (file?.id) filesRef.current[file.id] = file;
      }
      setCurrentNodes(nodesWithCallbacks(elementsRef.current, filesRef.current, appStateRef.current.selectedElementIds));
      emit();
    },
    updateScene: (scene) => {
      if (scene.captureUpdate !== "NONE") pushHistory();
      if (scene.elements) elementsRef.current = scene.elements.map((element) => ({ ...element }));
      if (scene.appState) {
        const nextAppState = { ...appStateRef.current, ...scene.appState } as CanvasAppState;
        if (scene.appState.selectedElementIds) nextAppState.selectedElementIds = { ...scene.appState.selectedElementIds };
        if (scene.appState.zoom) nextAppState.zoom = { value: scene.appState.zoom.value };
        appStateRef.current = nextAppState;
        setActiveToolState(nextAppState.activeTool?.type ?? "selection");
        setBackgroundColor(nextAppState.viewBackgroundColor);
        setGridEnabled(nextAppState.gridModeEnabled);
        if (scene.appState.zoom && flowRef.current) flowRef.current.setViewport(viewportFromAppState(nextAppState));
      }
      setCurrentNodes(nodesWithCallbacks(elementsRef.current, filesRef.current, appStateRef.current.selectedElementIds));
      emit();
    },
    onChange: (listener) => {
      listenersRef.current.add(listener);
      listener(elementsRef.current, appStateRef.current);
      return () => listenersRef.current.delete(listener);
    },
    setActiveTool: (tool) => {
      appStateRef.current = { ...appStateRef.current, activeTool: tool };
      setActiveToolState(tool.type);
      emit();
    },
    scrollToContent: () => {
      void flowRef.current?.fitView({ padding: 0.2, duration: 200 });
    },
    undo: () => {
      const previous = historyRef.current.pop();
      if (!previous) return;
      futureRef.current.push({ elements: elementsRef.current, appState: appStateRef.current });
      elementsRef.current = previous.elements;
      appStateRef.current = previous.appState;
      setBackgroundColor(previous.appState.viewBackgroundColor);
      setGridEnabled(previous.appState.gridModeEnabled);
      setCurrentNodes(nodesWithCallbacks(elementsRef.current, filesRef.current, appStateRef.current.selectedElementIds));
      if (flowRef.current) flowRef.current.setViewport(viewportFromAppState(appStateRef.current));
      emit();
    },
    redo: () => {
      const next = futureRef.current.pop();
      if (!next) return;
      historyRef.current.push({ elements: elementsRef.current, appState: appStateRef.current });
      elementsRef.current = next.elements;
      appStateRef.current = next.appState;
      setBackgroundColor(next.appState.viewBackgroundColor);
      setGridEnabled(next.appState.gridModeEnabled);
      setCurrentNodes(nodesWithCallbacks(elementsRef.current, filesRef.current, appStateRef.current.selectedElementIds));
      if (flowRef.current) flowRef.current.setViewport(viewportFromAppState(appStateRef.current));
      emit();
    },
  }), [emit, nodesWithCallbacks, pushHistory, setCurrentNodes]);

  useEffect(() => {
    const initialState = makeAppState(initialContent.appState, containerSize.width, containerSize.height);
    appStateRef.current = initialState;
    setActiveToolState(initialState.activeTool.type);
    setBackgroundColor(initialState.viewBackgroundColor);
    setGridEnabled(initialState.gridModeEnabled);
    setCurrentNodes(nodesWithCallbacks(elementsRef.current, filesRef.current, initialState.selectedElementIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasKey(initialContent), nodesWithCallbacks, setCurrentNodes]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const width = element.clientWidth || 1;
      const height = element.clientHeight || 1;
      setContainerSize({ width, height });
      appStateRef.current = { ...appStateRef.current, width, height };
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const resolveFiles = async () => {
      const pending = Object.entries(filesRef.current).filter(([, file]) => file?.storageUrl && !file?.dataURL);
      if (!pending.length) return;
      await Promise.all(pending.map(async ([fileId, file]) => {
        try {
          const response = await fetch(file.storageUrl);
          if (!response.ok) return;
          const blob = await response.blob();
          const dataURL = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          filesRef.current[fileId] = { ...file, dataURL, mimeType: file.mimeType ?? blob.type };
        } catch (error) {
          console.warn(`[react-flow-canvas] failed to resolve ${fileId}`, error);
        }
      }));
      setCurrentNodes(nodesWithCallbacks(elementsRef.current, filesRef.current, appStateRef.current.selectedElementIds));
      emit();
    };
    void resolveFiles();
  }, [emit, initialContent.files, nodesWithCallbacks, setCurrentNodes]);

  useEffect(() => {
    onApiReady?.(api);
    emit();
  }, [api, emit, onApiReady]);

  const handleNodesChange = useCallback((changes: NodeChange<CanvasNode>[]) => {
    if (!changes.length) return;
    pushHistory();
    const removed = new Set(changes.filter((change) => change.type === "remove").map((change) => change.id));
    const nextNodes = applyNodeChanges(changes, nodesRef.current) as CanvasNode[];
    const nextElements = elementsRef.current.map((element) => {
      if (removed.has(element.id)) return { ...element, isDeleted: true, updated: Date.now() };
      const node = nextNodes.find((candidate) => candidate.id === element.id);
      if (!node) return element;
      return {
        ...element,
        x: node.position.x,
        y: node.position.y,
        ...(node.width ? { width: node.width } : {}),
        ...(node.height ? { height: node.height } : {}),
      };
    });
    elementsRef.current = nextElements;
    appStateRef.current = { ...appStateRef.current, selectedElementIds: selectedIdsFromNodes(nextNodes) };
    setCurrentNodes(nextNodes.map((node) => ({ ...node, data: { ...node.data, files: filesRef.current, onResize: handleResize } })));
    emit();
  }, [emit, handleResize, pushHistory, setCurrentNodes]);

  const handleEdgesChange = useCallback((changes: EdgeChange<CanvasEdge>[]) => {
    if (!changes.length) return;
    const removedIds = new Set(changes.filter((change) => change.type === "remove").map((change) => change.id));
    const nextEdges = applyEdgeChanges(changes, edgesRef.current) as CanvasEdge[];
    edgesRef.current = nextEdges;
    setEdges(nextEdges);
    if (!removedIds.size) return;
    pushHistory();
    const nextElements = elementsRef.current.map((element) => removedIds.has(String(element.id))
      ? { ...element, isDeleted: true, updated: Date.now() }
      : element);
    elementsRef.current = nextElements;
    setCurrentNodes(nodesWithCallbacks(nextElements, filesRef.current, appStateRef.current.selectedElementIds));
    emit();
  }, [emit, nodesWithCallbacks, pushHistory, setCurrentNodes]);

  const isConnectionAllowed = useCallback((connection: Connection | Edge) => {
    const pair = normalizeConnection(connection);
    if (!pair) return false;
    const source = elementsRef.current.find((element) => String(element.id) === pair.source && !element.isDeleted);
    const target = elementsRef.current.find((element) => String(element.id) === pair.target && !element.isDeleted);
    if (!source || !target || isBoundLineElement(source) || isBoundLineElement(target)) return false;
    if (hasConnectionBetween(elementsRef.current, pair.source, pair.target)) return false;
    if (wouldCreateCycle(elementsRef.current, pair.source, pair.target)) return false;
    return true;
  }, []);

  const handleConnect = useCallback((connection: Connection) => {
    const pair = normalizeConnection(connection);
    if (!pair || !isConnectionAllowed(connection)) return;
    const source = elementsRef.current.find((element) => String(element.id) === pair.source && !element.isDeleted);
    const target = elementsRef.current.find((element) => String(element.id) === pair.target && !element.isDeleted);
    if (!source || !target) return;

    const line = createBoundLineElement(source, target, "right", "left");
    const nextElements = elementsRef.current.map((element) => {
      if (element.id === source.id || element.id === target.id) {
        const boundElements = Array.isArray(element.boundElements) ? [...element.boundElements] : [];
        boundElements.push({ type: "arrow", id: line.id });
        return { ...element, boundElements };
      }
      return element;
    });

    pushHistory();
    elementsRef.current = [...nextElements, line];
    setCurrentNodes(nodesWithCallbacks(elementsRef.current, filesRef.current, appStateRef.current.selectedElementIds));
    emit();
  }, [emit, isConnectionAllowed, nodesWithCallbacks, pushHistory, setCurrentNodes]);

  const handleSelectionChange = useCallback(({ nodes: selectedNodes, edges: selectedEdges }: { nodes: CanvasNode[]; edges: CanvasEdge[] }) => {
    const selectedIds = selectedIdsFromNodes(selectedNodes);
    for (const edge of selectedEdges) selectedIds[edge.data?.elementId ?? edge.id] = true;
    appStateRef.current = { ...appStateRef.current, selectedElementIds: selectedIds };
    emit();
  }, [emit]);

  const handleMove = useCallback((_event: unknown, viewport: { x: number; y: number; zoom: number }) => {
    updateViewportAppState(viewport);
    emit();
  }, [emit, updateViewportAppState]);

  const handleInit = useCallback((instance: ReactFlowInstance<CanvasNode, CanvasEdge>) => {
    flowRef.current = instance;
    instance.setViewport(viewportFromAppState(appStateRef.current));
    onApiReady?.(api);
  }, [api, onApiReady]);

  const handlePaneClick = useCallback((event: React.MouseEvent) => {
    if (!["rectangle", "ellipse", "diamond", "line", "arrow", "text"].includes(activeTool)) return;
    const instance = flowRef.current;
    if (!instance) return;
    const position = instance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const element = createLegacyElement(activeTool, position.x, position.y);
    api.updateScene({
      elements: [...elementsRef.current, element],
      appState: { selectedElementIds: { [element.id]: true } },
      captureUpdate: "IMMEDIATELY",
    });
    setActiveToolState("selection");
    appStateRef.current = { ...appStateRef.current, activeTool: { type: "selection" } };
  }, [activeTool, api]);

  const defaultViewport = useMemo(() => viewportFromAppState(makeAppState(initialContent.appState, 1, 1)), [initialContent.appState]);

  return (
    <div
      ref={containerRef}
      className="canvas-editor react-flow-canvas relative h-full w-full"
      data-text-controls="false"
      style={{ backgroundColor }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={handleInit}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        isValidConnection={isConnectionAllowed}
        onSelectionChange={handleSelectionChange}
        onMove={handleMove}
        onPaneClick={handlePaneClick}
        defaultViewport={defaultViewport}
        fitView={false}
        nodesConnectable
        deleteKeyCode={["Backspace", "Delete"]}
        connectionRadius={80}
        selectionOnDrag={activeTool === "selection"}
        panOnDrag={activeTool === "hand" ? true : [1, 2]}
        panOnScroll
        selectionMode={SelectionMode.Partial}
        proOptions={{ hideAttribution: true }}
      >
        {gridEnabled ? <Background gap={24} size={1} color="var(--border)" /> : null}
        <MiniMap pannable zoomable className="!bottom-4 !right-4 !bg-card/80 !backdrop-blur-sm" nodeColor="var(--muted-foreground)" />
      </ReactFlow>
    </div>
  );
}

function canvasKey(content: { elements: CanvasElement[]; appState: Record<string, unknown>; files: Record<string, Record<string, unknown>> }) {
  return `${content.elements.length}:${content.appState.viewBackgroundColor ?? ""}:${Object.keys(content.files).length}`;
}
