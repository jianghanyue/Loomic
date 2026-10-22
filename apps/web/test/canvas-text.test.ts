// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { CANVAS_TEXT_DEFAULTS, shouldShowTextControls } from "../src/lib/canvas-text";
import { getCanvasFontString, normalizeCanvasElements } from "../src/lib/canvas-normalize";

describe("canvas text clarity", () => {
  const text = { id: "text", type: "text", containerId: "box" };
  it("uses a regular bundled font for new text without overriding saved choices", () => {
    expect(CANVAS_TEXT_DEFAULTS).toEqual({ currentItemFontFamily: 6, currentItemFontSize: 24 });
    expect({ ...CANVAS_TEXT_DEFAULTS, currentItemFontFamily: 5 }.currentItemFontFamily).toBe(5);
  });
  it("shows native settings for the text tool and editing text", () => {
    expect(shouldShowTextControls([], { activeTool: { type: "text" } })).toBe(true);
    expect(shouldShowTextControls([], { editingTextElement: { type: "text" } })).toBe(true);
  });
  it("shows settings for selected text and labels bound to a selected shape", () => {
    expect(shouldShowTextControls([text], { selectedElementIds: { text: true } })).toBe(true);
    expect(shouldShowTextControls([text], { selectedElementIds: { box: true } })).toBe(true);
  });
  it("does not show text settings for deleted text or unrelated images", () => {
    expect(shouldShowTextControls([{ ...text, isDeleted: true }], { selectedElementIds: { text: true } })).toBe(false);
    expect(shouldShowTextControls([text], { selectedElementIds: { image: true } })).toBe(false);
  });
  it("measures regular and CJK hand-written text with the renderer's actual fonts", () => {
    expect(getCanvasFontString(24, 6)).toBe('24px Nunito, "Segoe UI Emoji"');
    expect(getCanvasFontString(28, 5)).toBe('28px Excalifont, Xiaolai, "Segoe UI Emoji"');
    expect(getCanvasFontString(20, 9)).toBe('20px "Liberation Sans", "Segoe UI Emoji"');
  });
  it("keeps Nunito label measurements in sync with its actual line height", () => {
    const context = { font: "", measureText: () => ({ width: 100 }) };
    const spy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as any);
    try {
      const label = { id: "label", type: "text", containerId: "box", text: "中文\nCanvas",
        x: 0, y: 0, width: 10, height: 10, fontFamily: 6, fontSize: 24, lineHeight: 1.35 };
      normalizeCanvasElements([{ id: "box", type: "rectangle", x: 0, y: 0, width: 400, height: 400 }, label]);
      expect(context.font).toBe('24px Nunito, "Segoe UI Emoji"');
      expect(label.width).toBe(100);
      expect(label.height).toBeCloseTo(64.8);
      expect(label.fontFamily).toBe(6);
    } finally { spy.mockRestore(); }
  });
});
