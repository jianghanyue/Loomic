# A02 · 夜航花园 Night Garden

这版方案从用户给的深色花卉面料和上一版“花束 + 蝴蝶”的结构化验证图中提取了两个可复用原则：深底上的低饱和冷暖对比，以及把主花、枝叶和点缀拆成独立单元再组装。视觉探索图只作为风格参考；真正的回位由 Loomic 的 pattern 文档重建。

## 三组方向

| 方向 | 主元素 | 配色 | 回位与使用场景 |
| --- | --- | --- | --- |
| A01 雾白玉兰 | 玉兰枝、细叶、种子荚 | 米白、烟灰、鼠尾草绿 | 64×64 cm 半落，适合窗帘和春季床品 |
| **A02 夜航花园** | 蓝灰山茶、橄榄枝、金叶、奶油浆果、夜蛾 | `#2B2A33`、`#8EA2B5`、`#C8B36A`、`#68735D`、`#E6E0D2` | 64×64 cm 半落，适合深色床品、靠垫和软包 |
| A03 陶土草本 | 橙陶花、棕褐叶、细小果实 | 米白、陶橙、赭石、深棕 | 64×64 cm brick，适合餐桌布和轻量窗帘 |

本次先落地 A02。它和之前的粉色牡丹方案拉开了底色、花材和情绪差异，同时保留可用于织物的有限色数。

## A02 元素清单

| id | 层级 | 建议宽度 | 作用 |
| --- | --- | ---: | --- |
| `camellia` | 主花 | 17 cm | 蓝灰大花，5 个/设计单元，允许 ±14° |
| `sprig` | 辅花/枝蔓 | 10 cm | 橄榄枝，优先放在主花之间 |
| `gold-leaf` | 辅叶 | 7 cm | 赭黄叶，打破冷色连续性 |
| `berry` | 点缀 | 4 cm | 奶油浆果簇，填充空洞 |
| `moth` | 点缀 | 8 cm | 夜蛾，低频出现，作为方向性视觉锚点 |

## 可复现参数与检查

- 设计单元：64 × 64 cm，`half_drop`；直角连续输出 tile 为 128 × 64 cm。
- 底色：`#2B2A33`；印花色 4 色，连底色共 5 色。
- 排布：主花请求 5 个，辅花/枝蔓请求 9 个（实际可容纳 6 个），点缀请求 20 个；固定 seed `20261023–20261025`。
- 预览：[a02-night-garden-repeat-preview.png](/Users/cuizhen/Documents/Codex/2026-10-22/https-github-com-caokaijun2005-arch-loomic-2/Loomic/artifacts/textile-pattern/a02-night-garden-repeat-preview.png)
- 生产示例：[a02-night-garden-8192.png](/Users/cuizhen/Documents/Codex/2026-10-22/https-github-com-caokaijun2005-arch-loomic-2/Loomic/artifacts/textile-pattern/a02-night-garden-8192.png)
- 机器报告：[a02-night-garden-report.json](/Users/cuizhen/Documents/Codex/2026-10-22/https-github-com-caokaijun2005-arch-loomic-2/Loomic/artifacts/textile-pattern/a02-night-garden-report.json)

当前示例检查结果：左右/上下接缝通过、包围圆重叠 0、覆盖率约 26.33%、8 列网格无空洞，均匀度 0.64。实际打样前仍需按面料、墨水和供应商 ICC 做软打样与小样确认。

渲染脚本在 [`scripts/render-a02-night-garden.mjs`](/Users/cuizhen/Documents/Codex/2026-10-22/https-github-com-caokaijun2005-arch-loomic-2/Loomic/scripts/render-a02-night-garden.mjs)，它调用 `@loomic/textile` 的确定性排布和大图导出路径，后续可以替换成真实的透明 motif 文件。
