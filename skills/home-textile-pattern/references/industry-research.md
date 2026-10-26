# 行业与技术依据

这份 skill 采用“元素分层 + 结构化回位 + 生产前检查”的路线，原因如下：

- 数码纺织印花的有效分辨率、出血/陷印和 ICC 配置应由印花厂确认；FESPA 建议不要低于约 100 ppi，并提醒供应商会指定 RGB/CMYK 色彩配置。因此默认用 150–300 ppi，并把色彩管理留在导出后的生产环节。
- ISO 15339-1 把色彩特征数据放在文件准备、打样和生产之间的关系中。pattern 文档保存底色、印花色数和 DPI，但不伪造一个未经确认的 ICC profile。
- Adobe 的材质重复文档和纺织设计教材都把 straight/block、half-drop、brick 和 mirror/bookmatch 作为常见重复关系。排布工具因此以“最小直角连续回位”展开，再用 wrap-around 合成边缘。
- Krita 官方文档的 Wrap Around Mode 说明了实时检查无缝纹理的工作方式；本实现用相同的边缘连续原则，并在服务端用像素差异和跨边距离做自动检查。
- 生成模型适合构思和单元素探索，不适合把 16K 当作一次生成目标。OpenAI Images API 的当前文档把超出 2560×1440 的尺寸列为实验性并将最大支持尺寸列为 3840×2160，因此大图必须由透明元素重采样后重新装配。

参考资料：

- https://www.fespa.com/en/news-media/how-to-design-for-digital-textile-printing/
- https://www.iso.org/standard/83514.html
- https://experienceleague.adobe.com/en/docs/dynamic-media-developer-resources/image-serving-api/image-rendering-api/material-catalog/material-data-reference/r-ir-cat-repeat
- https://docs.krita.org/en/tutorials/common_workflows.html
- https://developers.openai.com/api/reference/cli/resources/images/methods/generate
