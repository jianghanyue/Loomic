"use client";

type Skill = {
  icon: React.ReactNode;
  label: string;
  prompt: string;
};

const PRESET_SKILLS: Skill[] = [
  {
    icon: (
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
      >
        <rect
          x="2"
          y="2"
          width="20"
          height="20"
          rx="3"
          stroke="currentColor"
          strokeWidth={1.5}
        />
        <rect
          x="5"
          y="14"
          width="4"
          height="6"
          rx="1"
          stroke="currentColor"
          strokeWidth={1.5}
        />
        <rect
          x="10"
          y="8"
          width="4"
          height="12"
          rx="1"
          stroke="currentColor"
          strokeWidth={1.5}
        />
        <rect
          x="15"
          y="11"
          width="4"
          height="9"
          rx="1"
          stroke="currentColor"
          strokeWidth={1.5}
        />
      </svg>
    ),
    label: "社媒轮播图",
    prompt: "帮我设计一组社交媒体轮播图，包含封面和多张内页，风格统一",
  },
  {
    icon: (
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth={1.5}
        />
        <path
          d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z"
          stroke="currentColor"
          strokeWidth={1.5}
        />
      </svg>
    ),
    label: "社交媒体",
    prompt: "帮我设计一张社交媒体海报，风格现代简洁",
  },
  {
    icon: (
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          d="M12 2L2 7l10 5 10-5-10-5z"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        <path
          d="M2 17l10 5 10-5"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M2 12l10 5 10-5"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    label: "Logo 与品牌",
    prompt: "帮我设计一个Logo和品牌视觉方案",
  },
  {
    icon: (
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
      >
        <rect
          x="3"
          y="3"
          width="7"
          height="7"
          rx="1.5"
          stroke="currentColor"
          strokeWidth={1.5}
        />
        <rect
          x="14"
          y="3"
          width="7"
          height="7"
          rx="1.5"
          stroke="currentColor"
          strokeWidth={1.5}
        />
        <rect
          x="3"
          y="14"
          width="7"
          height="7"
          rx="1.5"
          stroke="currentColor"
          strokeWidth={1.5}
        />
        <rect
          x="14"
          y="14"
          width="7"
          height="7"
          rx="1.5"
          stroke="currentColor"
          strokeWidth={1.5}
        />
      </svg>
    ),
    label: "分镜故事板",
    prompt: "帮我创建一组分镜故事板，用于展示创意概念",
  },
  {
    icon: (
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          d="M4 4h16v16H4z"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        <path d="M4 9h16M9 9v11" stroke="currentColor" strokeWidth={1.5} />
      </svg>
    ),
    label: "营销宣传册",
    prompt: "帮我设计一套营销宣传册页面，包含封面和内页",
  },
  {
    icon: (
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        <path
          d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </svg>
    ),
    label: "产品展示图",
    prompt: "帮我设计一组产品展示图，适合电商平台使用",
  },
  {
    icon: (
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          d="M3 4h18M3 10h18M3 16h18M3 22h18"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
        <path
          d="M6 2v20M12 2v20M18 2v20"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeDasharray="2 2"
        />
      </svg>
    ),
    label: "提花方向",
    prompt:
      "使用 $jacquard-textile-prompt，为我的提花面料 brief 生成三组差异明显的方向、英文生图 prompt、模型适配和 CAD/织厂交接检查单。先区分 concept、swatch 和 production 参数，不要编造织机规格。",
  },
  {
    icon: (
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          d="m12 2 2.4 5.1L20 9.5l-5.6 2.4L12 17l-2.4-5.1L4 9.5l5.6-2.4L12 2Z"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        <path
          d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      </svg>
    ),
    label: "织锦 / 云锦",
    prompt:
      "用原创 motif 做一款织锦或云锦气质的提花概念：处理主花、瑞鸟、云纹、边饰、色彩归并和丝金线的组织表达，给出 Midjourney、GPT Image、Firefly 适配 prompt，并标注文化与生产风险。",
  },
  {
    icon: (
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
      >
        <circle cx="7" cy="7" r="3.5" stroke="currentColor" strokeWidth={1.5} />
        <circle
          cx="17"
          cy="17"
          r="3.5"
          stroke="currentColor"
          strokeWidth={1.5}
        />
        <path
          d="M9.5 9.5 14.5 14.5M14.5 9.5 9.5 14.5"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </svg>
    ),
    label: "家纺连续花型",
    prompt:
      "使用 $home-textile-pattern，为床品、窗帘或软包设计三组连续花型方向；拆分主花、辅花、叶片和点缀元素，选择 half-drop / brick / tossed 回位，排布后执行 2×2 接缝检查，再说明 PNG/TIFF 导出参数。",
  },
  {
    icon: (
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
      >
        <rect
          x="3"
          y="3"
          width="18"
          height="18"
          rx="2"
          stroke="currentColor"
          strokeWidth={1.5}
        />
        <path
          d="M3 9h18M9 3v18M15 3v18M3 15h18"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeDasharray="2 2"
        />
      </svg>
    ),
    label: "回位质检",
    prompt:
      "检查这份纺织生图 prompt 或效果图：从 2×2 / 3×3 回位、边缘连续、色数、motif 层级、织物质感、浮长风险和适用模型逐项给出问题与可执行修订；不要把概念图称为 loom-ready。",
  },
];

type ChatSkillsProps = {
  onSend: (text: string) => void;
};

export function ChatSkills({ onSend }: ChatSkillsProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-4">
      <p className="text-sm font-semibold text-foreground">
        试试这些 Loomic Skills
      </p>
      <div className="flex max-w-[320px] flex-wrap justify-center gap-2">
        {PRESET_SKILLS.map((skill) => (
          <button
            key={skill.label}
            type="button"
            onClick={() => onSend(skill.prompt)}
            className="inline-flex h-9 max-w-full items-center justify-center gap-1 rounded-full border border-border bg-card px-[14px] text-sm text-foreground transition-colors hover:bg-muted active:bg-muted/80"
          >
            <span className="shrink-0 text-muted-foreground">{skill.icon}</span>
            <span className="truncate">{skill.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
