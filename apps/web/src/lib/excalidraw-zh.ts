/**
 * Chinese fixes for Excalidraw's context menu.
 *
 * Excalidraw 0.18's zh-CN locale leaves several menu entries untranslated
 * (they fall back to English) and renders Copy as 拷贝 and Duplicate as 复制,
 * which most Chinese apps use the other way round. Excalidraw has no API for
 * overriding translations, so the rendered labels are patched in place.
 */

/** Rendered label → replacement. */
export const CONTEXT_MENU_ZH: Record<string, string> = {
  "Wrap selection in frame": "用画框包裹",
  "Crop image": "裁剪图片",
  "Copy link to object": "复制元素链接",
  "Toggle grid": "网格",
  "Canvas & Shape properties": "画布与图形属性",
  "Edit arrow": "编辑箭头",
  "Edit line": "编辑线条",
  拷贝: "复制",
  拷贝样式: "复制样式",
  复制: "创建副本",
};

const LABEL_SELECTOR = ".context-menu .context-menu-item__label";

/**
 * Replace known labels under `root`. Each label remembers what it was set to,
 * so a second pass doesn't map 复制 (our Copy) on to 创建副本 (Duplicate).
 */
export function localizeContextMenu(root: ParentNode): void {
  for (const label of root.querySelectorAll<HTMLElement>(LABEL_SELECTOR)) {
    const text = label.textContent ?? "";
    if (label.dataset.zh === text) continue;
    const replacement = CONTEXT_MENU_ZH[text];
    if (replacement) {
      label.textContent = replacement;
      label.dataset.zh = replacement;
    }
  }
}

/** Keep context menus under `root` localized as Excalidraw renders them. */
export function observeContextMenus(root: HTMLElement): () => void {
  const observer = new MutationObserver(() => localizeContextMenu(root));
  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  return () => observer.disconnect();
}
