# 纺织提示词调研目录

这份目录把公开来源中的纺织、提花、织锦、家纺和无缝花型案例整理成可供 agent 检索的“研究输入”。它不是把第三方内容当成 Loomic 的生产规范：原始案例用于理解提示词结构，下面的 Loomic 改写用于生成原创方向；涉及历史纹样、品牌图案或来源图片时仍需人工确认授权。

## 使用规则

1. 先按用途选择案例：花型探索、连续回位、家纺效果、织物微观质感或软包替换。
2. 原始来源可能没有公开完整模型参数；不要补写没有证据的 seed、CFG、分辨率或训练模型。
3. 输出时标明 `source_url`、`source_model`、`adaptation` 和 `evidence_level`（`source_prompt`、`source_excerpt`、`workflow_summary`）。
4. 把印花视觉翻译成织造语言时，必须补充纱线色族、组织对比、回位、色数和 2×2/3×3 检查；这些是 Loomic 的适配，不应伪装成原作者的原文。

## 案例表

| ID | 适用任务 | 来源模型 / 工具 | 原始案例要点 | Loomic 适配方向 | 来源 |
| --- | --- | --- | --- | --- | --- |
| `prompt-hero-cotton-repeat` | 手工印花、碎花、连续花型 | Midjourney 3 | realistic fabric、hand-printed cotton、Indian/Japanese flower patterns repeat | 平铺正交样卡；五个纱线色族；half-drop；去掉纸张和墨水晕染 | https://prompthero.com/prompt/fc63adbc91a |
| `prompt-hero-japanese-textile` | 织锦、和风原创花型 | Midjourney 3 | seamless traditional Japanese textiles、intricate、organic texture map | 只借鉴云、鹤、花卉构成逻辑；原创 motif；六色；四边无缝 | https://prompthero.com/prompt/788005ae1d6-midjourney-3-seamless-pattern-of-surreal-traditional-japanese-textiles-intricate-ornate-beautiful-colorful-organic-texture-map-flat-texture |
| `promptbase-embroidery-study` | 手工艺质感、纹理灵感 | Midjourney V7 | artisanal embroidery、handstitched fabric、visible thread relief | 作为组织/浮雕参考，不输出刺绣线圈；加入织物 ground 和宏观裁切 | https://promptbase.com/prompt/artisanal-embroidery-handstitched-fabrics |
| `promptup-ikat` | 伊卡特、模糊边缘、菱形回位 | Midjourney / Gemini / ChatGPT | seamless ikat-style pattern、blurred feathered edges、geometric diamond motifs、subtle woven texture | 将模糊边缘转为软纱线过渡；保持菱形结构；补充 2×2 回位和批准色板 | https://usepromptup.com/prompts/image-ikat-fabric-pattern/ |
| `texloom-sanganeri` | 小碎花、印度块印灵感 | Texloom tested prompt | Sanganeri block-print florals、small motifs、densely packed | 颜色归并为靛蓝/米白平面色；禁止 ink bleed；可用于小尺度提花 | https://texloom.studio/blog/ai-prompts-textile-pattern-generation |
| `texloom-damask` | 大马士革、织锦 | Texloom tested prompt | baroque ornamental scrolls and medallions、seamless tileable damask | half-drop；中等花型尺度；缎纹/平纹组织对比；适合窗帘和软包 | https://texloom.studio/blog/ai-prompts-textile-pattern-generation |
| `texloom-ditsy` | 床品、衬衫、小尺度家纺 | Texloom guide | tiny scattered wildflowers、non-directional tossed layout | 用 tossed 排布；控制间距和密度；不生成方向性主花 | https://texloom.studio/blog/create-ditsy-floral-pattern-ai |
| `texloom-geometric` | 几何提花、现代软装 | Texloom guide | Art Deco sunburst、chevron、stepped edges、precise grid | 固定线宽、格距和直角；补充 yarn color count；避免渐变和透视 | https://texloom.studio/blog/generate-geometric-patterns-ai |
| `texloom-photo-to-repeat` | 图片转花型、参考图变体 | image-to-image workflow | reinterpret photo as a pattern、close seams in the same pass | Image 1 只做 motif source；扁平化为五色；再由 check_pattern 检查边缘 | https://texloom.studio/blog/turn-photo-into-seamless-textile-pattern |
| `promptbase-home-textile` | 窗帘、床品、毛巾、靠垫 | Gemini Image 3.0-PRO-IMAGE | bold fabric print designs for curtains、bedding、towels | 先生成房间/垂坠效果，再回到方形样卡；限制 2–5 个纱线色族 | https://promptbase.com/prompt/luxury-bold-fabric-print-generator-2 |
| `promptbase-all-products` | 多用途无缝花型 | PromptBase Pattern App | subject、secondary elements、aesthetic style、palette | 将字段映射为 `motif`、`supporting_motifs`、`style`、`palette`、`use_case` | https://promptbase.com/app/seamless-patterns-for-all-products |
| `prompthero-upholstery` | 软包材质替换、家居效果图 | Flux Kontext / Seedream 5 | room image + sofa geometry + fabric macro；保持 camera、seams、lighting | 三张图分配角色；禁止改变几何；检查织物比例和纹理方向 | https://prompthero.com/search?q=image_2 |
| `texloom-colorway` | 同花型多配色 | Reinhard LAB color transfer | 保留结构细节，只迁移色彩氛围 | 锁定 motif、repeat、weave contrast、density，只输出四个标注色卡 | https://texloom.studio/blog/reinhard-color-transfer-textile-colorways |
| `texloom-vintage-botanical` | 复古植物、窗帘和壁布 | Texloom tested prompt | vintage botanical illustration、detailed leaves and wildflowers | 中高密度散花；自然轮廓改为可织块面；暖赭/森林绿 | https://texloom.studio/blog/ai-prompts-textile-pattern-generation |
| `texloom-tropical` | 热带、度假家纺 | Texloom tested prompt | stylized palm leaves and exotic flowers、dense all-over | teal/coral/gold 三到五色；控制低浮雕；避免照片感叶脉 | https://texloom.studio/blog/ai-prompts-textile-pattern-generation |
| `texloom-scandinavian` | 极简家纺、现代室内 | Texloom tested prompt | simple abstract shapes、sparse composition、generous negative space | 直回位；灰米色；低对比组织；确保大留白不会造成空洞 | https://texloom.studio/blog/ai-prompts-textile-pattern-generation |
| `texloom-folk-floral` | 民艺花卉、原创织锦 | Texloom tested prompt | folk roses and daisies、symmetrical arrangement | 只借鉴构图节奏；不复制文化遗产原件；红黄蓝平面纱线色 | https://texloom.studio/blog/ai-prompts-textile-pattern-generation |
| `texloom-stone-moss` | 低调纹理、软包和墙布 | Texloom tested prompt | aged stone and moss、organic natural texture | 将裂纹改为组织变化；灰绿/苔褐；避免 photographic cracks | https://texloom.studio/blog/ai-prompts-textile-pattern-generation |

## 模型适配速查

- **GPT Image**：把参考图写成角色（motif、weave language、room、geometry、fabric macro），一轮只改一个变量；适合 image-to-image 和色卡迭代。
- **Midjourney**：花型探索用 `--tile --ar 1:1 --raw`；不要把 `--tile` 结果直接当生产文件，必须做 2×2/3×3 回位检查。
- **Firefly**：把 Style Reference、Generative Fill 或 Text to Pattern 对应到“风格、局部修补、花型生成”；明确哪张图控制材质，哪张图控制构图。
- **Flux / SDXL**：需要 tiled diffusion、ControlNet Tile 或同类工作流时要如实说明；不要编造统一 CFG、采样器和 LoRA 参数。
- **Textile CAD**：任何 AI 结果都只作为输入；后续由 Pointcarre、Arahne 或织厂 CAD 做颜色归并、组织、浮长、密度和 loom 文件验证。

## 推荐输出字段

```yaml
source_url: ""
source_model: ""
evidence_level: source_prompt | source_excerpt | workflow_summary
original_excerpt: ""
adaptation_prompt_en: ""
adaptation_notes_zh: ""
production_questions: []
```
