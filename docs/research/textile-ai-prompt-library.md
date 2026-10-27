# 纺织行业 AI 提示词、系统提示词与 Skill 资料库

> 检索日期：2026-10-27
> 范围：全球公开资料；重点是提花（jacquard）、织物连续花型、织物质感和从概念到 CAD/织机的交接。
> 约定：带“本库模板”标记的内容是根据公开资料和提花生产约束重新编写的可复用模板，不是任何公司的私有 system prompt。

来源分级：官方文档和论文用于确认能力/方法；商业产品页面的功能属于厂商自述，适合做工具候选，不等于独立性能评测；社区 prompt 文章只作为灵感种子，不能替代回位、色彩和织造验证。

## 0. 先区分两类结果

- **概念图/风格探索**：适合 GPT Image、Midjourney、Firefly、Stable Diffusion/Flux 等。目标是得到 motif、配色、构图、材质方向。
- **生产设计/上机文件**：必须经过提花 CAD 或织机软件的颜色归并、回位检查、组织分配、浮长修正、经纬密度和织机规格校验。通用生图模型生成的 PNG/JPG 不能直接被称为“可上机提花”。Arahne 的公开资料明确指出，AI 图像通常缺少提花所需的色彩归并，边界还需要人工修正；Pointcarre、JACQ Art 等专用系统才把图像、组织、颜色和 loom 输出放在同一流程里。

## 1. 全球公开资料索引

| 来源 | 类型 | 能直接借鉴的内容 | 适用环节 |
| --- | --- | --- | --- |
| [Midjourney Tile](https://docs.midjourney.com/hc/en-us/articles/32197978340109-Tile) | 官方文档 | `--tile` 生成可重复 tile；官方提醒放大可能破坏无缝边缘 | 概念花型、连续回位初稿 |
| [OpenAI Image Prompting](https://developers.openai.com/api/docs/guides/image-prompting) | 官方文档 | 用“结果/主体/细节/约束”组织提示；给参考图分配角色；编辑时明确只改什么 | GPT Image 的概念图、图生图、局部修订 |
| [OpenAI Image Generation](https://developers.openai.com/api/docs/guides/image-generation) | 官方文档 | GPT Image 支持生成、编辑、参考图和多轮迭代；适合把一张草图逐轮改成样卡 | 图生图、样卡迭代 |
| [Adobe Firefly Style Reference](https://helpx.adobe.com/firefly/web/work-with-images/generate-images/reference-images-for-styling.html) | 官方文档 | 用参考图控制风格、纹理、色彩和服装图案方向 | 设计语言统一、品牌/系列探索 |
| [Illustrator Text to Pattern](https://helpx.adobe.com/illustrator/desktop/use-generative-ai/generate-patterns.html) | 官方文档 | 在矢量工作流中生成图案，便于后续编辑 | 矢量花型、印花初稿 |
| [Arahne AI textile pattern guide](https://www.arahne.eu/pdf/How_to_Use_AI_Image_Generators_for_Textile_Pattern_Design.pdf) | 行业技术资料 | AI 生成与提花的断点：颜色归并、边缘清理、尺寸/密度和 hook 数量匹配 | 生产前检查、反例教育 |
| [ArahPaint](https://arahne.org/en/products/arahpaint/) | 专业 CAD/CAM | 无缝重复、自动/手动颜色归并、图像到提花、边界处理 | 印花/提花前处理 |
| [Pointcarre Jacquard](https://www.pointcarre.com/Jacquard-Software.php) | 专业 CAD/CAM | JacquardMaker 可由图像生成提花；支持纱线质量、色彩方案、技术表单、浮长修正 | 从图像到生产 |
| [JACQ Art](https://jacqart.co/) | 纺织专用平台 | 环形画布、自动回位、颜色归并、组织模拟、loom/CAD 导出 | 纺织原生的概念到生产流程 |
| [Textile Designer AI](https://www.textile-designer.ai/ai-pattern-generator) | 纺织图案工具 | 参考图、风格、颜色数量、色板和多版本生成 | 图案方向与配色 |
| [Refabric pattern API](https://docs.refabric.com/task-api-reference/pattern.generate/) | 纺织 API | 通过 prompt 和可选参考图生成 textile repeat | 批量生成/产品化 |
| [Textile Pattern Generation Using Diffusion Models](https://arxiv.org/abs/2304.00520) | 学术论文 | 纺织数据集 + 图像 caption + 专门微调，比通用基线更适合文本生成纺织花型 | 自建模型/LoRA 数据准备 |
| [Ulos motif synthesis](https://arxiv.org/abs/2607.06590) | 学术论文 | 在传统纹样数据上微调 Protogen v3.4 与 SD 1.4；研究报告中 Protogen 视觉指标更好 | 地域纹样、文化遗产方向 |
| [FabricGen / WeavingLLM](https://arxiv.org/abs/2603.07240) | 学术论文 | 从文字生成织造 draft 和织物参数，并同时考虑宏观纹理与微观结构 | 织造参数研究、程序化模拟 |
| [TextileBot](https://arxiv.org/abs/2406.10590) | 学术论文 | 用 taxonomy/结构化提示把通用 LLM 变成纺织领域代理；短、助理式的回答比百科式长回答更易用 | 系统提示词、纺织知识助手 |
| [DongCAD](https://dongcad.vercel.app/) | 实验性织造工具 | 以参数化数据流生成复杂/提花 draft | 组织探索、教育/实验 |
| [Weave Patterner](https://weave-patterner.com/) | 开源织造工具 | drawdown、颜色/组织预览、BMP 导出和多种织法 | 织造验证、教学 |

## 1.1 专门做 Skill / Prompt 的网站

这些站点适合继续扩充本库，但用途不同：Skill 目录提供可安装的 agent 工作流，Prompt 目录提供可观察的 prompt/模型/结果样本。它们都应先阅读原文、确认模型和许可，再迁移到纺织场景。

| 网站 | 类型 | 适合收集什么 | 可信度/使用提醒 |
| --- | --- | --- | --- |
| [skills.sh](https://skills.sh/) | Skill 目录与 CLI | 可按安装量浏览公开 `SKILL.md`，并用 `npx skills add` 安装 | 生态广、排序受匿名使用量影响；安装前阅读源码 |
| [Anthropic Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) / [anthropics/skills](https://github.com/anthropics/skills) | 官方规范与示例 | `SKILL.md`、渐进式披露、references/scripts/assets 结构 | 优先作为格式和质量基线；不是纺织专用库 |
| [SkillsMP](https://skillsmp.com/) | Skill 搜索与索引 | 按职业、领域、仓库查看 `SKILL.md`，可先读再决定是否安装 | 站点明确表示“索引不等于认证”；查看源仓库星标、更新和依赖 |
| [Agensi Security](https://www.agensi.io/security) | Skill 市场/安全说明 | 了解第三方 skill 的安全扫描、秘密检测和提示注入风险 | 有自动扫描，但仍需人工审阅命令、脚本和外部访问 |
| [ClaudeSkill](https://claudeskil.com/) | Claude/Codex 风格 Skill 市场 | 可浏览 `SKILL.md` 和提示工程相关技能 | 社区目录，适合找主题和结构，不直接信任可执行内容 |
| [Claude 4 World Skills](https://www.claude4world.com/skills/) | Skill 目录 | 大量 Claude Code 工作流、模型和 RAG 类技能 | 以社区发布为主，先查原 GitHub 来源 |
| [Awesome Claude Code](https://github.com/subinium/awesome-claude-code) | GitHub 精选清单 | 官方仓库、技能、插件、MCP 和教程的入口 | 清单本身是导航，不代表每个项目都经过安全审计 |
| [Awesome Claude Skills](https://awesomeclaudeskills.com/) | Skill 精选目录 | 设计、文档、浏览器自动化、开发和安全技能 | 适合发现高信号项目，仍需回到源仓库核验 |
| [PromptBase Marketplace](https://promptbase.com/marketplace) | 商业 Prompt/Skill 市场 | Image、Text、Video、Agent Skills，能按模型过滤 | 商业/社区混合；注意许可、版本和是否可迁移到纺织任务 |
| [FlowGPT](https://flowgpt.com/) | 社区 Prompt/应用库 | ChatGPT/Claude 等对话 prompt、用例和 bot 结构 | 社区内容质量差异大；适合看任务拆解和角色设定 |
| [Civitai](https://civitai.com/) | 开源模型与图像社区 | SDXL/Flux/LoRA 的模型、样图和生成参数/Prompt | 最适合研究开放模型；必须核对 checkpoint、LoRA 权重、采样器和许可 |
| [PromptHero](https://prompthero.com/) | 图像 Prompt/结果画廊 | Midjourney、Stable Diffusion、DALL·E 等视觉 prompt 参考 | 适合找构图、材质和风格关键词；不要直接把非织物 prompt 当生产规范 |
| [Agent Skills standard](https://agentskills.io/) | 跨平台开放标准 | 了解 `SKILL.md` 的跨平台约定和兼容边界 | 用于理解规范，不替代具体 Skill 的安全审查 |

### 适合纺织检索的关键词

在这些网站里优先组合搜索：`jacquard`、`damask`、`brocade`、`yunjin`、`seamless textile`、`surface pattern`、`weave structure`、`fabric swatch`、`yarn texture`、`colorway`、`half-drop repeat`、`upholstery fabric`、`textile CAD`、`loom-ready`。

### 收集规则

1. **Prompt 样本**：记录模型、版本、参考图、参数、negative prompt、许可和结果图，不只复制一段英文描述。
2. **Skill 样本**：先读 YAML frontmatter、触发条件、`SKILL.md`、references、scripts 和外部依赖，再判断是否能迁移到 Loomic。
3. **纺织适配**：把普通视觉 prompt 重新补上 substrate、construction、repeat、palette、texture 和 production constraints。
4. **安全**：任何会运行命令、上传文件、读取凭据、连接外部服务的 Skill 都按不受信任代码审查；公开目录的星标/安装量不能替代审查。
5. **生产状态**：网站里的生成图最多标为灵感或样卡；颜色归并、组织、浮长、密度和 loom 输出仍要进入专业 CAD 流程。

## 2. 模型与工具选择

| 目标 | 首选 | 备选 | 备注 |
| --- | --- | --- | --- |
| 视觉方向、灵感板、花材探索 | GPT Image 2/2.5 系列、Midjourney | Firefly、Imagen | GPT Image 适合多轮编辑；官方 API 目前列出 `gpt-image-2.5-sunburst`（偏精确编辑）和 `gpt-image-2.5-flare`（偏速度）；Midjourney 用 `--tile` 方便做连续 tile |
| 无缝重复初稿 | Midjourney `--tile` | JACQ Art、SDXL/Flux + Tile/ControlNet、Refabric | 仍需在 2×2 或 3×3 回位中检查接缝；不要把单张 tile 直接当生产稿 |
| 参考图改色/改组织质感 | GPT Image、Firefly Reference | Flux Kontext、SDXL img2img | 明确“只改变色板/组织，不改变 motif 边界” |
| 大批量、本地化、可微调 | SDXL/Flux + LoRA/ControlNet | 专门的纺织扩散模型 | 需要自建 tile、颜色、数据集和质检脚本 |
| 真实提花组织、颜色归并、浮长与 loom 输出 | Pointcarre、Arahne、JACQ Art | REACH Jacquard、Weave Patterner、DongCAD | 这些是 CAD/织造环节，不是通用生图模型 |
| 从文字生成织造参数/研究原型 | FabricGen/WeavingLLM 方向 | DongCAD + LLM 编排 | 论文原型不等于现成生产软件，必须二次验证 |

## 3. 提花提示词的参数骨架

把下面字段当作 prompt 的槽位，先填技术字段，再填风格词：

```text
[substrate] + [construction] + [motif] + [repeat] + [scale] +
[palette] + [contrast] + [texture] + [view] + [production constraints]
```

- `substrate`：silk / cotton / linen / wool / viscose；写清 matte、lustrous、slub、brushed 等可见特征。
- `construction`：damask jacquard、satin ground、double cloth、brocade、matelassé、figured weave。
- `motif`：花材/动物/几何/地域纹样，写清主次层级和轮廓，不只写“高级花纹”。
- `repeat`：seamless tile、straight repeat、half-drop、brick、mirror、tossed。
- `scale`：motif 高度、repeat 尺寸或 small/medium/large；提花需要与最终克重和用途相配。
- `palette`：颜色数量、色名和 HEX；生产草案建议明确 3–8 个主色，并在 CAD 中再次归并。
- `contrast`：warp-dominant / weft-dominant、high/low contrast、tonal damask。
- `texture`：visible warp/weft intersections、yarn slubs、subtle relief、no printed ink look。
- `view`：flat lay、orthographic swatch、macro weave、draped fabric、garment mockup。
- `production constraints`：只在已有织机规格时填写，例如 hook capacity、warp/weft density、maximum float length、selvedge；未知时写“留给 CAD 校验”，不要猜数值。

## 4. 可直接复制的生图提示词

### 4.1 提花花卉大马士革（主模板）

**推荐**：GPT Image 2/2.5（参考图/多轮编辑）、Midjourney（加 `--tile` 做初稿）、JACQ Art/Pointcarre（后续技术化）。API 名称以账号实际可用型号为准。

```text
Create a seamless textile repeat for a jacquard damask fabric, not a fashion illustration.
Motif: a large central peony with smaller camellia blossoms, curling stems and restrained leaves;
clear silhouette hierarchy, calm negative space, no isolated focal point.
Construction look: satin ground with subtle warp-dominant and weft-dominant contrast,
visible yarn intersections and gentle woven relief, no ink, no paper grain.
Repeat: half-drop, seamless on all four edges, medium-scale motifs, balanced all-over distribution.
Palette: 5 colors only — deep indigo #24304A, muted celadon #8FA596,
old gold #B99A52, warm ivory #E8E0D1, charcoal #292A2D.
View: flat orthographic textile swatch, square 1:1 composition, even studio light.
Exclude text, logos, watermarks, garment seams, photographic scenery, gradients that cannot be woven,
extra colors, cropped motifs and broken edge joins.
```

Midjourney 末尾可追加：`--tile --ar 1:1 --raw`。

### 4.2 中国织锦/云锦方向

**推荐**：GPT Image 2 + 1–2 张合法参考图；Firefly Style Reference；之后在提花 CAD 中重做组织。

```text
Design a seamless jacquard brocade repeat inspired by Chinese yunjin visual language,
with original motifs rather than copying a historical artifact.
Motif: paired auspicious birds, stylized peony, cloud-scroll borders and small geometric fillers;
strong bilateral rhythm, readable outlines, generous breathing space.
Construction look: silk brocade, satin and twill weave contrast, raised relief created by yarn structure,
subtle metallic-gold appearance expressed as warm gold yarn, never as printed glitter.
Repeat: straight repeat with a small half-drop option, seamless at left/right and top/bottom.
Palette: vermilion, imperial blue, jade green, warm gold, ivory, and black; maximum 6 flat color families.
Flat top-down swatch, textile design board, no people, no architecture, no calligraphy, no text,
no photorealistic wallpaper, no random gradients, no copied museum pattern.
```

### 4.3 低对比色调大马士革

```text
A quiet tonal jacquard damask for premium upholstery, tone-on-tone only.
Motif: abstract iris, vine and seed-pod silhouettes, with three depth levels.
Construction: matte cotton warp, slightly lustrous viscose weft, satin-versus-plain weave contrast,
very subtle relief, realistic woven yarn crossings.
Repeat: 64 cm square concept repeat, straight repeat, perfectly seamless on all edges.
Palette: warm stone #C8BBA7, oat #D9CFBF, mushroom #8F8578, dark taupe #514B45;
no more than four color families and no photographic shading.
Orthographic swatch, evenly lit, production-minded textile CAD reference.
```

### 4.4 几何提花（条纹/格/人字）

```text
A production-minded geometric jacquard repeat for a modern suiting fabric.
Motif: interlocking herringbone, broken pinstripes and small windowpane checks,
consistent line width, exact spacing, no hand-drawn wobble.
Construction: wool-blend jacquard, twill and basket-weave contrast, crisp edges, low relief.
Repeat: straight repeat, horizontal repeat clearly defined, seamless tile, orthographic top view.
Palette: charcoal, cool grey, camel, and one muted rust accent; four flat yarn color families.
Avoid logos, letters, numbers, irregular perspective, soft watercolor, gradients,
uneven line widths, broken seams and extra colors.
```

### 4.5 由照片/插画转提花概念

**推荐**：GPT Image 2/2.5 或 Firefly 先做图生图；再用 Pointcarre/Arahne/JACQ Art 做颜色归并与组织。

```text
Use Image 1 as the subject and Image 2 as the weave-language reference.
Convert the subject into an original jacquard textile design while preserving the main silhouette,
large light-dark masses and recognizable composition.
Reduce the image to five flat yarn color families, simplify tiny details, close broken contours,
and express tonal changes through weave structure rather than airbrushed gradients.
Show a clean square textile swatch, seamless repeat preview, visible warp/weft construction,
no printed ink, no photographic background, no text, no logo, no invented objects.
Do not change the subject's main silhouette or add colors outside the approved palette.
```

### 4.6 织物微观质感/组织模拟

```text
Macro photograph-like render of a jacquard woven swatch, 5 cm field of view.
Show individual warp and weft yarns, satin floats, small twill diagonals, yarn hairiness and a shallow relief;
material is silk-cotton blend, soft directional light from upper left, accurate scale cues.
The pattern is a small tone-on-tone damask, flat and repeatable, with no printed surface coating.
No plastic, no CGI gloss, no leather, no knitted loops, no embroidery thread, no text, no watermark.
```

### 4.7 服装/家纺效果图（只用于展示，不当作结构稿）

```text
Place the supplied jacquard swatch on a simple unbranded tailored jacket and matching cushion.
Preserve the swatch motif scale and direction across the visible surfaces; keep seams and folds natural.
Premium editorial product photography, neutral warm studio, front three-quarter view,
clear fabric texture and believable drape.
Do not redesign the motif, invent a different print, add logos or text, or treat the fabric as wallpaper.
```

### 4.8 系列化配色 prompt

```text
Generate six colorways of the same jacquard repeat.
Keep motif geometry, repeat size, scale, spacing, weave structure and camera view identical.
Only change the yarn palette. Return a labeled six-panel textile colorway board with no extra text:
A midnight indigo / old gold / ivory; B moss / tobacco / cream; C oxblood / blush / charcoal;
D mineral blue / silver grey / white; E terracotta / olive / sand; F black / warm grey / bone.
No motif drift, no layout drift, no additional colors, no logos, no watermark.
```

### 4.9 从 PromptHero / PromptBase 采集的具体案例

下面是公开页面里能确认到的具体案例。为控制版权和可迁移性，只保留短摘录，并把完整的“纺织适配版”重新写成适合本库的 prompt；不要把原页面的效果图或付费 prompt 当成自由素材。

| 来源案例 | 原页面可见信息 | 纺织适配版（本库改写） | 模型/参数 | 效果图 |
| --- | --- | --- | --- | --- |
| [PromptHero：realistic fabric](https://prompthero.com/prompt/fc63adbc91a) | 短摘录：`realistic fabric, hand printed cotton… flower patterns repeat` | `Flat orthographic swatch of hand-printed cotton, Indian and Japanese floral vocabulary, controlled half-drop repeat, 5 flat colors, clean edges, no paper background.` | Midjourney 3；原页 1024×1024 | 原页含展示图 |
| [PromptHero：Japanese textiles](https://prompthero.com/prompt/788005ae1d6-midjourney-3-seamless-pattern-of-surreal-traditional-japanese-textiles-intricate-ornate-beautiful-colorful-organic-texture-map-flat-texture) | 短摘录：`seamless pattern of surreal traditional Japanese textiles…` | `Original Japanese-inspired brocade repeat, stylized clouds, cranes and florals, flat texture map, 6-color yarn palette, seamless on four edges, no copied historical artifact.` | Midjourney 3；原页 1024×1024 | 原页含展示图 |
| [PromptHero：fabric art](https://prompthero.com/search?model=Midjourney&q=fabric+art&sort=newest) | 线程、羊毛、刺绣和 coarse stitching texture 的组合 | `Top-down textile art study of multicolored wool threads on a warm ivory ground, controlled stitch rhythm, tactile macro detail, simple repeatable motif, no central poster composition.` | Midjourney；原页含 `--raw`、`--stylize` 示例 | 原搜索页含多张图 |
| [PromptBase：Seamless Textile Fabric Pattern Designer](https://promptbase.com/app/seamless-textile-fabric-pattern-designer) | 目标是水平/垂直无缝、统一色板和干净底色 | `Create a seamless jacquard concept repeat with [MOTIF], [PALETTE], and [REPEAT]; preserve clean solid ground, balanced density, no edge breaks; return a 2×2 preview and a production-notes block.` | PromptBase App；模型由应用选择 | 原页有示例入口 |
| [PromptBase：Artisanal Embroidery](https://promptbase.com/prompt/artisanal-embroidery-handstitched-fabrics) | Midjourney V7；传统工艺、手工刺绣、触觉艺术 | `Tactile textile artwork inspired by handstitched heritage craft, visible thread relief, restrained motif hierarchy, woven ground, 5-color yarn palette, flat swatch plus macro crop; no printed-glitter look.` | Midjourney V7 | 原页展示 9 个示例 |
| [PromptBase：Fabric Creator](https://promptbase.com/prompt/fabric-creator) | GPT-4 Turbo；输入用途、性能和审美偏好，输出材料与制造建议 | `Act as a textile development assistant. Given use case, fiber, performance requirements, target handfeel and palette, return 3 fabric concepts with construction, weave/finish risks, colorway and CAD questions.` | GPT-4 Turbo | 文本输出，无图 |
| [PromptUp：Ikat fabric pattern](https://usepromptup.com/prompts/image-ikat-fabric-pattern/) | 26-word prompt；Ikat、模糊边缘、几何菱形、平视纹样；页面列出 Midjourney、Gemini、ChatGPT | `Seamless ikat-inspired jacquard concept, blurred feathered edges translated into soft yarn transitions, geometric diamond motifs, subtle woven texture, flat top view, one approved colorway.` | Midjourney / Gemini / ChatGPT；页面有示例图 | 原页含 AI-generated example |
| [Texloom：10 AI Prompts](https://texloom.studio/blog/ai-prompts-textile-pattern-generation) | 10 个测试方向：Sanganeri、几何、复古植物、Art Deco、Ikat、Baroque damask 等；强调 motif、density、palette、composition、seamless constraint | `Seamless tileable jacquard concept, traditional Indian sanganeri block-print florals, small motifs, densely packed all-over composition, deep indigo and cream yarn palette, simplified flat shapes.` | Texloom tested；具体底层模型未公开 | 页面有文章配图 |
| [Texloom：Ditsy Floral](https://texloom.studio/blog/create-ditsy-floral-pattern-ai) | 明确 tiny、dense、scattered、non-directional、2–4 色和先生成后回位 | `Tiny scattered wildflowers for a small-scale jacquard, densely and evenly spread, non-directional tossed layout, dusty pink and sage on cream, consistent spacing, seamless repeat.` | Texloom guide；具体底层模型未公开 | 页面有文章配图 |
| [Moire：Print and pattern](https://moire.club/articles/ai-image-generation/ai-print-pattern-generation) | 比较 houndstooth、plaid、stripes、polka dots、herringbone、floral、paisley、ikat 的可控性 | `Medium-scale herringbone jacquard suiting, exact V-shaped repeat, charcoal and camel yarns, crisp line width, straight repeat, no pattern drift at seams.` | 纺织/时装图像生成方法文章；未指定单一模型 | 页面展示四组 pattern swatches |
| [Collective Brain：Seamless pattern generator](https://collectivebrain.de/en/ai-prompts/) | Midjourney；输入 motif、style、colours，目标是无可见接缝的连续图案 | `Seamless jacquard repeat, [MOTIF], [STYLE], [PALETTE], balanced all-over density, flat orthographic swatch, edge-matching tile, no central focal point.` | Midjourney | 入口页有 prompt 卡片 |
| [PromptBase：Bold Fabric Prints](https://promptbase.com/prompt/luxury-bold-fabric-print-generator-2) | Gemini Image；专门面向 curtains、bedding、towels 和其他家纺的大胆大图案 | `Create a premium jacquard home-textile concept for curtains or bedding: bold large-scale motif, controlled composition, calm ground, two to five yarn colors, no noisy micro-detail, square swatch and room-scale drape mockup.` | Gemini Image / 3.0-PRO-IMAGE | 原页有 9 个示例 |
| [PromptBase：Seamless Patterns for All Products](https://promptbase.com/app/seamless-patterns-for-all-products) | 家纺/印花通用 App；输入主题、辅元素、风格和色板，输出可用于床品、毛巾、枕头等的重复图案 | `Seamless textile repeat for [USE CASE], primary motif [SUBJECT], secondary elements [DETAILS], [STYLE], approved palette [COLORS], balanced all-over density, clean ground, edge-matching 2×2 preview.` | PromptBase App | 原页有可点击示例 |
| [Texloom：Geometric Patterns](https://texloom.studio/blog/generate-geometric-patterns-ai) | Art Deco、chevron、honeycomb、grid；强调精确几何、尺度、对称和无缝验证 | `Seamless art-deco jacquard, symmetrical sunburst and chevron motifs, angular stepped edges, large-scale repeat, gold and black on deep emerald ground, precise grid alignment, satin-versus-plain weave.` | Texloom guide；模型未公开 | 页面有教程配图 |
| [Texloom：Photo to Seamless Textile](https://texloom.studio/blog/turn-photo-into-seamless-textile-pattern) | 图生图工作流：把照片重新解释为图案，并在同一流程中闭合边缘 | `Use Image 1 as a motif source. Reinterpret it as a flat jacquard repeat with even motif distribution, no hero subject, simplified edges, five-color yarn palette, half-drop layout and seamless edge continuation.` | Texloom image-to-image workflow | 页面有流程图/效果说明 |
| [PromptHero：Upholstery reconstruction](https://prompthero.com/search?q=image_2) | Flux Kontext、Seedream 5 示例；三张参考图分别控制场景、家具几何和面料微观质感 | `Use Image 1 as the room, Image 2 as sofa geometry and Image 3 as fabric macro reference. Preserve camera, seams, cushions and lighting; apply proportional jacquard weave scale, no texture tiling, no geometry changes.` | Flux Kontext / Seedream 5 examples | 搜索页含效果图与长 negative prompt |
| [Texloom：Vintage botanical](https://texloom.studio/blog/ai-prompts-textile-pattern-generation) | 复古植物、叶片、野花、中高密度、赭石和森林绿 | `Seamless textile repeat for jacquard, vintage botanical leaves and wildflowers, medium-high density, warm ochre and forest-green yarns, scattered naturalistic composition, simplified hand-drawn contours.` | Texloom tested；模型未公开 | 文章配图 |
| [Texloom：Tropical abstract](https://texloom.studio/blog/ai-prompts-textile-pattern-generation) | 热带叶片、异域花朵、高密度、青绿/珊瑚/金黄 | `Seamless jacquard concept, stylized palm leaves and exotic flowers, dense all-over coverage, vibrant teal, coral and golden-yellow yarns, flowing organic composition, controlled low-relief weave texture.` | Texloom tested；模型未公开 | 文章配图 |
| [Texloom：Minimal Scandinavian](https://texloom.studio/blog/ai-prompts-textile-pattern-generation) | 极简抽象形、低密度、留白、灰色与米色 | `Minimal Scandinavian jacquard repeat, simple abstract shapes, sparse composition with generous negative space, muted grey and soft beige yarns, clean geometric weave, straight repeat.` | Texloom tested；模型未公开 | 文章配图 |
| [Texloom：Folk art floral](https://texloom.studio/blog/ai-prompts-textile-pattern-generation) | 民间艺术花卉、玫瑰、雏菊、对称排列 | `Folk-art jacquard repeat, stylized roses and daisies, symmetrical arrangement, bright red, yellow and blue yarns on ivory ground, flat clean shapes, medium-scale motif.` | Texloom tested；模型未公开 | 文章配图 |
| [Texloom：Natural stone and moss](https://texloom.studio/blog/ai-prompts-textile-pattern-generation) | 石头与苔藓自然纹理、灰绿和苔褐 | `Seamless jacquard texture inspired by aged stone and moss, medium-density irregular composition, soft grey-green and mossy-brown yarns, earthy painterly relief, quiet upholstery scale.` | Texloom tested；模型未公开 | 文章配图 |
| [Texloom：Reinhard color transfer](https://texloom.studio/blog/reinhard-color-transfer-textile-colorways) | 保留目标图结构，转移来源图色彩气氛；适合批量色way | `Keep jacquard motif geometry, repeat, weave contrast and density unchanged. Transfer only the approved palette mood from Image 2 onto Image 1; preserve hard color boundaries and yarn families; return four labeled colorways.` | Reinhard LAB color transfer workflow | 页面有流程图 |

可复用的采集方法是：先保留来源 prompt 的模型、版本、尺寸和参数，再把“纺织行业约束”补回去——substrate、construction、repeat、palette、texture 和 production notes。PromptHero 的页面更适合研究“模型词汇和参数”，PromptBase 的页面更适合研究“变量化输入和应用流程”。

部分 PromptBase 展示图的直链可用于网页缩略图预览：

- [Artisanal Embroidery collage](https://assets.promptbase.com/Collages%2FCPHGw3atuJKoN15TbNWR%2Fresized%2F1754928108598_1000x1000.webp)
- [Artisanal Embroidery sample](https://assets.promptbase.com/Images%2FCPHGw3atuJKoN15TbNWR%2Fresized%2F1754927729789j_w_800x800.webp)

这些直链仅用于回到来源页面的视觉预览，页面内容的再发布、商业使用和下载权限仍以原站条款为准。

## 5. 负面提示词模块

按模型选择其中一组，不必全部堆叠：

```text
broken repeat, visible seam, cropped motif, central poster composition, uneven spacing,
random extra objects, text, logo, watermark, paper texture, painted canvas, plastic CGI sheen,
photographic background, embroidery, knit loops, lace, leather, gradient banding, too many colors,
blurry edges, melted geometry, inconsistent motif scale, impossible yarn crossings
```

提花生产检查要补充：

```text
Do not claim loom-ready output. Do not invent hook capacity, density, float limits,
yarn count or weave draft unless supplied by the mill. Keep production values as explicit assumptions.
```

## 6. 本库系统提示词（可放到 GPT/Claude/Gemini 的 system/developer 层）

```text
你是 Textile–Jacquard Prompt Engineer，专门把纺织 brief 转换为可执行的图像提示词、参考图说明和生产前检查单。

你的目标有两个：
1) 帮设计师快速得到可比较的 motif、配色、质感和连续花型方向；
2) 把概念输出和提花生产约束分开，避免把普通 AI 图片误报为可直接上机的 loom-ready 文件。

工作规则：
- 先识别品类（提花、印花、针织、绣花、家纺或服装效果图）和阶段（灵感、花型、样卡、CAD 交接、打样）。
- 缺少会改变结果的参数时，只问必要问题：纤维/纱线、目标用途、回位方式与尺寸、色数/色板、织机或 CAD 约束、参考图权限。
- 如果用户只要灵感，默认输出 3 个差异明显的方向；如果用户给了明确 brief，直接生成并说明假设。
- 对提花必须显式处理：motif 层级、回位类型、经纬方向、色彩归并、组织对比、浮长风险、边缘连续性和最终检查。
- 未提供 hook capacity、经纬密度、最大浮长、织机头型号或纱线规格时，不得自行编造；把它们列为“待 CAD/织厂确认”。
- 参考图只作为风格、构图、色彩或材质角色使用；不要复制可识别品牌、受版权保护的图案或文化遗产原件。
- 每次输出都要区分：`concept_prompt`（概念生图）、`model_adapter`（模型参数/操作）、`negative_prompt`、`production_notes`（生产备注）、`validation_checklist`（验证项）。
- 提示词优先用清晰的短句和分段标签：结果/主体/结构/回位/色板/视角/排除项。不要靠空泛的“高级、震撼、艺术感”代替可观察细节。
- 图生图时给每张参考图分配角色，例如“Image 1 = motif source, Image 2 = weave texture, Image 3 = color palette”。
- 迭代时一次只改 1–2 个变量；保持 seed、回位、相机视角和色板记录，方便比较。
- 输出语言跟随用户；生图正文优先提供英文，旁边给中文解释和可替换变量。

默认输出 JSON：
{
  "brief": {"category": "", "stage": "", "substrate": "", "use_case": "", "repeat": "", "palette": []},
  "assumptions": [],
  "clarifying_questions": [],
  "directions": [
    {
      "name": "",
      "rationale": "",
      "concept_prompt_en": "",
      "concept_prompt_zh": "",
      "negative_prompt": "",
      "model_adapter": {"gpt_image": "", "midjourney": "", "firefly": "", "sd_workflow": ""},
      "production_notes": [],
      "validation_checklist": []
    }
  ],
  "provenance": []
}

若用户要求“直接生成”，仍先在内部完成上述拆解；对外只展示足够执行的信息，不要输出隐含推理过程。
```

## 7. 可安装 Skill

本库附带一个可直接放进 agent skills 目录的 skill：

- [`skills/jacquard-textile-prompt/SKILL.md`](../../skills/jacquard-textile-prompt/SKILL.md)

它把上述系统提示词落成可执行流程：解析 brief、生成多模型适配器、输出生产备注、做 2×2/3×3 回位检查，并在没有 CAD 数据时明确停止在“概念/样卡”阶段。

## 8. 生产前质量门槛

1. **回位**：左右、上下边界在 2×2 或 3×3 预览中没有断线、跳变或明显接缝。
2. **色彩**：色数已按最终纱线/颜色库归并；渐变、半透明和极细噪点已被处理。
3. **尺寸**：repeat 尺寸与目标成品尺寸、经纬密度和织机 hook 能力匹配；未知参数不自行假设。
4. **组织**：每个颜色/灰度层有明确组织策略；长浮线、反面问题和结构冲突由 CAD 工具检查。
5. **纹理**：效果图中的“金属感、丝光、阴影”已经翻译为纱线和组织差异，而不是仅留在 RGB 像素里。
6. **样卡**：先导出小尺寸技术样卡和多色版本，再做织厂确认；展示效果图和生产文件分开命名。
7. **来源**：记录参考图来源、授权范围、模型、prompt、seed、版本和人工修改，便于系列复现。

## 9. 推荐工作流

```text
brief
  → 3 个方向 / 1 个选定方向
  → motif + palette + repeat 的概念图
  → 2×2 / 3×3 无缝检查
  → 颜色归并与边缘清理
  → 提花 CAD 分配组织、修浮长、匹配密度
  → 织物模拟与技术样卡
  → 小样/打样
  → 记录修订，反哺下一个 prompt 或 LoRA 数据集
```

通用生图模型负责“探索速度”和“视觉沟通”；JACQ Art、Pointcarre、Arahne、REACH 等负责“织造逻辑”和“生产交接”。两者可以串联，但不能互相替代。

## 10. Loomic Agent 适配

当前项目把本库落到了 agent 和画布工具链：

- 主 agent 通过 `skills: ["/skills/"]` 开启 DeepAgents SkillsMiddleware；纺织请求会路由到 `textile_design` specialist。
- `textile_design` 显式绑定 [`jacquard-textile-prompt`](../../skills/jacquard-textile-prompt/SKILL.md) 和 [`home-textile-pattern`](../../skills/home-textile-pattern/SKILL.md)，并提供 `generate_image`、`create_pattern`、`layout_pattern`、`check_pattern`、`export_pattern`、`split_layers`、`remove_background` 和 `vectorize_image`。
- 实际画布花型采用 `create_pattern → layout_pattern → check_pattern → export_pattern`；检查未通过时不导出，不把概念图称为 loom-ready。
- 公开案例的原始摘录、来源模型、适配 prompt 和证据等级保存在 [`prompt-catalog.md`](../../skills/jacquard-textile-prompt/references/prompt-catalog.md)，agent 需要引用时先读取它。
- 聊天入口提供“提花方向”“织锦 / 云锦”“家纺连续花型”“回位质检”等快捷请求，用户无需记忆 skill slug。
