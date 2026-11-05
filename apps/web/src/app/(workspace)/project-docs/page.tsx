"use client";

import {
  Archive,
  ArrowDownToLine,
  ArrowLeft,
  ChevronRight,
  CircleCheck,
  CloudUpload,
  Download,
  FileCode2,
  FileText,
  Folder,
  FolderPlus,
  GitBranch,
  Grid2X2,
  List,
  Maximize2,
  MoreHorizontal,
  Network,
  Pencil,
  Plus,
  Search,
  Share2,
  Sparkles,
  Upload,
} from "lucide-react";
import { unzipSync, strFromU8 } from "fflate";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, ElementType, ReactNode } from "react";
import ReactMarkdown from "react-markdown";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { fetchUploadedFiles, uploadFile } from "@/lib/server-api";
import { cn } from "@/lib/utils";

type DocType = "md" | "pdf" | "docx" | "txt";
type PageView = "overview" | "documents" | "mindmap";

type ProjectDoc = {
  id: string;
  name: string;
  type: DocType;
  size: string;
  updated: string;
  folder: string;
  description: string;
  content?: string;
  file?: File;
  url?: string;
  assetId?: string;
  stored?: boolean;
};

const initialDocs: ProjectDoc[] = [];

const defaultFolders = ["项目根目录", "01 · 研究", "02 · 体验", "03 · 设计", "04 · 交付"];

const features = [
  { label: "AI 图像生成", detail: "文本生图、参考图与局部编辑", state: "已完成", progress: 100 },
  { label: "画布工作台", detail: "自由排布、图层与导出", state: "已完成", progress: 100 },
  { label: "品牌资产", detail: "字体、色板与品牌套件", state: "已完成", progress: 100 },
  { label: "提花研究库", detail: "生产约束与资料索引", state: "进行中", progress: 72 },
  { label: "团队交接", detail: "评审、版本与交付", state: "下一步", progress: 38 },
];

function formatToType(name: string, mimeType?: string | null): DocType | null {
  if (mimeType?.includes("pdf")) return "pdf";
  if (mimeType?.includes("wordprocessingml")) return "docx";
  if (mimeType === "text/plain") return "txt";
  if (mimeType?.includes("markdown")) return "md";
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "txt") return "txt";
  return null;
}

function assetName(objectPath: string) {
  const rawName = objectPath.split("/").pop() ?? "未命名文档";
  return rawName.replace(/^\d+-/, "");
}

function formatStoredDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileTypeIcon({ type, className }: { type: DocType; className?: string }) {
  const color = type === "pdf" ? "text-rose-500" : type === "docx" ? "text-blue-500" : type === "md" ? "text-violet-500" : "text-slate-500";
  return type === "md" ? (
    <FileCode2 className={cn(className, color)} />
  ) : (
    <FileText className={cn(className, color)} />
  );
}

function TypeBadge({ type }: { type: DocType }) {
  return (
    <span className={cn(
      "inline-flex min-w-10 items-center justify-center rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
      type === "pdf" && "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300",
      type === "docx" && "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300",
      type === "md" && "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300",
      type === "txt" && "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    )}>
      {type}
    </span>
  );
}

const PROJECT_FEATURE_BRANCHES = [
  { label: "AI 创作引擎", detail: "Agent 对话、图像/视频生成、图像操作", code: "server/agent · generation · features/image-ops", icon: <Sparkles size={14} /> },
  { label: "无限画布", detail: "画布编辑、图层、导出与生成结果", code: "web/canvas-editor · canvas-react-flow", icon: <Grid2X2 size={14} /> },
  { label: "项目与资产", detail: "项目生命周期、缩略图与工作区资产", code: "web/projects · server/http/projects.ts", icon: <Folder size={14} /> },
  { label: "文档档案室", detail: "Storage 上传、签名 URL、真实格式预览", code: "web/project-docs · server/http/uploads.ts", icon: <FileText size={14} /> },
  { label: "品牌与纺织", detail: "品牌套件、色板字体与提花研究", code: "web/brand-kit · web/textile-ai", icon: <Archive size={14} /> },
  { label: "工作区基础设施", detail: "认证、Credits、Skills 与设置", code: "auth-context · viewer · credits · skills", icon: <GitBranch size={14} /> },
] as const;

const MIND_MAP_PATHS = [
  "M450 260 C350 260, 275 78, 145 78",
  "M450 260 C355 260, 285 260, 145 260",
  "M450 260 C350 260, 275 442, 145 442",
  "M450 260 C550 260, 625 78, 755 78",
  "M450 260 C545 260, 615 260, 755 260",
  "M450 260 C550 260, 625 442, 755 442",
];

function MindMap({ compact = false }: { compact?: boolean }) {
  const positions = [
    "left-[3%] top-[7%]", "left-[3%] top-[38%]", "left-[3%] bottom-[7%]",
    "right-[3%] top-[7%]", "right-[3%] top-[38%]", "right-[3%] bottom-[7%]",
  ];
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-border bg-[#f8f8f5] dark:bg-[#171819]", compact ? "h-[240px]" : "min-h-[560px]")}>
      <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(20,20,20,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(20,20,20,0.05)_1px,transparent_1px)] [background-size:24px_24px] dark:opacity-20" />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 900 520" preserveAspectRatio="none" aria-hidden="true">
        {MIND_MAP_PATHS.map((path) => <path key={path} d={path} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-300 dark:text-slate-700" />)}
      </svg>
      <div className="absolute left-1/2 top-1/2 w-[min(230px,42%)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#c6df38] bg-[#ecf6a1] p-4 text-center shadow-[0_10px_30px_rgba(165,190,35,0.18)] dark:text-slate-900">
        <div className="mx-auto mb-2 flex size-8 items-center justify-center rounded-full bg-slate-950 text-[#ecf6a1]"><Sparkles size={15} /></div>
        <p className="text-sm font-semibold">Loomic 设计工作区</p>
        <p className="mt-1 text-[11px] text-slate-700">{PROJECT_FEATURE_BRANCHES.length} 个真实代码功能域</p>
      </div>
      {PROJECT_FEATURE_BRANCHES.map((branch, index) => <MindNode key={branch.label} className={positions[index]!} branch={branch} compact={compact} />)}
      {!compact && (
        <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>节点对应当前仓库已实现的功能模块</span>
          <span className="inline-flex items-center gap-1"><CircleCheck size={13} className="text-[#8ba500]" /> 已同步代码结构</span>
        </div>
      )}
    </div>
  );
}

function MindNode({ className, branch, compact }: { className: string; branch: (typeof PROJECT_FEATURE_BRANCHES)[number]; compact: boolean }) {
  return (
    <div className={cn("absolute w-[31%] rounded-xl border border-border bg-card/95 p-3 shadow-sm", compact && "p-2", className)}>
      <div className={cn("flex items-center gap-2 text-sm font-medium", compact && "text-[11px]")}><span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">{branch.icon}</span><span className="truncate">{branch.label}</span></div>
      <p className={cn("mt-2 text-[11px] leading-4 text-muted-foreground", compact && "mt-1 truncate text-[9px]")}>{branch.detail}</p>
      {!compact && <p className="mt-2 truncate font-mono text-[9px] text-[#718300]">{branch.code}</p>}
    </div>
  );
}

function MarkdownPreview({ content }: { content: string }) {
  return (
    <article className="markdown-content max-w-2xl px-6 py-7 text-[14px] leading-7 text-foreground sm:px-10">
      <ReactMarkdown>{content}</ReactMarkdown>
    </article>
  );
}

type DocxBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; text: string }
  | { kind: "table"; rows: string[][] };

const WORD_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function wordAttribute(element: Element, name: string) {
  return element.getAttributeNS(WORD_NAMESPACE, name) ?? element.getAttribute(`w:${name}`) ?? "";
}

function paragraphText(element: Element) {
  const textNodes = Array.from(element.getElementsByTagNameNS(WORD_NAMESPACE, "t"));
  return textNodes.map((node) => node.textContent ?? "").join("").trim();
}

function parseDocxXml(xml: string): DocxBlock[] {
  const xmlDocument = new DOMParser().parseFromString(xml, "application/xml");
  if (xmlDocument.getElementsByTagName("parsererror").length > 0) {
    throw new Error("DOCX XML could not be parsed");
  }
  const body = xmlDocument.getElementsByTagNameNS(WORD_NAMESPACE, "body")[0];
  if (!body) throw new Error("DOCX body is missing");

  const blocks: DocxBlock[] = [];
  for (const child of Array.from(body.children)) {
    if (child.localName === "p") {
      const text = paragraphText(child);
      if (!text) continue;
      const style = child.getElementsByTagNameNS(WORD_NAMESPACE, "pStyle")[0];
      const styleName = style ? wordAttribute(style, "val") : "";
      const isList = child.getElementsByTagNameNS(WORD_NAMESPACE, "numPr").length > 0;
      const headingMatch = styleName.match(/heading\s*([1-6])/i);
      if (headingMatch) blocks.push({ kind: "heading", level: Number(headingMatch[1]), text });
      else if (isList) blocks.push({ kind: "list", text });
      else blocks.push({ kind: "paragraph", text });
      continue;
    }
    if (child.localName === "tbl") {
      const rows = Array.from(child.getElementsByTagNameNS(WORD_NAMESPACE, "tr"))
        .map((row) => Array.from(row.getElementsByTagNameNS(WORD_NAMESPACE, "tc")).map((cell) => paragraphText(cell)))
        .filter((row) => row.some(Boolean));
      if (rows.length > 0) blocks.push({ kind: "table", rows });
    }
  }
  return blocks;
}

function DocxBlockView({ block }: { block: DocxBlock }) {
  if (block.kind === "heading") {
    const Heading = `h${Math.min(block.level, 6)}` as ElementType;
    return <Heading className="mt-6 text-lg font-semibold leading-tight text-slate-900 first:mt-0 dark:text-slate-100">{block.text}</Heading>;
  }
  if (block.kind === "list") return <li className="ml-5 pl-1 text-[15px] leading-7 text-slate-700 dark:text-slate-300">{block.text}</li>;
  if (block.kind === "table") {
    return <div className="my-5 overflow-x-auto"><table className="w-full border-collapse text-sm"><tbody>{block.rows.map((row, rowIndex) => <tr key={`row-${rowIndex}`} className={rowIndex === 0 ? "bg-slate-50 dark:bg-slate-800/80" : ""}>{row.map((cell, cellIndex) => { const Cell = rowIndex === 0 ? "th" : "td"; return <Cell key={`cell-${rowIndex}-${cellIndex}`} className="border border-slate-200 px-3 py-2 text-left align-top dark:border-slate-700">{cell}</Cell>; })}</tr>)}</tbody></table></div>;
  }
  return <p className="mt-4 text-[15px] leading-8 text-slate-700 dark:text-slate-300">{block.text}</p>;
}

function DocxPreview({ doc }: { doc: ProjectDoc }) {
  const [blocks, setBlocks] = useState<DocxBlock[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    async function loadDocument() {
      try {
        if (!doc.file && !doc.url) {
          setStatus("empty");
          return;
        }
        const bytes = doc.file
          ? await doc.file.arrayBuffer()
          : await (async () => {
              const response = await fetch(doc.url!);
              if (!response.ok) throw new Error(`Unable to fetch DOCX: ${response.status}`);
              return response.arrayBuffer();
            })();
        const zip = unzipSync(new Uint8Array(bytes));
        const documentXml = zip["word/document.xml"];
        if (!documentXml) throw new Error("word/document.xml is missing");
        const parsedBlocks = parseDocxXml(strFromU8(documentXml));
        if (cancelled) return;
        setBlocks(parsedBlocks);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }
    setStatus("loading");
    setBlocks(null);
    void loadDocument();
    return () => { cancelled = true; };
  }, [doc.file, doc.url]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 sm:px-12">
      <div className="mb-6 flex items-start justify-between border-b border-slate-200 pb-5 dark:border-slate-700">
        <div><p className="text-[11px] uppercase tracking-[0.18em] text-blue-600">Microsoft Word</p><h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{doc.name.replace(/\.docx$/i, "")}</h3><p className="mt-2 text-xs text-slate-500">真实文档预览 · 保留 Word 段落与表格结构</p></div>
        <TypeBadge type="docx" />
      </div>
      {status === "loading" && <div className="space-y-4"><div className="h-4 w-2/3 animate-pulse rounded bg-muted" /><div className="h-3 w-full animate-pulse rounded bg-muted" /><div className="h-3 w-11/12 animate-pulse rounded bg-muted" /><div className="h-24 animate-pulse rounded-xl bg-muted" /></div>}
      {status === "empty" && <p className="text-sm text-muted-foreground">该示例文档没有关联原始文件，请上传 DOCX 后查看真实内容。</p>}
      {status === "error" && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">DOCX 预览失败，请下载原文件查看。</div>}
      {status === "ready" && blocks && <div>{blocks.map((block, index) => block.kind === "list" ? <ul key={`list-${index}`} className="my-1 list-disc"><DocxBlockView block={block} /></ul> : <DocxBlockView key={`block-${index}`} block={block} />)}</div>}
    </div>
  );
}

function PdfPreview({ doc }: { doc: ProjectDoc }) {
  if (doc.url) return <iframe title={doc.name} src={doc.url} className="h-full min-h-[520px] w-full" />;
  return (
    <div className="flex min-h-[520px] items-center justify-center bg-[#e8e7e2] p-6 dark:bg-[#111213]">
      <div className="w-full max-w-[420px] bg-white p-8 shadow-xl dark:bg-slate-100 dark:text-slate-900">
        <div className="mb-7 flex items-center justify-between border-b border-slate-200 pb-3"><span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-600">PDF preview</span><span className="text-xs text-slate-400">01 / 06</span></div>
        <h3 className="text-2xl font-semibold tracking-tight">用户旅程</h3><p className="mt-2 text-sm text-slate-500">从灵感采集到生产交接</p>
        <div className="mt-8 space-y-4"><div className="h-20 rounded-lg bg-slate-100" /><div className="grid grid-cols-3 gap-3"><div className="h-16 rounded-md bg-slate-100" /><div className="h-16 rounded-md bg-slate-100" /><div className="h-16 rounded-md bg-slate-100" /></div><div className="space-y-2"><div className="h-2 w-full rounded bg-slate-100" /><div className="h-2 w-5/6 rounded bg-slate-100" /><div className="h-2 w-4/6 rounded bg-slate-100" /></div></div>
      </div>
    </div>
  );
}

function DocumentPreview({ doc }: { doc: ProjectDoc }) {
  return (
    <div className="h-full overflow-auto bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3 text-xs text-muted-foreground"><span className="flex items-center gap-2"><FileTypeIcon type={doc.type} className="size-4" /> {doc.name}</span><span>{doc.size}</span></div>
      {doc.type === "md" && <MarkdownPreview content={doc.content ?? "暂无 Markdown 内容"} />}
      {doc.type === "txt" && <pre className="whitespace-pre-wrap px-6 py-8 text-sm leading-7 text-muted-foreground sm:px-10">{doc.content}</pre>}
      {doc.type === "docx" && <DocxPreview doc={doc} />}
      {doc.type === "pdf" && <PdfPreview doc={doc} />}
    </div>
  );
}

export default function ProjectDocsPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { session } = useAuth();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project") ?? undefined;
  const [view, setView] = useState<PageView>("documents");
  const [docs, setDocs] = useState<ProjectDoc[]>(initialDocs);
  const [folders, setFolders] = useState(defaultFolders);
  const [activeFolder, setActiveFolder] = useState("全部文档");
  const [selectedId, setSelectedId] = useState("overview");
  const [query, setQuery] = useState("");
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [newFolder, setNewFolder] = useState("");
  const [showProjectEdit, setShowProjectEdit] = useState(false);
  const [projectName, setProjectName] = useState("织物智能设计");
  const [storageLoading, setStorageLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const selectedDoc = docs.find((doc) => doc.id === selectedId) ?? docs[0];
  const filteredDocs = useMemo(() => docs.filter((doc) => {
    const matchesFolder = activeFolder === "全部文档" || doc.folder === activeFolder;
    const matchesQuery = !query.trim() || `${doc.name} ${doc.description}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchesFolder && matchesQuery;
  }), [activeFolder, docs, query]);

  useEffect(() => {
    const accessToken = session?.access_token;
    if (!accessToken) return;
    let cancelled = false;
    setStorageLoading(true);
    fetchUploadedFiles(accessToken, projectId)
      .then(({ assets }) => {
        if (cancelled) return;
        const storedDocs = assets
          .map((item): ProjectDoc | null => {
            const name = assetName(item.asset.objectPath);
            const type = formatToType(name, item.asset.mimeType);
            if (!type) return null;
            return {
              id: item.asset.id,
              assetId: item.asset.id,
              name,
              type,
              size: formatFileSize(item.asset.byteSize ?? 0),
              updated: formatStoredDate(item.asset.createdAt),
              folder: "项目根目录",
              description: "已存储在 Supabase Storage",
              url: item.url,
              stored: true,
            } satisfies ProjectDoc;
          })
          .filter((doc): doc is ProjectDoc => doc !== null);
        setDocs((current) => [...storedDocs, ...current.filter((doc) => !doc.stored)]);
        void Promise.all(storedDocs.filter((doc) => doc.type === "md" || doc.type === "txt").map(async (doc) => {
          if (!doc.url) return;
          const response = await fetch(doc.url);
          if (!response.ok) return;
          const content = await response.text();
          if (!cancelled) setDocs((current) => current.map((item) => item.id === doc.id ? { ...item, content } : item));
        })).catch(() => undefined);
      })
      .catch(() => {
        if (!cancelled) setUploadError("无法读取 Supabase Storage 中的文档，请稍后重试。");
      })
      .finally(() => {
        if (!cancelled) setStorageLoading(false);
      });
    return () => { cancelled = true; };
  }, [projectId, session?.access_token]);

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const accessToken = session?.access_token;
    if (!accessToken) {
      setUploadError("登录状态已失效，请重新登录后上传。");
      return;
    }
    setUploadError(null);
    setUploading(true);
    const uploaded: ProjectDoc[] = [];
    for (const file of Array.from(files)) {
      try {
        const response = await uploadFile(accessToken, file, projectId);
        const type = formatToType(file.name, response.asset.mimeType);
        if (!type) throw new Error("Unsupported document type");
        uploaded.push({
          id: response.asset.id,
          assetId: response.asset.id,
          name: file.name,
          type,
          size: formatFileSize(file.size),
          updated: "刚刚",
          folder: activeFolder === "全部文档" ? "项目根目录" : activeFolder,
          description: "已存储在 Supabase Storage",
          url: response.url,
          file,
          stored: true,
          ...(type === "md" || type === "txt" ? { content: await file.text() } : {}),
        });
      } catch {
        setUploadError(`上传 ${file.name} 失败，请检查文件格式或登录状态。`);
      }
    }
    setUploading(false);
    if (!uploaded[0]) return;
    setDocs((current) => [...uploaded, ...current.filter((doc) => !uploaded.some((item) => item.id === doc.id))]);
    setSelectedId(uploaded[0].id);
    setView("documents");
  };

  const createFolder = () => {
    const value = newFolder.trim();
    if (!value || folders.includes(value)) return;
    setFolders((current) => [...current, value]);
    setActiveFolder(value);
    setNewFolder("");
    setShowFolderForm(false);
  };

  const downloadDoc = async (doc: ProjectDoc) => {
    let url: string;
    let shouldRevoke = false;
    if (doc.url) {
      try {
        const response = await fetch(doc.url);
        if (!response.ok) throw new Error(`download failed: ${response.status}`);
        url = URL.createObjectURL(await response.blob());
        shouldRevoke = true;
      } catch {
        window.open(doc.url, "_blank", "noopener,noreferrer");
        return;
      }
    } else {
      url = URL.createObjectURL(new Blob([doc.content ?? `${doc.name}\n\nLoomic 项目文档`], { type: doc.type === "pdf" ? "application/pdf" : "text/plain;charset=utf-8" }));
      shouldRevoke = true;
    }
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = doc.name;
    anchor.click();
    if (shouldRevoke) window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    uploadFiles(event.dataTransfer.files);
  };

  return (
    <div className="min-h-full bg-[#f4f4f0] px-4 py-5 text-foreground dark:bg-[#111212] sm:px-6 md:px-8 md:py-7">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground"><ArrowLeft size={14} /><span>项目</span><ChevronRight size={13} /><span className="text-foreground">项目档案室</span></div>
            <div className="flex items-center gap-3"><h1 className="text-[26px] font-semibold tracking-[-0.035em] sm:text-3xl">{projectName}</h1><button type="button" onClick={() => setShowProjectEdit((open) => !open)} className="rounded-md p-1.5 text-muted-foreground hover:bg-card hover:text-foreground" aria-label="编辑项目名称"><Pencil size={15} /></button><span className="rounded-full bg-[#e4ef93] px-2.5 py-1 text-[11px] font-semibold text-slate-800">设计研发中</span></div>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">项目文档、阶段进展和知识结构都在这里持续更新。</p>
            {showProjectEdit && <div className="mt-3 flex max-w-sm items-center gap-2 rounded-lg border border-border bg-card p-2"><input autoFocus value={projectName} onChange={(event) => setProjectName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && setShowProjectEdit(false)} className="h-8 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none" /><Button size="sm" onClick={() => setShowProjectEdit(false)}>保存</Button></div>}
          </div>
          <div className="flex items-center gap-2"><Button variant="outline" className="bg-card" onClick={() => setView("mindmap")}><Network size={15} /> 查看思维导图</Button><Button disabled={uploading} onClick={() => inputRef.current?.click()}><Upload size={15} /> {uploading ? "上传中…" : "上传文档"}</Button><input ref={inputRef} type="file" multiple accept=".docx,.pdf,.md,.txt" className="hidden" onChange={(event) => { void uploadFiles(event.target.files); event.currentTarget.value = ""; }} /></div>
        </header>
        {uploadError && <div className="mb-5 flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"><span>{uploadError}</span><button type="button" onClick={() => setUploadError(null)} aria-label="关闭提示"><MoreHorizontal size={16} /></button></div>}

        <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
          {[{ value: String(docs.length).padStart(2, "0"), label: "文档总数" }, { value: String(new Set(docs.map((doc) => doc.folder)).size).padStart(2, "0"), label: "活跃文件夹" }, { value: "78%", label: "项目完成度" }, { value: docs.length > 0 ? "刚刚" : "暂无", label: "最近更新" }].map((item) => <div key={item.label} className="bg-card px-4 py-3 sm:px-5"><p className="text-lg font-semibold tracking-tight sm:text-xl">{item.value}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{item.label}</p></div>)}
        </div>

        <div className="mb-5 flex items-center gap-1 border-b border-border">
          {(["overview", "documents", "mindmap"] as PageView[]).map((item) => <button key={item} type="button" onClick={() => setView(item)} className={cn("relative px-1 pb-3 mr-5 text-sm transition-colors", view === item ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>{item === "overview" ? "项目概览" : item === "documents" ? "文档管理" : "思维导图"}{view === item && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-foreground" />}</button>)}
        </div>

        {view === "overview" && <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-7"><div className="mb-6 flex items-start justify-between"><div><p className="text-xs font-medium text-muted-foreground">功能完成情况</p><h2 className="mt-1 text-xl font-semibold tracking-tight">这支项目已经走到哪里</h2></div><span className="inline-flex items-center gap-1 rounded-full bg-[#f2f7ce] px-2.5 py-1 text-[11px] font-medium text-[#647300]"><CircleCheck size={13} /> 3 项已完成</span></div><div className="space-y-5">{features.map((feature) => <div key={feature.label}><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium">{feature.label}</p><p className="mt-0.5 text-xs text-muted-foreground">{feature.detail}</p></div><span className={cn("text-[11px] font-medium", feature.state === "已完成" ? "text-[#718300]" : "text-muted-foreground")}>{feature.state}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", feature.state === "已完成" ? "bg-[#b6cf25]" : "bg-slate-400")} style={{ width: `${feature.progress}%` }} /></div></div>)}</div></div>
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-7"><div className="mb-5 flex items-start justify-between"><div><p className="text-xs font-medium text-muted-foreground">项目结构</p><h2 className="mt-1 text-xl font-semibold tracking-tight">从灵感到交付</h2></div><Button variant="ghost" size="icon-sm" onClick={() => setView("mindmap")} aria-label="放大思维导图"><Maximize2 size={15} /></Button></div><MindMap compact /></div>
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-7 xl:col-span-2"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-medium text-muted-foreground">最近更新</p><h2 className="mt-1 text-xl font-semibold tracking-tight">继续处理项目资料</h2></div><Button variant="outline" size="sm" className="bg-card" onClick={() => setView("documents")}>打开文档库 <ChevronRight size={14} /></Button></div><div className="grid gap-3 sm:grid-cols-3">{docs.slice(0, 3).map((doc) => <button key={doc.id} type="button" onClick={() => { setSelectedId(doc.id); setView("documents"); }} className="flex items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-muted"><span className="flex size-9 items-center justify-center rounded-lg bg-muted"><FileTypeIcon type={doc.type} className="size-4" /></span><span className="min-w-0"><span className="block truncate text-sm font-medium">{doc.name}</span><span className="mt-1 block text-[11px] text-muted-foreground">{doc.updated}</span></span></button>)}</div></div>
        </section>}

        {view === "mindmap" && <section className="rounded-2xl border border-border bg-card p-5 sm:p-7"><div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-medium text-muted-foreground">知识结构</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">项目思维导图</h2><p className="mt-2 text-sm text-muted-foreground">把研究、功能和交付节点放在同一张图里，快速定位需要补齐的文档。</p></div><div className="flex items-center gap-2"><Button variant="outline" size="sm" className="bg-card"><Share2 size={14} /> 分享</Button><Button size="sm" onClick={() => inputRef.current?.click()}><Plus size={14} /> 添加资料</Button></div></div><MindMap /></section>}

        {view === "documents" && <section className="grid min-h-[640px] gap-5 xl:grid-cols-[220px_minmax(390px,0.85fr)_minmax(420px,1.2fr)]">
          <aside className="rounded-2xl border border-border bg-card p-3"><div className="flex items-center justify-between px-2 py-2"><span className="text-xs font-medium text-muted-foreground">文件夹</span><button type="button" onClick={() => setShowFolderForm((show) => !show)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="创建文件夹"><FolderPlus size={15} /></button></div>{showFolderForm && <div className="mb-2 flex items-center gap-1 rounded-lg bg-muted p-1"><input autoFocus value={newFolder} onChange={(event) => setNewFolder(event.target.value)} onKeyDown={(event) => event.key === "Enter" && createFolder()} placeholder="文件夹名称" className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-xs outline-none" /><button type="button" onClick={createFolder} className="rounded bg-foreground px-2 py-1 text-[10px] text-background">创建</button></div>}{["全部文档", ...folders].map((folder) => <button key={folder} type="button" onClick={() => setActiveFolder(folder)} className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors", activeFolder === folder ? "bg-[#eef5ba] font-medium text-slate-900 dark:text-slate-900" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Folder size={15} className={activeFolder === folder ? "text-[#7b8e00]" : "text-muted-foreground"} /><span className="min-w-0 flex-1 truncate">{folder}</span>{folder !== "全部文档" && <span className="text-[10px] text-muted-foreground">{docs.filter((doc) => doc.folder === folder).length}</span>}</button>)}<div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { void handleDrop(event); }} className="mt-8 rounded-xl border border-dashed border-border p-3 transition-colors hover:border-[#b6cf25] hover:bg-[#fbfce9]"><CloudUpload size={17} className="text-muted-foreground" /><p className="mt-2 text-xs font-medium">拖放文件到这里</p><p className="mt-1 text-[11px] leading-4 text-muted-foreground">支持 DOCX、PDF、MD、TXT</p><button type="button" onClick={() => inputRef.current?.click()} className="mt-3 text-xs font-medium text-[#708000] hover:underline">选择文件上传</button></div></aside>
          <div className="flex min-h-[640px] flex-col overflow-hidden rounded-2xl border border-border bg-card"><div className="border-b border-border p-3"><div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2"><Search size={15} className="text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索当前项目文档" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" /><span className="text-[10px] text-muted-foreground">⌘ K</span></div><div className="mt-3 flex items-center justify-between"><span className="text-xs text-muted-foreground">{filteredDocs.length} 份文档</span><div className="flex items-center gap-1 text-muted-foreground"><button type="button" className="rounded p-1.5 text-foreground" aria-label="列表视图"><List size={15} /></button><button type="button" className="rounded p-1.5 hover:bg-muted" aria-label="网格视图"><Grid2X2 size={15} /></button></div></div></div><div className="flex-1 overflow-y-auto p-2">{filteredDocs.length === 0 ? <div className="flex h-full min-h-52 flex-col items-center justify-center text-center"><FileText size={25} className="text-muted-foreground" /><p className="mt-3 text-sm font-medium">没有找到文档</p><p className="mt-1 text-xs text-muted-foreground">换个关键词，或上传一份新资料。</p></div> : filteredDocs.map((doc) => <div key={doc.id} role="button" tabIndex={0} onClick={() => setSelectedId(doc.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(doc.id); } }} className={cn("group flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selectedId === doc.id ? "bg-[#f0f5c8] dark:bg-[#384014]" : "hover:bg-muted")}><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-card shadow-sm"><FileTypeIcon type={doc.type} className="size-4" /></span><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="truncate text-sm font-medium">{doc.name}</span><TypeBadge type={doc.type} /></span><span className="mt-1 block truncate text-[11px] text-muted-foreground">{doc.description}</span></span><span className="hidden shrink-0 text-right text-[10px] text-muted-foreground sm:block">{doc.updated}<br />{doc.size}</span><button type="button" onClick={(event) => { event.stopPropagation(); void downloadDoc(doc); }} aria-label={`下载 ${doc.name}`} className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-card hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"><Download size={15} /></button></div>)}</div><div className="border-t border-border px-4 py-3 text-[11px] text-muted-foreground">{storageLoading ? "正在同步 Supabase Storage…" : "文件已同步到 Supabase Storage"}</div></div>
          <div className="flex min-h-[640px] flex-col overflow-hidden rounded-2xl border border-border bg-card">{selectedDoc ? <><div className="flex items-center justify-between border-b border-border px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{selectedDoc.name}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{selectedDoc.folder} · 更新于 {selectedDoc.updated}</p></div><div className="flex items-center gap-1"><button type="button" onClick={() => void downloadDoc(selectedDoc)} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="下载当前文档"><Download size={16} /></button><button type="button" className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="更多操作"><MoreHorizontal size={16} /></button></div></div><div className="min-h-0 flex-1 overflow-auto"><DocumentPreview doc={selectedDoc} /></div></> : <div className="flex flex-1 flex-col items-center justify-center px-8 text-center"><div className="flex size-12 items-center justify-center rounded-2xl bg-muted"><FileText size={22} className="text-muted-foreground" /></div><h3 className="mt-4 text-sm font-medium">还没有文档</h3><p className="mt-2 max-w-xs text-xs leading-5 text-muted-foreground">上传第一份项目资料后，这里会显示真实的文档预览。</p><Button size="sm" className="mt-5" onClick={() => inputRef.current?.click()}><Upload size={14} /> 上传第一份文档</Button></div>}</div>
        </section>}
      </div>
    </div>
  );
}
