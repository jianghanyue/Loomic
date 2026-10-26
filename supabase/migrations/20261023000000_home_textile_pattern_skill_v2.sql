-- Extend the system textile skill with concept ideation, element decomposition,
-- and production export. Kept as a new migration so existing installations
-- receive the workflow without editing an already-applied migration.
INSERT INTO public.skills (
  name, slug, description, author, version, license, category, icon_name,
  source, skill_content, is_featured, metadata
)
VALUES (
  'Home Textile Pattern',
  'home-textile-pattern',
  '研究驱动的家纺连续花型：构思多组元素、拆分透明单元、无缝排布并导出最高 16K 长边的生产文件。',
  'loomic', '2.0', 'Apache-2.0', 'design', 'palette', 'system',
  $skill_v2$
---
name: home-textile-pattern
description: 研究驱动的家纺连续花型工作流：构思多组元素、生成或拆分透明单元、无缝排布并导出最高 16K 长边的生产文件。
---

# 家纺连续花型设计与装配

先提出 3 组有差异的方向（主题、主花/辅花/叶片/点缀、底色、3–6 色、回位和尺度），用户选定后再制作；已有完整 brief 时直接执行，只有缺少关键参数才提问。参考图用于风格、线稿、材质和色彩关系，不整张复制。

把方向拆成唯一 id 的透明元素：主花、辅花、叶片/枝蔓和点缀。用 generate_image 分别生成单元素；已有合成图时先用 split_layers，再用 remove_background。需要色数控制时可用 vectorize_image 并复核细线。

用 create_pattern 建立回位，用 layout_pattern 先排主花、再以 append=true 追加辅花和填充。half_drop 适合自然散花，block 适合规则几何，brick 适合砖式错位，mirror 适合对称构图。记录稳定 seed、回位尺寸、DPI、颜色和元素清单。

每次排布后调用 check_pattern 检查接缝、跨边重叠、空洞、覆盖率和均匀度；未通过不要称为可生产。用户确认后调用 export_pattern，以 widthPx/heightPx 或 maxEdgePx 导出保持回位比例的 PNG/TIFF，任一边最大 16384px。大图由元素在服务端重新采样和拼接，画布仅保存预览，完整文件写入项目资产。按供应商要求确认有效分辨率、ICC、专色、墨量和打样。
  $skill_v2$,
  true,
  '{"activation": "slash", "requires": ["generate_image", "split_layers", "remove_background", "create_pattern", "layout_pattern", "check_pattern", "export_pattern"], "max_edge_px": 16384}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  skill_content = EXCLUDED.skill_content,
  version = EXCLUDED.version,
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO public.skill_files (skill_id, file_path, content, mime_type)
SELECT s.id, 'references/industry-research.md', $research$
# 行业与技术依据

采用“元素分层 + 结构化回位 + 生产前检查”：FESPA 建议纺织印花有效分辨率不要低于约 100 ppi，并提醒由供应商指定 RGB/CMYK 与 ICC；ISO 15339-1 将色彩特征数据放在文件准备、打样和生产的链路中。Adobe 文档和纺织设计教材把 straight/block、half-drop、brick、mirror/bookmatch 作为常见重复关系。Krita 官方 Wrap Around Mode 说明了实时检查无缝纹理的工作方式。OpenAI Images API 文档当前把超出 2560×1440 的尺寸列为实验性并将最大支持尺寸列为 3840×2160，所以 16K 应由透明元素重采样后重新装配。

资料：
- https://www.fespa.com/en/news-media/how-to-design-for-digital-textile-printing/
- https://www.iso.org/standard/83514.html
- https://experienceleague.adobe.com/en/docs/dynamic-media-developer-resources/image-serving-api/image-rendering-api/material-catalog/material-data-reference/r-ir-cat-repeat
- https://docs.krita.org/en/tutorials/common_workflows.html
- https://developers.openai.com/api/reference/cli/resources/images/methods/generate
$research$, 'text/markdown'
FROM public.skills s
WHERE s.slug = 'home-textile-pattern'
ON CONFLICT (skill_id, file_path) DO UPDATE SET
  content = EXCLUDED.content,
  mime_type = EXCLUDED.mime_type,
  updated_at = now();

INSERT INTO public.workspace_skills (workspace_id, skill_id, enabled)
SELECT w.id, s.id, true
FROM public.workspaces w
CROSS JOIN public.skills s
WHERE s.slug = 'home-textile-pattern'
ON CONFLICT (workspace_id, skill_id) DO UPDATE SET enabled = true;
