-- Register the textile-pattern skill so it is selectable from the chat slash menu.
INSERT INTO public.skills (
  name, slug, description, author, version, license, category, icon_name,
  source, skill_content, is_featured, metadata
)
VALUES (
  'Home Textile Pattern',
  'home-textile-pattern',
  '家纺布料、床品、窗帘、软包和壁布的连续花型设计与接缝检查流程。',
  'loomic', '1.0', 'Apache-2.0', 'design', 'palette', 'system',
  $skill$
---
name: home-textile-pattern
description: 家纺布料图案与四方连续花型的结构化问答流程。
---

# 家纺布料图案结构化生成

只在用户通过 `/` 选择这个 Skill 后生效，不要预载本内容。

## 对话规则
- 一次只问一个问题。
- 每次给出 2–5 个可点击选项，并保留 `0. 自定义描述`。
- 等待回答后再进入下一步。
- 需要选择时输出 `<loomic_choice>{"type":"choice","questionId":"...","title":"...","options":[{"id":"...","label":"...","description":"..."}],"multiple":false}</loomic_choice>`。

## 领域规则
- 先确认品类：床品、窗帘、沙发/软包、壁布、桌布/靠垫或其他家纺。
- 必须确认回位方式：四方连续、半落、镜像连续或条带连续。
- 默认回位为 64 × 64 cm；记录 DPI、输出比例和安全边距。
- 分层记录主花、辅花、叶片/枝蔓和点缀纹样，单元使用透明背景。
- 记录底色、主色、辅色、点缀色，优先控制在 3–6 个印花色。
- 记录主图尺度、花间距、留白、方向性和最小可印细节。
- 边缘元素要成对跨边或留出安全区，避免断线、重影、周期性硬边。

## 工具流程
先用 `create_pattern` 创建回位，再用 `layout_pattern` 排布单元；`tossed` 适合自然散花，`grid` 适合规则排列，半落要错开半个回位。主花先排，辅花和叶片追加填充，修改时沿用 `patternId`。最后调用 `check_pattern` 检查接缝、重叠、密度、空洞和最小细节；未通过检查前不要宣称可生产。

只有用户确认 brief、单元和拼接结果后，才执行最终生成或写入画布。
  $skill$,
  true,
  '{"activation": "slash", "requires": ["create_pattern", "layout_pattern", "check_pattern"]}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  skill_content = EXCLUDED.skill_content,
  metadata = EXCLUDED.metadata,
  updated_at = now();

-- Install it for existing workspaces. New workspaces use the existing skill
-- installation trigger/function and will receive the system skill as well.
INSERT INTO public.workspace_skills (workspace_id, skill_id, enabled)
SELECT w.id, s.id, true
FROM public.workspaces w
CROSS JOIN public.skills s
WHERE s.slug = 'home-textile-pattern'
ON CONFLICT (workspace_id, skill_id) DO NOTHING;
