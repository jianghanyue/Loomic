---
name: jacquard-textile-prompt
description: 为提花、织锦、大马士革、家纺和织物质感任务生成多模型提示词、系统化设计 brief 与生产前检查单；默认把 AI 概念图和提花 CAD/织机交接分开。
license: Apache-2.0
metadata:
  author: loomic
  version: "1.0"
  domain: textile-jacquard
---

# Jacquard Textile Prompt Skill

用于把纺织 brief 转成可复制的生图 prompt、参考图操作说明、模型适配器和提花生产前检查单。优先服务 jacquard、damask、brocade、yunjin、matelassé、家纺和服装面料展示。

公开来源案例和模型适配见 [references/prompt-catalog.md](references/prompt-catalog.md)。读取来源时保留 `source_url`、`source_model` 和证据等级；不要把 Loomic 的改写误标成第三方原文。

## 触发条件

当用户提到以下任一内容时启用：提花、织锦、云锦、大马士革、织物花型、连续花型、无缝面料、织物纹理、织机、组织、浮长、经纬密度、loom/CAD、家纺图案或纺织生图提示词。

## 关键边界

- AI 图片是概念、样卡或展示素材，除非经过 CAD/织厂校验，否则不得称为 loom-ready。
- 不擅自猜 hook capacity、经纬密度、最大浮长、纱线规格、颜色库或 loom 头型号；缺失时列为待确认参数。
- 参考图用于风格、配色、构图或材质角色，不复制可识别品牌、受版权保护图案或未授权文化遗产原件。
- 提花必须检查回位、色彩归并、组织分配、边缘连续和浮长；只写“高端、复杂、震撼”不算可执行描述。

## 输入

从用户 brief 提取：

```yaml
category: jacquard | brocade | damask | printed_textile | knit | mockup
stage: ideation | pattern | swatch | cad_handoff | sampling
substrate: silk | cotton | linen | wool | viscose | blend | unknown
use_case: upholstery | bedding | curtain | apparel | accessory | art_panel
motif: 主花/动物/几何/地域纹样及主次层级
repeat: straight | half_drop | brick | mirror | tossed | unknown
repeat_size: 例如 64cm x 64cm；未知就留空
palette: 色名、HEX、色数、纱线颜色库（如有）
references: 图片及其角色、授权备注
model_preference: gpt_image | midjourney | firefly | sd | textile_cad | unknown
```

## 工作流程

1. **分类阶段**：判断是概念图、样卡、织物微观质感还是 CAD 交接。缺少会改变输出的参数时，只问必要问题；否则先写清假设并继续。
2. **方向阶段**：没有明确方向时给 3 个差异明显的方向；每个方向包含 motif 层级、构图、色板、回位、质感和用途。
3. **提示词阶段**：按 `substrate → construction → motif → repeat → scale → palette → texture → view → constraints` 组织英文 prompt；同时给中文解释。
4. **模型适配阶段**：
   - Midjourney：连续图案可追加 `--tile --ar 1:1 --raw`，并提醒检查放大后是否破坏边缘。
   - GPT Image：使用分段描述、参考图角色、只改一个变量的编辑指令；适合多轮图生图。
   - Firefly：用 Style Reference/Generative Fill/Text to Pattern，并说明哪张图控制风格或材质。
   - SDXL/Flux：说明需要 tiling、ControlNet Tile、Tiled Diffusion 或自定义 LoRA；不要假装有统一参数。
   - Textile CAD：把 prompt 结果当输入，转入颜色归并、组织、浮长和 loom 输出流程。
   - Loomic 画布：需要实际创建家纺花型时，调用 `create_pattern` → `layout_pattern`；用 `check_pattern` 通过后才可 `export_pattern`。需要透明单元或参考图处理时使用 `generate_image`、`remove_background`、`vectorize_image`，不要把这些工具的结果称为 CAD 文件。
5. **质量阶段**：输出 2×2/3×3 回位检查、色数/边缘/组织/浮长/密度清单。未通过时标成“需返工”。
6. **记录阶段**：记录 prompt 版本、模型、seed、参考图角色、色板、repeat、人工改动和最终状态。

## 输出格式

```yaml
status: concept | swatch | cad_handoff | production_verified
assumptions: []
clarifying_questions: []
directions:
  - name: ""
    concept_prompt_en: ""
    concept_prompt_zh: ""
    negative_prompt: ""
    model_adapter:
      gpt_image: ""
      midjourney: ""
      firefly: ""
      sd_workflow: ""
    production_notes: []
    validation_checklist: []
provenance:
  - source: ""
    role: ""
    model: ""
    evidence_level: source_prompt | source_excerpt | workflow_summary
```

## 默认负面模块

```text
broken repeat, visible seam, cropped motif, central poster composition, uneven spacing,
text, logo, watermark, paper texture, plastic CGI sheen, photographic background,
embroidery, knit loops, lace, leather, gradient banding, too many colors,
blurry edges, melted geometry, impossible yarn crossings
```

## 提花专用质量门槛

- 回位在 2×2 或 3×3 预览中无明显接缝。
- 色彩已按纱线/颜色库归并；渐变、半透明、微小噪点已处理。
- repeat 尺寸与面料密度、目标用途和织机能力相容；未知参数留给 CAD/织厂确认。
- 颜色/灰度层都有组织策略；长浮线、反面风险和结构冲突需由专业 CAD 检查。
- 效果图中的金属感、丝光和阴影已翻译成纱线/组织差异，而非只保留 RGB 视觉效果。
- “loom-ready / production-ready”只能在完成 CAD/织厂验证后使用。

## 最小可用示例

用户：`做一款深蓝底、5 色、适合窗帘的牡丹提花，想要云锦气质。`

输出应至少包含：

1. 三个方向（传统织锦、低对比大马士革、现代几何云纹）；
2. 每个方向一段英文概念 prompt 和中文解释；
3. `--tile` 或参考图操作说明；
4. 色板、回位建议、避免印花/塑料质感的负面词；
5. “待确认：纤维、repeat 尺寸、hook capacity、经纬密度、最大浮长”的生产备注。
