"use client";

import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleCheck,
  Copy,
  ExternalLink,
  Layers3,
  Search,
  SlidersHorizontal,
  Sparkles,
  Terminal,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

type LibraryFilter =
  | "全部"
  | "提花"
  | "连续花型"
  | "模型"
  | "系统提示词"
  | "Skill";

type PromptCard = {
  id: string;
  kind: Exclude<LibraryFilter, "全部">;
  title: string;
  eyebrow: string;
  model: string;
  palette: string;
  description: string;
  prompt: string;
  accent: string;
};

const filters: LibraryFilter[] = [
  "全部",
  "提花",
  "连续花型",
  "模型",
  "系统提示词",
  "Skill",
];

const loomCells = [
  "a1",
  "b1",
  "c1",
  "d1",
  "e1",
  "a2",
  "b2",
  "c2",
  "d2",
  "e2",
  "a3",
  "b3",
  "c3",
  "d3",
  "e3",
  "a4",
  "b4",
  "c4",
  "d4",
  "e4",
  "a5",
  "b5",
  "c5",
  "d5",
  "e5",
];

const promptCards: PromptCard[] = [
  {
    id: "damask",
    kind: "提花",
    title: "花卉大马士革",
    eyebrow: "JACQUARD / DAMASK",
    model: "GPT Image 2 · Midjourney",
    palette: "5 色 / 深靛蓝",
    description:
      "用清晰的轮廓层级和组织对比，把一张花卉图变成适合提花讨论的样卡。",
    prompt:
      "Create a seamless textile repeat for a jacquard damask fabric, not a fashion illustration. Motif: a large central peony with smaller camellia blossoms, curling stems and restrained leaves; clear silhouette hierarchy, calm negative space. Construction look: satin ground with subtle warp-dominant and weft-dominant contrast, visible yarn intersections and gentle woven relief, no ink. Repeat: half-drop, seamless on all four edges, medium-scale motifs. Palette: 5 colors only — deep indigo, muted celadon, old gold, warm ivory, charcoal. Flat orthographic swatch, no text, logos, watermarks or broken edge joins.",
    accent: "#b99a52",
  },
  {
    id: "yunjin",
    kind: "提花",
    title: "云锦织锦语汇",
    eyebrow: "BROCADE / ORIGINAL MOTIF",
    model: "GPT Image 2 · Firefly",
    palette: "6 色 / 金线感",
    description:
      "让云纹、牡丹和瑞鸟组成新的原创结构，不把历史图案直接复制到布面上。",
    prompt:
      "Design a seamless jacquard brocade repeat inspired by Chinese yunjin visual language, with original motifs rather than copying a historical artifact. Motif: paired auspicious birds, stylized peony, cloud-scroll borders and small geometric fillers; strong bilateral rhythm, readable outlines. Construction look: silk brocade, satin and twill weave contrast, raised relief created by yarn structure, warm gold yarn instead of printed glitter. Repeat: straight repeat with a small half-drop option. Palette: vermilion, imperial blue, jade green, warm gold, ivory and black; maximum 6 flat color families. Flat top-down swatch, no calligraphy or text.",
    accent: "#a54236",
  },
  {
    id: "tonal",
    kind: "提花",
    title: "低对比大马士革",
    eyebrow: "TONAL / UPHOLSTERY",
    model: "GPT Image 2",
    palette: "4 色 / 石灰调",
    description: "适合窗帘、靠垫和软包的安静版本：用组织差异取代印花渐变。",
    prompt:
      "A quiet tonal jacquard damask for premium upholstery, tone-on-tone only. Motif: abstract iris, vine and seed-pod silhouettes, with three depth levels. Construction: matte cotton warp, slightly lustrous viscose weft, satin-versus-plain weave contrast, very subtle relief, realistic woven yarn crossings. Repeat: 64 cm square concept repeat, straight repeat, perfectly seamless. Palette: warm stone, oat, mushroom and dark taupe; no more than four color families and no photographic shading. Orthographic swatch, evenly lit, production-minded textile CAD reference.",
    accent: "#7d8570",
  },
  {
    id: "geometric",
    kind: "连续花型",
    title: "几何提花",
    eyebrow: "GEOMETRIC / SUITING",
    model: "Midjourney --tile · SDXL Tile",
    palette: "4 色 / 羊毛混纺",
    description: "把线宽、间距和重复关系写清楚，避免模型生成不可能的格纹。",
    prompt:
      "A production-minded geometric jacquard repeat for a modern suiting fabric. Motif: interlocking herringbone, broken pinstripes and small windowpane checks, consistent line width, exact spacing, no hand-drawn wobble. Construction: wool-blend jacquard, twill and basket-weave contrast, crisp edges, low relief. Repeat: straight repeat, horizontal repeat clearly defined, seamless tile, orthographic top view. Palette: charcoal, cool grey, camel and one muted rust accent; four flat yarn color families. Avoid logos, letters, numbers, irregular perspective and gradients.",
    accent: "#47505a",
  },
  {
    id: "photo-to-jacquard",
    kind: "模型",
    title: "照片转提花",
    eyebrow: "IMAGE-TO-IMAGE / SWATCH",
    model: "GPT Image 2 · Firefly Reference",
    palette: "5 色 / 轮廓优先",
    description:
      "把主体轮廓、明暗块面和织造语言分别交给参考图，适合做图生图实验。",
    prompt:
      "Use Image 1 as the subject and Image 2 as the weave-language reference. Convert the subject into an original jacquard textile design while preserving the main silhouette, large light-dark masses and recognizable composition. Reduce the image to five flat yarn color families, simplify tiny details, close broken contours, and express tonal changes through weave structure rather than airbrushed gradients. Show a clean square textile swatch with visible warp/weft construction. Do not add objects, text, logos or photographic scenery.",
    accent: "#295b63",
  },
  {
    id: "macro",
    kind: "连续花型",
    title: "织物微观质感",
    eyebrow: "MATERIAL / MACRO",
    model: "GPT Image 2 · Flux",
    palette: "材质优先",
    description: "用于展示样卡质感；它是材质参考，不是织机点纸或组织图。",
    prompt:
      "Macro photograph-like render of a jacquard woven swatch, 5 cm field of view. Show individual warp and weft yarns, satin floats, small twill diagonals, yarn hairiness and a shallow relief; material is silk-cotton blend, soft directional light from upper left, accurate scale cues. The pattern is a small tone-on-tone damask, flat and repeatable, with no printed surface coating. No plastic, CGI gloss, leather, knitted loops, embroidery thread, text or watermark.",
    accent: "#c77654",
  },
  {
    id: "system",
    kind: "系统提示词",
    title: "纺织设计 Agent",
    eyebrow: "SYSTEM / OUTPUT CONTRACT",
    model: "GPT · Claude · Gemini",
    palette: "JSON / 6 字段",
    description:
      "把 brief、模型适配、生产备注和验证清单固定成可复用的输出协议。",
    prompt:
      "You are a Textile–Jacquard Prompt Engineer. Identify the textile category and stage first. For jacquard, explicitly handle motif hierarchy, repeat, palette reduction, weave contrast, float risk and edge continuity. Never invent hook capacity, density or loom settings; list them for CAD or mill confirmation. Return brief, assumptions, directions, model_adapter, production_notes, validation_checklist and provenance.",
    accent: "#a54236",
  },
  {
    id: "skill",
    kind: "Skill",
    title: "提花 Skill",
    eyebrow: "AGENT / WORKFLOW",
    model: "$jacquard-textile-prompt",
    palette: "回位 · 色彩 · CAD",
    description:
      "让 agent 先问真正影响结果的参数，再把概念图和生产交接拆开处理。",
    prompt:
      "$jacquard-textile-prompt: parse the brief, propose directions, generate bilingual model adapters, keep production assumptions explicit, and stop at concept or swatch stage until CAD and mill constraints are supplied.",
    accent: "#7d8570",
  },
];

const modelCards = [
  {
    name: "GPT Image 2/2.5",
    label: "多轮编辑",
    detail: "参考图角色清晰，适合从草图逐轮收敛到样卡。",
    color: "#295b63",
  },
  {
    name: "Midjourney",
    label: "--tile",
    detail: "风格和 motif 探索快，连续花型要做 2×2 回位检查。",
    color: "#a54236",
  },
  {
    name: "Firefly",
    label: "参考图",
    detail: "Style Reference、Generative Fill、Text to Pattern。",
    color: "#b99a52",
  },
  {
    name: "Pointcarre / Arahne",
    label: "CAD / loom",
    detail: "颜色归并、组织、浮长和织机文件交接。",
    color: "#7d8570",
  },
];

const sources = [
  [
    "Midjourney Tile",
    "https://docs.midjourney.com/hc/en-us/articles/32197978340109-Tile",
  ],
  [
    "OpenAI Image Prompting",
    "https://developers.openai.com/api/docs/guides/image-prompting",
  ],
  [
    "Adobe Firefly Style Reference",
    "https://helpx.adobe.com/firefly/web/work-with-images/generate-images/reference-images-for-styling.html",
  ],
  [
    "Arahne textile pattern guide",
    "https://www.arahne.eu/pdf/How_to_Use_AI_Image_Generators_for_Textile_Pattern_Design.pdf",
  ],
  ["Pointcarre Jacquard", "https://www.pointcarre.com/Jacquard-Software.php"],
  ["JACQ Art", "https://jacqart.co/"],
  [
    "Textile Pattern Generation Using Diffusion Models",
    "https://arxiv.org/abs/2304.00520",
  ],
  ["TextileBot", "https://arxiv.org/abs/2406.10590"],
];

const discoverySources = [
  {
    name: "skills.sh",
    kind: "SKILL DIRECTORY",
    detail: "公开 SKILL.md 目录与 CLI，适合按安装量找工作流。",
    url: "https://skills.sh/",
    color: "#295b63",
  },
  {
    name: "Anthropic Skills",
    kind: "OFFICIAL SPEC",
    detail: "官方 Skill 结构、渐进式披露和示例仓库。",
    url: "https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview",
    color: "#a54236",
  },
  {
    name: "SkillsMP",
    kind: "SKILL SEARCH",
    detail: "按职业、领域和仓库浏览公开 Skill，先读再安装。",
    url: "https://skillsmp.com/",
    color: "#7d8570",
  },
  {
    name: "PromptBase",
    kind: "PROMPT MARKET",
    detail: "按模型查 Image、Text、Video 和 Agent Skill。",
    url: "https://promptbase.com/marketplace",
    color: "#b99a52",
  },
  {
    name: "FlowGPT",
    kind: "PROMPT COMMUNITY",
    detail: "社区 prompt、bot 和用例，适合研究任务拆解。",
    url: "https://flowgpt.com/",
    color: "#47505a",
  },
  {
    name: "Civitai",
    kind: "MODEL GALLERY",
    detail: "SDXL/Flux/LoRA 样图、模型和生成参数参考。",
    url: "https://civitai.com/",
    color: "#295b63",
  },
  {
    name: "PromptHero",
    kind: "IMAGE PROMPTS",
    detail: "从图像结果反查构图、材质和视觉 prompt。",
    url: "https://prompthero.com/",
    color: "#a54236",
  },
  {
    name: "Agensi Security",
    kind: "SKILL SAFETY",
    detail: "第三方 Skill 的扫描、依赖与提示注入风险提醒。",
    url: "https://www.agensi.io/security",
    color: "#7d8570",
  },
];

const sourcePromptStudies = [
  {
    title: "Hand-printed cotton repeat",
    source: "PromptHero · Midjourney 3",
    sourceUrl: "https://prompthero.com/prompt/fc63adbc91a",
    excerpt: "realistic fabric, hand printed cotton… flower patterns repeat",
    adapted:
      "Flat orthographic swatch of hand-printed cotton, Indian and Japanese floral vocabulary, controlled half-drop repeat, five flat colors, clean edges, no paper background.",
    image:
      "https://assets.promptbase.com/Images%2FCPHGw3atuJKoN15TbNWR%2Fresized%2F1754927729789j_w_800x800.webp",
    model: "Midjourney 3 · 1024×1024",
    color: "#a54236",
  },
  {
    title: "Japanese textile repeat",
    source: "PromptHero · Midjourney 3",
    sourceUrl:
      "https://prompthero.com/prompt/788005ae1d6-midjourney-3-seamless-pattern-of-surreal-traditional-japanese-textiles-intricate-ornate-beautiful-colorful-organic-texture-map-flat-texture",
    excerpt: "seamless pattern of surreal traditional Japanese textiles…",
    adapted:
      "Original Japanese-inspired brocade repeat, stylized clouds, cranes and florals, flat texture map, six-color yarn palette, seamless on four edges, no copied historical artifact.",
    image:
      "https://assets.promptbase.com/Collages%2FCPHGw3atuJKoN15TbNWR%2Fresized%2F1754928108598_1000x1000.webp",
    model: "Midjourney 3 · 1024×1024",
    color: "#295b63",
  },
  {
    title: "Artisanal embroidery study",
    source: "PromptBase · Midjourney V7",
    sourceUrl:
      "https://promptbase.com/prompt/artisanal-embroidery-handstitched-fabrics",
    excerpt: "traditional textile craftsmanship with artistic composition",
    adapted:
      "Tactile textile artwork inspired by handstitched heritage craft, visible thread relief, restrained motif hierarchy, woven ground, five-color yarn palette, flat swatch plus macro crop; no printed-glitter look.",
    image:
      "https://assets.promptbase.com/Collages%2FCPHGw3atuJKoN15TbNWR%2Fresized%2F1754928108598_1000x1000.webp",
    model: "Midjourney V7 · 9 examples on source page",
    color: "#b99a52",
  },
  {
    title: "Seamless textile app",
    source: "PromptBase · Pattern Designer App",
    sourceUrl:
      "https://promptbase.com/app/seamless-textile-fabric-pattern-designer",
    excerpt:
      "repeating designs that flow smoothly in both horizontal and vertical directions",
    adapted:
      "Create a seamless jacquard concept repeat with [MOTIF], [PALETTE], and [REPEAT]; preserve a clean solid ground, balanced density and unbroken edges; return a 2×2 preview and production notes.",
    image: null,
    model: "PromptBase App · model selected by app",
    color: "#7d8570",
  },
  {
    title: "Ikat diamond repeat",
    source: "PromptUp · Midjourney / Gemini / ChatGPT",
    sourceUrl: "https://usepromptup.com/prompts/image-ikat-fabric-pattern/",
    excerpt: "seamless ikat-style textile pattern with blurred feathered edges",
    adapted:
      "Seamless ikat-inspired jacquard concept, blurred feathered edges translated into soft yarn transitions, geometric diamond motifs, subtle woven texture, traditional handloom feel, flat top view, one approved colorway.",
    image: null,
    model: "Midjourney · Gemini · ChatGPT",
    color: "#295b63",
  },
  {
    title: "Sanganeri block-print floral",
    source: "Texloom · tested textile prompt",
    sourceUrl:
      "https://texloom.studio/blog/ai-prompts-textile-pattern-generation",
    excerpt:
      "traditional Indian sanganeri block print florals, small motifs, densely packed",
    adapted:
      "Seamless tileable jacquard concept, traditional Indian sanganeri block-print florals, small motifs, densely packed all-over composition, deep indigo and cream yarn palette, simplified flat shapes, no ink bleed.",
    image: null,
    model: "Texloom tested · model unspecified",
    color: "#a54236",
  },
  {
    title: "Baroque damask repeat",
    source: "Texloom · tested textile prompt",
    sourceUrl:
      "https://texloom.studio/blog/ai-prompts-textile-pattern-generation",
    excerpt:
      "seamless tileable damask pattern, baroque ornamental scrolls and medallions",
    adapted:
      "Seamless tileable jacquard damask, baroque ornamental scrolls and medallions, highly detailed but readable at swatch scale, half-drop repeat, rich burgundy on warm cream, satin-versus-plain weave contrast.",
    image: null,
    model: "Texloom tested · model unspecified",
    color: "#b99a52",
  },
  {
    title: "Ditsy floral field",
    source: "Texloom · textile scale guide",
    sourceUrl: "https://texloom.studio/blog/create-ditsy-floral-pattern-ai",
    excerpt:
      "tiny scattered wildflowers, densely and evenly spread, non-directional tossed layout",
    adapted:
      "Tiny scattered wildflowers for a small-scale jacquard, densely and evenly spread, non-directional tossed layout, two-color dusty pink and sage on a cream ground, consistent spacing, seamless repeat.",
    image: null,
    model: "Texloom guide · model unspecified",
    color: "#7d8570",
  },
  {
    title: "Bold home textile print",
    source: "PromptBase · Gemini Image",
    sourceUrl:
      "https://promptbase.com/prompt/luxury-bold-fabric-print-generator-2",
    excerpt: "fabric print designs optimized for curtains, bedding, towels",
    adapted:
      "Create a premium jacquard home-textile concept for curtains or bedding: bold large-scale motif, controlled composition, clear black-outline hierarchy, calm ground, two to five yarn colors, no noisy micro-detail, square swatch and room-scale drape mockup.",
    image: null,
    model: "Gemini Image · 3.0-PRO-IMAGE",
    color: "#b99a52",
  },
  {
    title: "All-product seamless repeat",
    source: "PromptBase · Pattern App",
    sourceUrl: "https://promptbase.com/app/seamless-patterns-for-all-products",
    excerpt:
      "seamless pattern designs for bedsheets, towels, pillows and fabric prints",
    adapted:
      "Seamless textile repeat for [USE CASE], primary motif [SUBJECT], secondary elements [DETAILS], [AESTHETIC STYLE], approved palette [COLORS], all-over balanced density, clean ground, edge-matching 2×2 preview.",
    image: null,
    model: "PromptBase App · fields for subject, style and palette",
    color: "#295b63",
  },
  {
    title: "Art Deco geometric",
    source: "Texloom · geometric pattern guide",
    sourceUrl: "https://texloom.studio/blog/generate-geometric-patterns-ai",
    excerpt: "symmetrical sunburst and chevron motifs, angular stepped edges",
    adapted:
      "Seamless art-deco jacquard, symmetrical sunburst and chevron motifs, angular stepped edges, large-scale repeat, gold and black on deep emerald ground, high contrast, precise grid alignment, satin-versus-plain weave.",
    image: null,
    model: "Texloom guide · model unspecified",
    color: "#a54236",
  },
  {
    title: "Photo-to-textile repeat",
    source: "Texloom · image-to-image workflow",
    sourceUrl:
      "https://texloom.studio/blog/turn-photo-into-seamless-textile-pattern",
    excerpt:
      "reinterpret the photo as a pattern and close the seams in the same pass",
    adapted:
      "Use Image 1 as a motif source. Reinterpret it as a flat jacquard repeat with even motif distribution, no hero subject, simplified edges, five-color yarn palette, controlled half-drop layout and seamless edge continuation.",
    image: null,
    model: "Texloom image-to-image workflow",
    color: "#7d8570",
  },
  {
    title: "Exact upholstery reconstruction",
    source: "PromptHero · Flux Kontext / Seedream 5",
    sourceUrl: "https://prompthero.com/search?q=image_2",
    excerpt:
      "preserve the exact sofa geometry, scene and lighting while matching a fabric macro reference",
    adapted:
      "Use Image 1 as the room, Image 2 as sofa geometry and Image 3 as fabric macro reference. Preserve camera, seams, cushions and lighting; apply the exact jacquard upholstery material with proportional weave scale, no texture tiling, no geometry changes, photorealistic interior editorial shot.",
    image: null,
    model: "Flux Kontext · Seedream 5 examples",
    color: "#47505a",
  },
  {
    title: "Vintage botanical field",
    source: "Texloom · tested textile prompt",
    sourceUrl:
      "https://texloom.studio/blog/ai-prompts-textile-pattern-generation",
    excerpt: "vintage botanical illustration, detailed leaves and wildflowers",
    adapted:
      "Seamless textile repeat for jacquard, vintage botanical leaves and wildflowers, medium-high density, warm ochre and forest-green yarns, scattered naturalistic composition, simplified hand-drawn contours, flat swatch.",
    image: null,
    model: "Texloom tested · model unspecified",
    color: "#7d8570",
  },
  {
    title: "Tropical abstract field",
    source: "Texloom · tested textile prompt",
    sourceUrl:
      "https://texloom.studio/blog/ai-prompts-textile-pattern-generation",
    excerpt:
      "abstract tropical motifs, stylized palm leaves and exotic flowers",
    adapted:
      "Seamless jacquard concept, stylized palm leaves and exotic flowers, dense all-over coverage, vibrant teal, coral and golden-yellow yarns, flowing organic composition, controlled low-relief weave texture.",
    image: null,
    model: "Texloom tested · model unspecified",
    color: "#295b63",
  },
  {
    title: "Minimal Scandinavian repeat",
    source: "Texloom · tested textile prompt",
    sourceUrl:
      "https://texloom.studio/blog/ai-prompts-textile-pattern-generation",
    excerpt:
      "minimalist Scandinavian style, simple abstract shapes, sparse composition",
    adapted:
      "Minimal Scandinavian jacquard repeat, simple abstract shapes, sparse composition with generous negative space, muted grey and soft beige yarns, clean geometric weave, straight repeat, no printed gradients.",
    image: null,
    model: "Texloom tested · model unspecified",
    color: "#47505a",
  },
  {
    title: "Folk floral jacquard",
    source: "Texloom · tested textile prompt",
    sourceUrl:
      "https://texloom.studio/blog/ai-prompts-textile-pattern-generation",
    excerpt: "folk art floral motifs, stylized roses and daisies",
    adapted:
      "Folk-art jacquard repeat, stylized roses and daisies, symmetrical arrangement, bright red, yellow and blue yarns on ivory ground, flat clean shapes, medium-scale motif, no cultural artifact copying.",
    image: null,
    model: "Texloom tested · model unspecified",
    color: "#a54236",
  },
  {
    title: "Natural stone and moss texture",
    source: "Texloom · tested textile prompt",
    sourceUrl:
      "https://texloom.studio/blog/ai-prompts-textile-pattern-generation",
    excerpt: "organic natural texture, inspired by aged stone and moss",
    adapted:
      "Seamless jacquard texture inspired by aged stone and moss, medium-density irregular composition, soft grey-green and mossy-brown yarns, earthy painterly relief, quiet upholstery scale, no photographic cracks.",
    image: null,
    model: "Texloom tested · model unspecified",
    color: "#7d8570",
  },
  {
    title: "Colorway transfer workflow",
    source: "Texloom · Reinhard Color Transfer",
    sourceUrl:
      "https://texloom.studio/blog/reinhard-color-transfer-textile-colorways",
    excerpt:
      "preserve structural detail while adopting the color mood of a source image",
    adapted:
      "Keep the jacquard motif geometry, repeat, weave contrast and density unchanged. Transfer only the approved palette mood from Image 2 onto Image 1; preserve hard color boundaries, yarn families and production color names; return four labeled colorways.",
    image: null,
    model: "Reinhard LAB color transfer workflow",
    color: "#b99a52",
  },
];

const systemPrompt = `你是 Textile–Jacquard Prompt Engineer，专门把纺织 brief 转换为可执行的图像提示词、参考图说明和生产前检查单。

先识别品类（提花、印花、针织、绣花、家纺或服装效果图）和阶段（灵感、花型、样卡、CAD 交接、打样）。对提花必须显式处理 motif 层级、回位类型、经纬方向、色彩归并、组织对比、浮长风险和边缘连续性。

未提供 hook capacity、经纬密度、最大浮长、织机头型号或纱线规格时，不得自行编造；把它们列为“待 CAD/织厂确认”。每次输出都区分 concept_prompt、model_adapter、negative_prompt、production_notes 和 validation_checklist。参考图要分配角色，迭代时一次只改 1–2 个变量，并记录模型、seed、回位、色板和人工修改。

默认返回 JSON：brief、assumptions、clarifying_questions、directions、provenance。生图正文优先提供英文，同时给中文解释和可替换变量。`;

function CopyButton({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: (value: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onCopy(value)}
      className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[#1f211e]/15 bg-[#faf7f0]/70 px-3 text-xs font-semibold text-[#1f211e] transition hover:border-[#1f211e]/35 hover:bg-[#faf7f0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a52]"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? "已复制" : label}
    </button>
  );
}

export default function TextileAiPage() {
  const [activeFilter, setActiveFilter] = useState<LibraryFilter>("全部");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);

  const filteredPrompts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return promptCards.filter((card) => {
      const matchesFilter =
        activeFilter === "全部" || card.kind === activeFilter;
      const matchesQuery =
        !query ||
        [card.title, card.eyebrow, card.model, card.palette, card.description]
          .join(" ")
          .toLowerCase()
          .includes(query);
      return matchesFilter && matchesQuery;
    });
  }, [activeFilter, search]);

  const copyValue = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className="min-h-full overflow-x-hidden bg-[#f3efe7] text-[#1f211e]">
      <div className="pointer-events-none fixed inset-0 opacity-40 [background-image:linear-gradient(90deg,rgba(31,33,30,0.035)_1px,transparent_1px),linear-gradient(rgba(31,33,30,0.035)_1px,transparent_1px)] [background-size:32px_32px]" />
      <div className="relative mx-auto max-w-[1600px] px-4 pb-20 sm:px-8 lg:px-12">
        <header className="flex h-20 items-center justify-between border-b border-[#1f211e]/10">
          <Link
            href="/home"
            className="group inline-flex items-center gap-3"
            aria-label="返回 Loomic 首页"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1f211e] text-[#e8e0d1] transition-transform group-hover:rotate-12">
              <span className="h-3 w-3 rounded-full border border-[#e8e0d1]" />
            </span>
            <span className="text-sm font-semibold tracking-[-0.02em]">
              Loomic / Textile Lab
            </span>
          </Link>
          <div className="flex items-center gap-3 text-xs font-medium text-[#1f211e]/55">
            <span className="hidden sm:inline">研究资料 · 2026.10</span>
            <Link
              href="/skills"
              className="inline-flex items-center gap-1 rounded-full border border-[#1f211e]/15 px-3 py-1.5 transition hover:border-[#1f211e]/40 hover:bg-[#faf7f0]"
            >
              Skills <ArrowUpRight size={13} />
            </Link>
          </div>
        </header>

        <main>
          <section className="relative grid gap-10 py-12 sm:py-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] lg:items-center lg:gap-20 lg:py-20">
            <div className="relative z-10 max-w-3xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#1f211e]/15 bg-[#faf7f0]/60 px-3 py-1.5 text-[11px] font-semibold tracking-[0.12em] text-[#1f211e]/65">
                <Sparkles size={13} className="text-[#a54236]" />
                TEXTILE AI FIELD GUIDE
              </div>
              <h1 className="max-w-4xl text-[clamp(3.25rem,8vw,7.5rem)] font-semibold leading-[0.86] tracking-[-0.075em]">
                把灵感写成
                <span className="block text-[#295b63]">可以织出来的语言。</span>
              </h1>
              <p className="mt-8 max-w-xl text-base leading-7 text-[#1f211e]/65 sm:text-lg">
                面向提花、织锦和连续花型的提示词、模型地图与生产前检查单。先探索
                motif，再把颜色、组织和回位交给懂织机的工具。
              </p>
              <div className="mt-10 flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-[#1f211e] px-3 py-2 text-[#f3efe7]">
                  提花优先
                </span>
                <span className="rounded-full border border-[#1f211e]/15 bg-[#faf7f0]/65 px-3 py-2">
                  中英双语 prompt
                </span>
                <span className="rounded-full border border-[#1f211e]/15 bg-[#faf7f0]/65 px-3 py-2">
                  概念 ≠ 上机
                </span>
              </div>
            </div>

            <div className="relative min-h-[330px] overflow-hidden rounded-[2.6rem] border border-[#1f211e]/15 bg-[#1f211e] p-5 text-[#f3efe7] shadow-[12px_18px_0_rgba(31,33,30,0.08)] sm:min-h-[410px] sm:p-8">
              <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(90deg,transparent_48%,rgba(232,224,209,0.28)_49%,rgba(232,224,209,0.28)_51%,transparent_52%),linear-gradient(0deg,transparent_48%,rgba(232,224,209,0.18)_49%,rgba(232,224,209,0.18)_51%,transparent_52%)] [background-size:28px_28px]" />
              <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full border-[32px] border-[#b99a52]/70" />
              <div className="absolute -bottom-20 -left-16 h-56 w-56 rounded-full border-[22px] border-[#a54236]/70" />
              <div className="relative flex h-full flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-semibold tracking-[0.2em] text-[#e8e0d1]/55">
                      LOOM LOGIC / 001
                    </p>
                    <p className="mt-3 max-w-[180px] text-2xl font-medium leading-[0.95] tracking-[-0.06em]">
                      一张图，五道检查。
                    </p>
                  </div>
                  <Layers3 size={25} className="text-[#b99a52]" />
                </div>
                <div className="relative mx-auto mt-8 grid w-[min(70vw,270px)] grid-cols-5 gap-2 sm:w-[290px]">
                  {loomCells.map((cell, index) => (
                    <span
                      key={cell}
                      className="aspect-square rounded-[42%] border border-[#e8e0d1]/25"
                      style={{
                        background:
                          index % 7 === 0
                            ? "#b99a52"
                            : index % 5 === 0
                              ? "#a54236"
                              : index % 3 === 0
                                ? "#7d8570"
                                : "transparent",
                        opacity: index % 2 === 0 ? 0.9 : 0.35,
                        transform: `rotate(${(index % 5) * 9 - 18}deg)`,
                      }}
                    />
                  ))}
                </div>
                <div className="flex items-end justify-between border-t border-[#e8e0d1]/20 pt-4 text-[11px] text-[#e8e0d1]/60">
                  <span>warp / weft / repeat</span>
                  <span className="font-mono text-[#e8e0d1]/85">2×2 CHECK</span>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-3 border-y border-[#1f211e]/10 py-4 sm:grid-cols-3">
            {[
              ["31", "公开来源与研究"],
              ["08", "可复制 prompt 模块"],
              ["05", "生产前质量门槛"],
            ].map(([value, label]) => (
              <div
                key={label}
                className="flex items-baseline justify-between border-[#1f211e]/10 px-1 py-2 sm:block sm:border-r sm:last:border-r-0 sm:px-5"
              >
                <span className="font-mono text-3xl tracking-[-0.08em] text-[#a54236] sm:text-4xl">
                  {value}
                </span>
                <span className="ml-3 text-xs font-medium text-[#1f211e]/55 sm:ml-0 sm:mt-1 sm:block">
                  {label}
                </span>
              </div>
            ))}
          </section>

          <section className="pt-14 sm:pt-20" id="library">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-3 text-[11px] font-semibold tracking-[0.16em] text-[#a54236]">
                  THE LIBRARY
                </p>
                <h2 className="text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">
                  从 prompt 到样卡
                </h2>
              </div>
              <div className="flex w-full max-w-md items-center gap-3 rounded-full border border-[#1f211e]/15 bg-[#faf7f0]/70 px-4 py-2.5 focus-within:border-[#1f211e]/40">
                <Search size={17} className="shrink-0 text-[#1f211e]/45" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索 motif、模型或用途"
                  aria-label="搜索资料"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#1f211e]/40"
                />
                <SlidersHorizontal
                  size={16}
                  className="shrink-0 text-[#1f211e]/40"
                />
              </div>
            </div>
            <div
              className="mt-7 flex gap-2 overflow-x-auto pb-2"
              role="tablist"
              aria-label="资料筛选"
            >
              {filters.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  role="tab"
                  aria-selected={activeFilter === filter}
                  onClick={() => setActiveFilter(filter)}
                  className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a52] ${
                    activeFilter === filter
                      ? "bg-[#1f211e] text-[#f3efe7]"
                      : "border border-[#1f211e]/15 bg-[#faf7f0]/55 text-[#1f211e]/60 hover:border-[#1f211e]/35 hover:text-[#1f211e]"
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </section>

          <section className="mt-8 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <article className="relative overflow-hidden rounded-[2.3rem] bg-[#295b63] p-7 text-[#f3efe7] sm:p-9">
              <div className="absolute -right-10 -top-12 h-44 w-44 rounded-full border-[22px] border-[#e8e0d1]/15" />
              <div className="relative z-10 max-w-xl">
                <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.15em] text-[#d5e5dc]/75">
                  <CircleCheck size={14} /> PRODUCTION LENS
                </div>
                <h3 className="mt-8 max-w-md text-3xl font-medium leading-[0.98] tracking-[-0.06em] sm:text-4xl">
                  AI 先负责想象，CAD 再负责让它成立。
                </h3>
                <p className="mt-5 max-w-lg text-sm leading-6 text-[#e8e0d1]/70">
                  通用模型能快速生成
                  motif、配色和材质方向；真正的提花交接还要经过色彩归并、组织、浮长、密度与织机规格校验。
                </p>
                <div className="mt-8 flex flex-wrap gap-2 text-xs font-medium">
                  {["灵感", "回位", "色彩", "组织", "打样"].map(
                    (step, index) => (
                      <span
                        key={step}
                        className="inline-flex items-center gap-2 rounded-full border border-[#e8e0d1]/20 bg-[#1f211e]/15 px-3 py-2"
                      >
                        <span className="font-mono text-[#b99a52]">
                          0{index + 1}
                        </span>{" "}
                        {step}
                      </span>
                    ),
                  )}
                </div>
              </div>
            </article>
            <article className="rounded-[2.3rem] border border-[#1f211e]/15 bg-[#faf7f0]/75 p-7 sm:p-9">
              <p className="text-[11px] font-semibold tracking-[0.15em] text-[#a54236]">
                MODEL MAP
              </p>
              <div className="mt-7 space-y-5">
                {modelCards.map((model) => (
                  <div key={model.name} className="flex gap-3">
                    <span
                      className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: model.color }}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <p className="text-sm font-semibold">{model.name}</p>
                        <span className="font-mono text-[10px] text-[#1f211e]/45">
                          {model.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-[#1f211e]/55">
                        {model.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredPrompts.map((card) => (
              <article
                key={card.id}
                className="group flex min-h-[370px] flex-col rounded-[1.6rem] border border-[#1f211e]/12 bg-[#faf7f0]/70 p-5 transition hover:-translate-y-1 hover:border-[#1f211e]/30 hover:bg-[#faf7f0]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p
                      className="text-[10px] font-semibold tracking-[0.14em]"
                      style={{ color: card.accent }}
                    >
                      {card.eyebrow}
                    </p>
                    <h3 className="mt-3 text-2xl font-semibold tracking-[-0.055em]">
                      {card.title}
                    </h3>
                  </div>
                  <span
                    className="mt-1 h-5 w-5 rounded-full border-4 border-[#faf7f0] shadow-[0_0_0_1px_rgba(31,33,30,0.18)]"
                    style={{ backgroundColor: card.accent }}
                  />
                </div>
                <p className="mt-4 text-sm leading-6 text-[#1f211e]/60">
                  {card.description}
                </p>
                <div className="mt-5 flex flex-wrap gap-2 text-[10px] font-semibold text-[#1f211e]/55">
                  <span className="rounded-full bg-[#1f211e]/7 px-2.5 py-1">
                    {card.model}
                  </span>
                  <span className="rounded-full bg-[#1f211e]/7 px-2.5 py-1">
                    {card.palette}
                  </span>
                </div>
                <div className="mt-5 flex-1 rounded-xl border border-[#1f211e]/10 bg-[#1f211e]/[0.035] p-4">
                  <p className="line-clamp-6 font-mono text-[11px] leading-5 text-[#1f211e]/65">
                    {card.prompt}
                  </p>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-[#1f211e]/40">
                    CONCEPT PROMPT
                  </span>
                  <CopyButton
                    label="复制 prompt"
                    value={card.prompt}
                    copied={copied === card.id}
                    onCopy={(value) => copyValue(value, card.id)}
                  />
                </div>
              </article>
            ))}
            {filteredPrompts.length === 0 && (
              <div className="col-span-full rounded-[1.6rem] border border-dashed border-[#1f211e]/20 p-10 text-center text-sm text-[#1f211e]/55">
                没有找到匹配的资料，试试“damask”“Midjourney”或“提花”。
              </div>
            )}
          </section>

          <section className="mt-14 grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
            <article className="rounded-[2.3rem] bg-[#a54236] p-7 text-[#f3efe7] sm:p-9">
              <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.15em] text-[#f3efe7]/70">
                <Terminal size={14} /> SYSTEM PROMPT
              </div>
              <h2 className="mt-8 max-w-sm text-3xl font-medium leading-[0.98] tracking-[-0.06em]">
                让 agent 懂得“好看”和“可织”不是一回事。
              </h2>
              <p className="mt-5 max-w-sm text-sm leading-6 text-[#f3efe7]/70">
                这段系统提示词把
                brief、模型适配、生产备注和质量门槛放进同一个输出协议。
              </p>
              <button
                type="button"
                onClick={() => setShowSystemPrompt((value) => !value)}
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#f3efe7] px-4 py-2.5 text-xs font-semibold text-[#a54236] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f3efe7]"
              >
                {showSystemPrompt ? "收起系统提示词" : "展开系统提示词"}{" "}
                <ChevronDown
                  size={15}
                  className={
                    showSystemPrompt
                      ? "rotate-180 transition-transform"
                      : "transition-transform"
                  }
                />
              </button>
            </article>
            <article className="rounded-[2.3rem] border border-[#1f211e]/15 bg-[#1f211e] p-4 text-[#e8e0d1] sm:p-6">
              {showSystemPrompt ? (
                <div className="flex h-full flex-col">
                  <div className="flex items-center justify-between border-b border-[#e8e0d1]/15 px-2 pb-4">
                    <span className="font-mono text-[10px] text-[#e8e0d1]/50">
                      textile-jacquard.system.txt
                    </span>
                    <CopyButton
                      label="复制"
                      value={systemPrompt}
                      copied={copied === "system"}
                      onCopy={(value) => copyValue(value, "system")}
                    />
                  </div>
                  <pre className="mt-4 max-h-[360px] overflow-auto whitespace-pre-wrap px-2 pb-2 font-mono text-[11px] leading-6 text-[#e8e0d1]/75">
                    {systemPrompt}
                  </pre>
                </div>
              ) : (
                <div className="flex h-full min-h-[260px] flex-col justify-between rounded-[1.6rem] border border-[#e8e0d1]/10 p-6 sm:p-8">
                  <BookOpen size={25} className="text-[#b99a52]" />
                  <div>
                    <p className="font-mono text-[11px] text-[#e8e0d1]/45">
                      OUTPUT CONTRACT
                    </p>
                    <p className="mt-3 max-w-md text-xl leading-7 tracking-[-0.03em]">
                      brief / assumptions / directions / model_adapter /
                      production_notes / validation_checklist
                    </p>
                  </div>
                </div>
              )}
            </article>
          </section>

          <section className="mt-14 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <article className="rounded-[2.3rem] border border-[#1f211e]/15 bg-[#faf7f0]/75 p-7 sm:p-9">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.15em] text-[#7d8570]">
                    SKILL / READY TO USE
                  </p>
                  <h2 className="mt-4 text-3xl font-semibold tracking-[-0.06em]">
                    jacquard-textile-prompt
                  </h2>
                </div>
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#7d8570]/15 text-[#7d8570]">
                  <Layers3 size={19} />
                </span>
              </div>
              <p className="mt-5 max-w-xl text-sm leading-6 text-[#1f211e]/60">
                解析 brief、生成多模型适配器、输出生产备注，并在没有 CAD
                数据时停在概念/样卡阶段。
              </p>
              <div className="mt-7 flex flex-wrap gap-2">
                {["提花优先", "多模型", "回位检查", "颜色归并", "CAD 交接"].map(
                  (tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-[#1f211e]/12 px-3 py-1.5 text-xs font-medium text-[#1f211e]/60"
                    >
                      {tag}
                    </span>
                  ),
                )}
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <CopyButton
                  label="复制 skill 名称"
                  value="$jacquard-textile-prompt"
                  copied={copied === "skill"}
                  onCopy={(value) => copyValue(value, "skill")}
                />
                <span className="font-mono text-[10px] text-[#1f211e]/40">
                  skills/jacquard-textile-prompt/SKILL.md
                </span>
              </div>
            </article>
            <article className="rounded-[2.3rem] bg-[#b99a52] p-7 text-[#1f211e] sm:p-9">
              <p className="text-[11px] font-semibold tracking-[0.15em] text-[#1f211e]/55">
                FIVE GATES
              </p>
              <h2 className="mt-4 text-3xl font-semibold leading-[0.98] tracking-[-0.06em]">
                生产前，至少过这五关。
              </h2>
              <ul className="mt-7 space-y-3 text-sm font-medium">
                {[
                  "2×2 / 3×3 回位无接缝",
                  "色彩已按纱线或颜色库归并",
                  "每个层级都有组织策略",
                  "浮长、密度与 loom 参数待确认",
                  "效果图和生产文件分开命名",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check size={16} className="mt-0.5 shrink-0" /> {item}
                  </li>
                ))}
              </ul>
            </article>
          </section>

          <section className="mt-14 border-t border-[#1f211e]/10 pt-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.15em] text-[#a54236]">
                  SOURCE INDEX
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.06em]">
                  公开资料，从这里继续。
                </h2>
              </div>
              <p className="max-w-sm text-sm leading-6 text-[#1f211e]/55">
                官方文档确认能力，行业软件说明生产流程，论文提供模型和代理的研究依据。
              </p>
            </div>
            <div className="mt-7 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              {sources.map(([label, url]) => (
                <a
                  key={label}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center justify-between gap-3 border-b border-[#1f211e]/10 py-3 text-sm text-[#1f211e]/65 transition hover:border-[#1f211e]/40 hover:text-[#1f211e]"
                >
                  <span>{label}</span>
                  <ExternalLink
                    size={14}
                    className="shrink-0 opacity-40 transition group-hover:opacity-100"
                  />
                </a>
              ))}
            </div>
          </section>

          <section className="mt-14 border-t border-[#1f211e]/10 pt-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.15em] text-[#a54236]">
                  SOURCE PROMPT STUDIES
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.06em]">
                  从具体案例拆出可织版本。
                </h2>
              </div>
              <p className="max-w-sm text-sm leading-6 text-[#1f211e]/55">
                左侧保留来源和模型，右侧是为提花/纺织重写的适配版。带图案例只做来源预览，不代表再授权。
              </p>
            </div>
            <div className="mt-7 grid gap-4 lg:grid-cols-2">
              {sourcePromptStudies.map((study) => (
                <article
                  key={study.title}
                  className="group grid overflow-hidden rounded-[1.7rem] border border-[#1f211e]/12 bg-[#faf7f0]/70 sm:grid-cols-[150px_1fr]"
                >
                  <div className="relative min-h-[150px] overflow-hidden bg-[#1f211e]">
                    {study.image ? (
                      <img
                        src={study.image}
                        alt={`${study.title} 来源效果图`}
                        className="absolute inset-0 h-full w-full object-cover opacity-90 transition duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center p-5 text-center font-mono text-[10px] leading-4 text-[#e8e0d1]/65">
                        TEXT PROMPT
                        <br />
                        NO IMAGE PREVIEW
                      </div>
                    )}
                    <span className="absolute left-3 top-3 rounded-full bg-[#1f211e]/70 px-2 py-1 font-mono text-[9px] text-[#f3efe7]">
                      {study.model.split(" · ")[0]}
                    </span>
                  </div>
                  <div className="flex flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p
                          className="text-[10px] font-semibold tracking-[0.12em]"
                          style={{ color: study.color }}
                        >
                          {study.source}
                        </p>
                        <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em]">
                          {study.title}
                        </h3>
                      </div>
                      <a
                        href={study.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`打开 ${study.title} 来源`}
                        className="mt-1 text-[#1f211e]/35 transition hover:text-[#1f211e]"
                      >
                        <ExternalLink size={15} />
                      </a>
                    </div>
                    <p className="mt-4 border-l-2 border-[#1f211e]/15 pl-3 text-xs italic leading-5 text-[#1f211e]/50">
                      “{study.excerpt}”
                    </p>
                    <div className="mt-4 flex-1 rounded-xl bg-[#1f211e]/[0.035] p-3.5">
                      <p className="font-mono text-[11px] leading-5 text-[#1f211e]/65">
                        {study.adapted}
                      </p>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span className="text-[10px] font-semibold text-[#1f211e]/40">
                        TEXTILE ADAPTATION
                      </span>
                      <CopyButton
                        label="复制适配版"
                        value={study.adapted}
                        copied={copied === `study-${study.title}`}
                        onCopy={(value) =>
                          copyValue(value, `study-${study.title}`)
                        }
                      />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-14 border-t border-[#1f211e]/10 pt-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.15em] text-[#295b63]">
                  PROMPT &amp; SKILL MARKETS
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.06em]">
                  继续收集，从这些入口开始。
                </h2>
              </div>
              <p className="max-w-sm text-sm leading-6 text-[#1f211e]/55">
                Skill 目录适合找工作流，Prompt
                画廊适合看模型和结果。安装或迁移前先读原文与依赖。
              </p>
            </div>
            <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {discoverySources.map((source) => (
                <a
                  key={source.name}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex min-h-[150px] flex-col justify-between rounded-[1.35rem] border border-[#1f211e]/12 bg-[#faf7f0]/65 p-4 transition hover:-translate-y-0.5 hover:border-[#1f211e]/35 hover:bg-[#faf7f0]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p
                        className="text-[10px] font-semibold tracking-[0.12em]"
                        style={{ color: source.color }}
                      >
                        {source.kind}
                      </p>
                      <h3 className="mt-2 text-lg font-semibold tracking-[-0.04em]">
                        {source.name}
                      </h3>
                    </div>
                    <ExternalLink
                      size={14}
                      className="mt-1 shrink-0 text-[#1f211e]/35 transition group-hover:text-[#1f211e]"
                    />
                  </div>
                  <p className="mt-5 text-xs leading-5 text-[#1f211e]/55">
                    {source.detail}
                  </p>
                </a>
              ))}
            </div>
            <div className="mt-5 rounded-[1.35rem] border border-dashed border-[#1f211e]/20 bg-[#b99a52]/10 px-5 py-4 text-xs leading-5 text-[#1f211e]/65">
              纺织检索词：
              <span className="font-mono">
                jacquard · damask · brocade · seamless textile · weave structure
                · fabric swatch · yarn texture · colorway · textile CAD
              </span>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
