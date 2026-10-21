// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  localizeContextMenu,
  observeContextMenus,
} from "../src/lib/excalidraw-zh";

function menu(labels: string[]): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = `<ul class="context-menu">${labels
    .map(
      (l) =>
        `<li><button class="context-menu-item"><div class="context-menu-item__label">${l}</div></button></li>`,
    )
    .join("")}</ul>`;
  return root;
}

function labels(root: ParentNode): string[] {
  return [...root.querySelectorAll(".context-menu-item__label")].map(
    (e) => e.textContent ?? "",
  );
}

describe("localizeContextMenu", () => {
  it("translates English fallbacks and swaps Copy/Duplicate wording", () => {
    const root = menu([
      "剪切",
      "拷贝",
      "Crop image",
      "拷贝样式",
      "复制",
      "删除",
    ]);
    localizeContextMenu(root);
    expect(labels(root)).toEqual([
      "剪切",
      "复制",
      "裁剪图片",
      "复制样式",
      "创建副本",
      "删除",
    ]);
  });

  it("is idempotent — a patched 复制 is not turned into 创建副本", () => {
    const root = menu(["拷贝", "复制"]);
    localizeContextMenu(root);
    localizeContextMenu(root);
    expect(labels(root)).toEqual(["复制", "创建副本"]);
  });

  it("re-patches a label that was re-rendered back to the original", () => {
    const root = menu(["拷贝"]);
    localizeContextMenu(root);
    const label = root.querySelector<HTMLElement>(".context-menu-item__label")!;
    label.textContent = "拷贝";
    localizeContextMenu(root);
    expect(label.textContent).toBe("复制");
  });

  it("ignores labels outside a context menu", () => {
    const root = document.createElement("div");
    root.innerHTML = `<div class="context-menu-item__label">拷贝</div>`;
    localizeContextMenu(root);
    expect(root.textContent).toBe("拷贝");
  });
});

describe("observeContextMenus", () => {
  it("localizes menus added after observing starts", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const stop = observeContextMenus(root);

    root.appendChild(menu(["Toggle grid", "复制"]));
    await new Promise((r) => setTimeout(r, 0));

    expect(labels(root)).toEqual(["网格", "创建副本"]);
    stop();
    root.remove();
  });
});
