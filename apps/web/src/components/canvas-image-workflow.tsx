"use client";

import {
  Check,
  ChevronRight,
  CircleAlert,
  CircleDot,
  Download,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { CanvasSelectedElement } from "./canvas-editor";
import {
  ApiApplicationError,
  createPatternFromImage,
  runImageOp,
  saveCanvas,
} from "../lib/server-api";
import { createCanvasImageElement, scaleToFit } from "../lib/canvas-elements";
import { useToast } from "./toast";

type CanvasApi = any;

type WorkflowStep = {
  kind: "source" | "extract_motif" | "denoise" | "split_motifs" | "vectorize" | "repeat";
  title: string;
  subtitle: string;
  step: string;
};

type WorkflowNode = Record<string, any> & {
  customData: {
    kind: "workflow-node";
    workflowId: string;
    nodeKind: WorkflowStep["kind"];
    title: string;
    subtitle: string;
    step: string;
    order: number;
    inputElementId?: string;
    outputElementId?: string;
    outputElementIds?: string[];
    status?: "idle" | "running" | "success" | "warning" | "error";
    previewUrl?: string;
    outputLabel?: string;
    note?: string;
    colors?: number;
    repeatMode?: "block" | "half_drop" | "brick" | "mirror";
  };
};

const STEPS: WorkflowStep[] = [
  { kind: "source", step: "01", title: "输入图片", subtitle: "锁定原始参考图" },
  { kind: "extract_motif", step: "02", title: "提取图案", subtitle: "分离主体与透明背景" },
  { kind: "denoise", step: "03", title: "去噪清理", subtitle: "清除杂点与毛边" },
  { kind: "split_motifs", step: "04", title: "提取花纹", subtitle: "拆分可复用元素" },
  { kind: "repeat", step: "05", title: "四方循环", subtitle: "生成 2×2 无缝预览" },
  { kind: "vectorize", step: "06", title: "矢量化", subtitle: "归并色板并追踪轮廓" },
];

const NODE_WIDTH = 246;
const NODE_HEIGHT = 158;
const NODE_GAP = 88;

function randomId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function scenePayload(api: CanvasApi) {
  const appState = api.getAppState();
  const files: Record<string, Record<string, unknown>> = {};
  for (const [id, file] of Object.entries(api.getFiles() as Record<string, any>)) {
    files[id] = {
      id: file.id,
      dataURL: file.dataURL,
      storageUrl: file.storageUrl,
      mimeType: file.mimeType,
      created: file.created,
    };
  }
  return {
    elements: (api.getSceneElements() as Record<string, unknown>[]).filter((el) => !el.isDeleted),
    appState: {
      viewBackgroundColor: appState.viewBackgroundColor,
      gridModeEnabled: appState.gridModeEnabled,
      selectedElementIds: appState.selectedElementIds,
      zoom: appState.zoom,
      scrollX: appState.scrollX,
      scrollY: appState.scrollY,
    },
    files,
  };
}

function workflowElements(api: CanvasApi): WorkflowNode[] {
  return (api?.getSceneElements?.() ?? []).filter(
    (element: any) => !element.isDeleted && element.customData?.kind === "workflow-node",
  ) as WorkflowNode[];
}

function workflowIdFor(nodes: WorkflowNode[]) {
  return nodes[0]?.customData.workflowId ?? null;
}

function elementById(api: CanvasApi, id: string | undefined) {
  if (!id) return null;
  return api?.getSceneElements?.().find((element: any) => element.id === id && !element.isDeleted) ?? null;
}

function fileDataUrl(api: CanvasApi, element: any) {
  if (!element?.fileId) return "";
  const file = api?.getFiles?.()?.[element.fileId];
  return file?.dataURL ?? file?.storageUrl ?? element.customData?.storageUrl ?? "";
}

function latestDerivedElement(api: CanvasApi, sourceId: string, op: string) {
  return (api?.getSceneElements?.() ?? [])
    .filter((element: any) => !element.isDeleted && element.customData?.derivedFrom === sourceId && element.customData?.op === op)
    .sort((a: any, b: any) => Number(b.updated ?? 0) - Number(a.updated ?? 0))[0] ?? null;
}

function latestGeneratedImage(api: CanvasApi, sourceId: string, since: number) {
  return (api?.getSceneElements?.() ?? [])
    .filter((element: any) => !element.isDeleted && element.type === "image" && element.id !== sourceId && Number(element.updated ?? 0) >= since && element.customData?.kind !== "workflow-node")
    .sort((a: any, b: any) => Number(b.updated ?? 0) - Number(a.updated ?? 0))[0] ?? null;
}

function makeWorkflowNode(step: WorkflowStep, index: number, workflowId: string, source: any, previewUrl: string): WorkflowNode {
  const sourceX = Number(source.x) || 0;
  const sourceY = Number(source.y) || 0;
  return {
    id: randomId("workflow-node"),
    type: "workflow",
    x: sourceX + (Number(source.width) || 240) + 120 + index * (NODE_WIDTH + NODE_GAP),
    y: sourceY,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    angle: 0,
    strokeColor: "#334155",
    backgroundColor: "transparent",
    strokeWidth: 1,
    opacity: 100,
    isDeleted: false,
    updated: Date.now(),
    customData: {
      kind: "workflow-node",
      workflowId,
      nodeKind: step.kind,
      title: step.title,
      subtitle: step.subtitle,
      step: step.step,
      order: index,
      status: step.kind === "source" ? "success" : "idle",
      inputElementId: step.kind === "source" ? source.id : undefined,
      outputElementId: step.kind === "source" ? source.id : undefined,
      ...(step.kind === "source" ? { previewUrl } : {}),
      outputLabel: step.kind === "source" ? "原始图片" : "等待上一步输出",
      ...(step.kind === "vectorize" ? { colors: 8 } : {}),
      ...(step.kind === "repeat" ? { repeatMode: "block" } : {}),
    },
  };
}

function makeWorkflowEdge(source: WorkflowNode, target: WorkflowNode) {
  const id = randomId("workflow-edge");
  const dx = (Number(target.x) || 0) - ((Number(source.x) || 0) + NODE_WIDTH);
  const dy = (Number(target.y) || 0) - (Number(source.y) || 0);
  return {
    id,
    type: "arrow",
    x: (Number(source.x) || 0) + NODE_WIDTH,
    y: (Number(source.y) || 0) + NODE_HEIGHT / 2,
    width: Math.max(1, dx),
    height: Math.max(1, Math.abs(dy)),
    points: [[0, 0], [dx, dy]],
    strokeColor: "#94a3b8",
    strokeWidth: 2,
    opacity: 100,
    isDeleted: false,
    updated: Date.now(),
    startBinding: { elementId: source.id, focus: 0, gap: 8, fixedPoint: [1, 0.5] },
    endBinding: { elementId: target.id, focus: 0, gap: 8, fixedPoint: [0, 0.5] },
    startArrowhead: null,
    endArrowhead: "arrow",
  };
}

function updateWorkflowElements(api: CanvasApi, workflowId: string, updater: (node: WorkflowNode) => WorkflowNode) {
  const next = (api.getSceneElements() as any[]).map((element) => {
    if (element.customData?.kind !== "workflow-node" || element.customData.workflowId !== workflowId) return element;
    return updater(element as WorkflowNode);
  });
  api.updateScene({ elements: next, captureUpdate: "IMMEDIATELY" });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片读取失败"));
    image.src = src;
  });
}

async function canvasOutput(src: string, transform: (ctx: CanvasRenderingContext2D, width: number, height: number) => void) {
  const image = await loadImage(src);
  const max = 1400;
  const fitted = scaleToFit(image.naturalWidth || image.width, image.naturalHeight || image.height, max);
  const canvas = document.createElement("canvas");
  canvas.width = fitted.width;
  canvas.height = fitted.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("当前浏览器不支持图像处理");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  transform(ctx, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
}

async function denoiseImage(src: string) {
  return canvasOutput(src, (ctx, width, height) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const source = new Uint8ClampedArray(imageData.data);
    const index = (x: number, y: number, channel: number) => ((y * width + x) * 4) + channel;
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const center = index(x, y, 3);
        const alpha = source[center] ?? 0;
        if (alpha === 0) continue;
        const neighbors = [
          source[index(x - 1, y, 3)] ?? 0, source[index(x + 1, y, 3)] ?? 0,
          source[index(x, y - 1, 3)] ?? 0, source[index(x, y + 1, 3)] ?? 0,
        ];
        const strong = neighbors.filter((value) => value > 80).length;
        if (alpha < 80 && strong < 2) imageData.data[center] = 0;
        if (alpha >= 80 && strong === 0) imageData.data[center] = Math.min(alpha, 120);
      }
    }
    ctx.putImageData(imageData, 0, 0);
  });
}

async function repeatPreview(src: string) {
  const image = await loadImage(src);
  const tile = scaleToFit(image.naturalWidth || image.width, image.naturalHeight || image.height, 560);
  const canvas = document.createElement("canvas");
  canvas.width = tile.width * 2;
  canvas.height = tile.height * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("当前浏览器不支持回位预览");
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 2; col += 1) ctx.drawImage(image, col * tile.width, row * tile.height, tile.width, tile.height);
  }
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let total = 0;
  let samples = 0;
  const pixelAt = (x: number, y: number, channel: number) => pixels[((y * canvas.width + x) * 4) + channel] ?? 0;
  for (let y = 0; y < tile.height; y += Math.max(1, Math.floor(tile.height / 96))) {
    for (let channel = 0; channel < 3; channel += 1) {
      total += Math.abs(pixelAt(0, y, channel) - pixelAt(tile.width - 1, y, channel));
      samples += 1;
    }
  }
  for (let x = 0; x < tile.width; x += Math.max(1, Math.floor(tile.width / 96))) {
    for (let channel = 0; channel < 3; channel += 1) {
      total += Math.abs(pixelAt(x, 0, channel) - pixelAt(x, tile.height - 1, channel));
      samples += 1;
    }
  }
  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height,
    seamScore: samples ? total / samples / 255 : 0,
  };
}

async function thumbnail(src: string) {
  const image = await loadImage(src);
  const fitted = scaleToFit(image.naturalWidth || image.width, image.naturalHeight || image.height, 180);
  const canvas = document.createElement("canvas");
  canvas.width = fitted.width;
  canvas.height = fitted.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return src;
  ctx.drawImage(image, 0, 0, fitted.width, fitted.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

function insertLocalArtifact(api: CanvasApi, source: any, dataUrl: string, width: number, height: number, title: string, customData: Record<string, unknown>) {
  const fileId = randomId("workflow-file");
  const display = scaleToFit(width, height, 520);
  const sourceX = Number(source.x) || 0;
  const sourceY = Number(source.y) || 0;
  const element = createCanvasImageElement({
    fileId,
    x: sourceX,
    y: sourceY + (Number(source.height) || 160) + 52,
    width: display.width,
    height: display.height,
    title,
    source: "generated",
  });
  element.customData = { ...(element.customData as object), ...customData };
  api.addFiles([{ id: fileId, dataURL: dataUrl, mimeType: "image/png", created: Date.now() }]);
  api.updateScene({ elements: [...api.getSceneElements(), element], captureUpdate: "IMMEDIATELY" });
  return element;
}

function downloadDataUrl(dataUrl: string, name: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = name;
  link.click();
}

export function CanvasImageWorkflow({
  accessToken,
  canvasId,
  canvasApi,
  selected,
  open,
  onClose,
  onCanvasSync,
  onAgentRun,
}: {
  accessToken: string;
  canvasId: string;
  canvasApi: CanvasApi;
  selected: CanvasSelectedElement[];
  open: boolean;
  onClose: () => void;
  onCanvasSync: () => void | Promise<void>;
  onAgentRun?: (prompt: string) => Promise<void>;
}) {
  const toast = useToast();
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [running, setRunning] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const all = workflowElements(canvasApi).sort((a, b) => Number(a.customData.order) - Number(b.customData.order));
    setNodes(all);
  }, [canvasApi]);

  useEffect(() => {
    if (!open || !canvasApi) return;
    refresh();
    return canvasApi.onChange?.(() => refresh());
  }, [canvasApi, open, refresh]);

  const image = selected.length === 1 && selected[0]?.type === "image" ? selected[0] : null;
  const workflowId = workflowIdFor(nodes);
  const activeWorkflowNodes = workflowId ? nodes : [];
  const progress = activeWorkflowNodes.length
    ? Math.round((activeWorkflowNodes.filter((node) => node.customData.status === "success" || node.customData.status === "warning").length / activeWorkflowNodes.length) * 100)
    : 0;

  const createWorkflow = useCallback(async () => {
    if (!image || !canvasApi) return;
    const source = elementById(canvasApi, image.id);
    if (!source) return;
    const id = randomId("workflow");
    const preview = fileDataUrl(canvasApi, source);
    const previewThumb = preview ? await thumbnail(preview) : "";
    const created = STEPS.map((step, index) => makeWorkflowNode(step, index, id, source, previewThumb));
    const edges = created.slice(1).map((node, index) => makeWorkflowEdge(created[index]!, node));
    const elements = [...canvasApi.getSceneElements(), ...created, ...edges];
    canvasApi.updateScene({ elements, appState: { selectedElementIds: { [created[0]!.id]: true } }, captureUpdate: "IMMEDIATELY" });
    canvasApi.scrollToContent?.();
    toast.success("已创建图案处理工作流");
  }, [canvasApi, image, toast]);

  const setNodeState = useCallback((nodeId: string, patch: Record<string, unknown>) => {
    const target = nodes.find((node) => node.id === nodeId);
    const id = target?.customData.workflowId;
    if (!id) return;
    const outputElementId = typeof patch.outputElementId === "string" ? patch.outputElementId : undefined;
    updateWorkflowElements(canvasApi, id, (node) => {
      if (node.id === nodeId) {
        return { ...node, customData: { ...node.customData, ...patch }, updated: Date.now() };
      }
      if (outputElementId && Number(node.customData.order) === Number(target.customData.order) + 1) {
        const nextNode = {
          ...node,
          customData: {
            ...node.customData,
            inputElementId: outputElementId,
            status: "idle",
            outputLabel: "等待运行",
          },
          updated: Date.now(),
        } as WorkflowNode;
        delete nextNode.customData.outputElementId;
        delete nextNode.customData.outputElementIds;
        delete nextNode.customData.previewUrl;
        delete nextNode.customData.note;
        return nextNode;
      }
      return node;
    });
  }, [canvasApi, nodes]);

  const runAgentNode = useCallback(async (node: WorkflowNode, sourceId: string) => {
    if (!onAgentRun) return false;
    canvasApi.updateScene({ appState: { selectedElementIds: { [sourceId]: true } } });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const startedAt = Date.now();
    const promptByKind: Record<WorkflowStep["kind"], string> = {
      source: "",
      extract_motif: "[workflow:image-model-only] 请使用 generate_image 图像模型处理当前附带的参考图：提取主体图案，去除复杂背景，保留完整轮廓，输出透明背景 PNG。不要调用其他图像操作工具。",
      denoise: "[workflow:image-model-only] 请使用 generate_image 图像模型处理当前附带的参考图：清理杂点、毛边和破碎细线，保持图案结构、色彩和透明背景。",
      split_motifs: "[workflow:image-model-only] 请使用 generate_image 图像模型处理当前附带的参考图：提取可复用的主花纹单元，做成干净、平面、完整轮廓的纹样元素，保持透明背景。",
      vectorize: "[workflow:image-model-only] 请调用 vectorize_image 工具处理当前画布中的结果，生成 8 色 SVG 矢量文件。这个步骤使用本地 SVG 追踪。",
      repeat: "[workflow:image-model-only] 请使用 generate_image 图像模型处理当前附带的参考图：生成上下左右四边无缝的连续花型，保持纹样结构和配色，输出正方形、平面、无文字的 2×2 可循环图案。",
    };
    const prompt = promptByKind[node.customData.nodeKind];
    if (!prompt) return false;
    await onAgentRun(prompt);
    await onCanvasSync();

    const opByKind: Partial<Record<WorkflowStep["kind"], string>> = {
      extract_motif: "remove_background",
      denoise: "denoise_image",
      split_motifs: "split_layers",
      vectorize: "vectorize_image",
    };
    const output = node.customData.nodeKind === "vectorize"
      ? latestDerivedElement(canvasApi, sourceId, opByKind[node.customData.nodeKind] ?? "")
      : latestGeneratedImage(canvasApi, sourceId, startedAt);
    if (!output) {
      setNodeState(node.id, {
        status: "warning",
        inputElementId: sourceId,
        outputElementId: sourceId,
        outputLabel: "Agent 未产出结果",
        note: "Agent 已完成本轮对话，但画布中没有检测到新的结果元素",
      });
      return true;
    }
    const preview = await thumbnail(fileDataUrl(canvasApi, output));
    setNodeState(node.id, {
      status: "success",
      inputElementId: sourceId,
      outputElementId: output.id,
      outputElementIds: [output.id],
      previewUrl: preview,
      outputLabel: node.customData.nodeKind === "repeat" ? "Agent 已生成回位 Pattern" : "Agent 已生成结果",
      note: "由 Agent 工具写入画布",
    });
    return true;
  }, [canvasApi, onAgentRun, onCanvasSync, setNodeState]);

  const runNode = useCallback(async (node: WorkflowNode) => {
    if (!canvasApi || running) return;
    const sourceId = node.customData.inputElementId ?? node.customData.outputElementId;
    const source = elementById(canvasApi, sourceId);
    if (!source || !sourceId) {
      toast.error("找不到上一步的图片结果");
      return;
    }
    setRunning(node.id);
    setNodeState(node.id, { status: "running", note: undefined });
    try {
      if (node.customData.nodeKind === "source") {
        setNodeState(node.id, { status: "success", outputElementId: source.id, outputLabel: "原始图片" });
        return;
      }

      if (onAgentRun) {
        await runAgentNode(node, sourceId);
        return;
      }

      if (node.customData.nodeKind === "denoise") {
        const src = fileDataUrl(canvasApi, source);
        if (!src) throw new Error("当前图片还没有可读取的预览");
        const result = await denoiseImage(src);
        const artifact = insertLocalArtifact(
          canvasApi,
          source,
          result.dataUrl,
          result.width,
          result.height,
          "去噪结果",
          { workflowArtifact: true, workflowNodeId: node.id, workflowId: node.customData.workflowId },
        );
        const preview = await thumbnail(result.dataUrl);
        setNodeState(node.id, { status: "success", outputElementId: artifact.id, previewUrl: preview, outputLabel: "透明边缘已清理", note: "已使用本地透明边缘清理" });
        return;
      }

      if (node.customData.nodeKind === "repeat") {
        try {
          await saveCanvas(accessToken, canvasId, scenePayload(canvasApi));
          const pattern = await createPatternFromImage(accessToken, canvasId, {
            sourceElementId: sourceId,
            name: "图片四方循环",
            repeatType: node.customData.repeatMode ?? "block",
            widthCm: 64,
            heightCm: 64,
            dpi: 150,
            ground: null,
          });
          await onCanvasSync();
          const output = elementById(canvasApi, pattern.patternId);
          const preview = output ? await thumbnail(fileDataUrl(canvasApi, output)) : "";
          const warning = !pattern.report.ok || !pattern.report.seamless;
          const issueText = pattern.report.issues?.length ? `：${pattern.report.issues.join("、")}` : "";
          setNodeState(node.id, {
            status: warning ? "warning" : "success",
            inputElementId: sourceId,
            outputElementId: pattern.patternId,
            previewUrl: preview,
            outputLabel: warning ? "2×2 预览，需检查" : "2×2 回位检查通过",
            note: warning ? `接缝检查未完全通过${issueText}` : "Pattern 元素已写入画布",
          });
          return;
        } catch (patternError) {
          // Keep the workflow useful in local development when the server is
          // running without the pattern route or storage configured.
          const src = fileDataUrl(canvasApi, source);
          if (!src) throw patternError;
          const result = await repeatPreview(src);
          const artifact = insertLocalArtifact(canvasApi, source, result.dataUrl, result.width, result.height, "四方循环预览", {
            workflowArtifact: true,
            workflowNodeId: node.id,
            workflowId: node.customData.workflowId,
          });
          const preview = await thumbnail(result.dataUrl);
          const seamScore = result.seamScore;
          const warning = seamScore > 0.08;
          setNodeState(node.id, {
            status: warning ? "warning" : "success",
            outputElementId: artifact.id,
            previewUrl: preview,
            outputLabel: "本地 2×2 循环预览",
            note: warning ? `边缘差异 ${(seamScore * 100).toFixed(1)}%，建议调整边缘后再导出` : "边缘差异较低，预览通过",
          });
          return;
        }
      }

      await saveCanvas(accessToken, canvasId, scenePayload(canvasApi));
      const op = node.customData.nodeKind === "extract_motif"
        ? "remove_background"
        : node.customData.nodeKind === "split_motifs"
          ? "split_layers"
          : "vectorize_image";
      const result = await runImageOp(accessToken, canvasId, {
        op,
        elementId: sourceId,
        ...(op === "split_layers" ? { layers: 4 } : {}),
        ...(op === "vectorize_image" ? { colors: node.customData.colors ?? 8 } : {}),
      });
      await onCanvasSync();
      const outputId = result.elementIds[0];
      const output = elementById(canvasApi, outputId);
      const preview = output ? await thumbnail(fileDataUrl(canvasApi, output)) : "";
      const outputLabel = op === "remove_background"
        ? "透明图案"
        : op === "split_layers"
          ? `${result.elementIds.length} 个花纹图层`
          : `${node.customData.colors ?? 8} 色 SVG`;
      setNodeState(node.id, {
        status: "success",
        inputElementId: sourceId,
        outputElementId: outputId,
        outputElementIds: result.elementIds,
        previewUrl: preview,
        outputLabel,
        note: result.method === "color_key" ? "使用纯色背景抠图" : undefined,
      });
    } catch (error) {
      const message = error instanceof ApiApplicationError ? error.message : error instanceof Error ? error.message : "处理失败，请稍后重试";
      if (
        (node.customData.nodeKind === "split_motifs" && error instanceof ApiApplicationError && ["comfyui_not_configured", "model_unavailable", "comfyui_unreachable", "comfyui_failed"].includes(error.code)) ||
        (node.customData.nodeKind === "extract_motif" && error instanceof ApiApplicationError && error.code === "background_not_uniform")
      ) {
        setNodeState(node.id, {
          status: "warning",
          inputElementId: sourceId,
          outputElementId: sourceId,
          outputElementIds: [sourceId],
          previewUrl: await thumbnail(fileDataUrl(canvasApi, source)),
          outputLabel: node.customData.nodeKind === "extract_motif" ? "保留原图继续处理" : "保留为单个花纹",
          note: node.customData.nodeKind === "extract_motif" ? "背景不是纯色，未配置抠图模型，已保留原图继续后续处理" : "未配置图层模型，已保留当前图案继续后续处理",
        });
        return;
      }
      setNodeState(node.id, { status: "error", note: message });
      toast.error(message);
    } finally {
      setRunning(null);
    }
  }, [accessToken, canvasApi, canvasId, onAgentRun, onCanvasSync, runAgentNode, running, setNodeState, toast]);

  const runAll = useCallback(async () => {
    if (running || !activeWorkflowNodes.length) return;
    for (const node of activeWorkflowNodes) {
      const latest = workflowElements(canvasApi).find((candidate) => candidate.id === node.id);
      if (latest) await runNode(latest);
    }
  }, [activeWorkflowNodes, canvasApi, runNode, running]);

  const selectNode = useCallback((node: WorkflowNode) => {
    canvasApi?.updateScene({ appState: { selectedElementIds: { [node.id]: true } } });
  }, [canvasApi]);

  const resetWorkflow = useCallback(() => {
    if (!workflowId) return;
    const next = (canvasApi.getSceneElements() as any[]).map((element) => {
      if (element.customData?.kind !== "workflow-node" || element.customData.workflowId !== workflowId) return element;
      const isSource = element.customData.nodeKind === "source";
      return {
        ...element,
        customData: {
          ...element.customData,
          status: isSource ? "success" : "idle",
          inputElementId: isSource ? element.customData.inputElementId : undefined,
          outputElementId: isSource ? element.customData.outputElementId : undefined,
          outputElementIds: undefined,
          previewUrl: isSource ? element.customData.previewUrl : undefined,
          outputLabel: isSource ? "原始图片" : "等待上一步输出",
          note: undefined,
        },
      };
    });
    canvasApi.updateScene({ elements: next, captureUpdate: "IMMEDIATELY" });
  }, [canvasApi, workflowId]);

  const activeSource = image ?? (activeWorkflowNodes[0] ? ({ id: activeWorkflowNodes[0].customData.inputElementId, type: "image" } as CanvasSelectedElement) : null);

  if (!open) return null;

  return (
    <div className="fixed left-0 top-0 z-30 flex h-full w-[320px] flex-col border-r border-border bg-card/95 shadow-float backdrop-blur-xl animate-in slide-in-from-left duration-200" onKeyDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
      <div className="flex h-[58px] shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-xl bg-foreground text-background"><Sparkles className="size-4" /></div>
          <div>
            <div className="text-sm font-semibold text-foreground">图案工作流</div>
            <div className="text-[11px] text-muted-foreground">从图片到四边无缝预览</div>
          </div>
        </div>
        <button type="button" className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" onClick={onClose} aria-label="关闭图案工作流"><X className="size-4" /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {!activeSource ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-5 text-center">
            <CircleDot className="mx-auto size-7 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium text-foreground">先选中一张图片</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">工作流会从当前图片创建透明图案、花纹和回位预览。</p>
          </div>
        ) : !workflowId ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-border bg-muted/40 p-3">
              <div className="flex items-center gap-3">
                <div className="size-14 overflow-hidden rounded-xl border border-border bg-background">
                  {fileDataUrl(canvasApi, elementById(canvasApi, activeSource.id)) ? <img src={fileDataUrl(canvasApi, elementById(canvasApi, activeSource.id))} alt="" className="h-full w-full object-cover" /> : null}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-foreground">当前图片</div>
                  <div className="mt-1 truncate text-[11px] text-muted-foreground">{activeSource.id}</div>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              {STEPS.map((step) => (
                <div key={step.kind} className="flex items-center gap-2 rounded-xl px-2 py-2 text-xs text-muted-foreground">
                  <span className="flex size-6 items-center justify-center rounded-lg bg-muted text-[10px] font-semibold text-foreground">{step.step}</span>
                  <span className="font-medium text-foreground">{step.title}</span>
                  <span className="truncate">{step.subtitle}</span>
                </div>
              ))}
            </div>
            <button type="button" onClick={createWorkflow} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-90"><Plus className="size-4" />创建工作流</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-2xl border border-border bg-muted/40 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">处理进度</span>
                <span className="tabular-nums text-muted-foreground">{progress}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${progress}%` }} /></div>
            </div>

            <div className="space-y-2">
              {activeWorkflowNodes.map((node, index) => {
                const status = node.customData.status ?? "idle";
                const isRunning = running === node.id;
                const previous = index > 0 ? activeWorkflowNodes[index - 1] : null;
                const ready = node.customData.nodeKind === "source" || Boolean(previous?.customData.outputElementId);
                return (
                  <div key={node.id} className={`rounded-2xl border p-3 transition-colors ${status === "error" ? "border-destructive/40 bg-destructive/5" : status === "warning" ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-card"}`}>
                    <button type="button" className="flex w-full items-start gap-2 text-left" onClick={() => selectNode(node)}>
                      <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-semibold ${status === "success" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : status === "running" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{isRunning ? <Loader2 className="size-3.5 animate-spin" /> : status === "success" ? <Check className="size-3.5" /> : node.customData.step}</span>
                      <span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-foreground">{node.customData.title}</span><span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{node.customData.outputLabel ?? node.customData.subtitle}</span></span>
                      <ChevronRight className="mt-1 size-3.5 text-muted-foreground" />
                    </button>
                    {node.customData.note ? <div className="mt-2 flex gap-1.5 text-[11px] leading-4 text-amber-700 dark:text-amber-300"><CircleAlert className="mt-0.5 size-3 shrink-0" /><span>{node.customData.note}</span></div> : null}
                    {node.customData.nodeKind !== "source" ? <div className="mt-2 flex items-center justify-between gap-2"><span className="text-[10px] text-muted-foreground">{ready ? "可运行" : "等待上一步"}</span><button type="button" disabled={!ready || running !== null} onClick={() => runNode(node)} className="flex h-7 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"><Play className="size-3" />运行</button></div> : null}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2">
              <button type="button" disabled={running !== null} onClick={runAll} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-foreground text-xs font-medium text-background hover:opacity-90 disabled:opacity-40"><Play className="size-3.5" />运行全部</button>
              <button type="button" disabled={running !== null} onClick={resetWorkflow} className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40"><RotateCcw className="size-3.5" />重置</button>
            </div>
            {activeWorkflowNodes.find((node) => node.customData.nodeKind === "repeat")?.customData.previewUrl ? (
              <button type="button" onClick={() => { const repeat = activeWorkflowNodes.find((node) => node.customData.nodeKind === "repeat"); const output = repeat ? elementById(canvasApi, repeat.customData.outputElementId) : null; const source = output ? fileDataUrl(canvasApi, output) : repeat?.customData.previewUrl; if (source) downloadDataUrl(source, "loomic-repeat-preview.png"); }} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-border text-xs font-medium text-foreground hover:bg-muted"><Download className="size-3.5" />下载循环预览</button>
            ) : null}
            <p className="text-[11px] leading-5 text-muted-foreground">每一步默认交给 Agent 调用对应工具并写回画布；如果 Agent 没有产出新元素，节点会保留当前结果并提示检查。</p>
          </div>
        )}
      </div>
    </div>
  );
}
