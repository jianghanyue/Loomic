/** Excalidraw 0.18's bundled regular sans-serif, rather than its hand-drawn default. */
export const CANVAS_TEXT_DEFAULTS = {
  currentItemFontFamily: 6, // Nunito
  currentItemFontSize: 24,
};

type Element = { id: string; type: string; isDeleted?: boolean; containerId?: string | null };

/** Keep Excalidraw's native text settings available without showing shape settings. */
export function shouldShowTextControls(
  elements: readonly Element[],
  state: {
    activeTool?: { type?: string };
    selectedElementIds?: Record<string, boolean>;
    editingTextElement?: { type?: string } | null;
  },
): boolean {
  if (state.activeTool?.type === "text" || state.editingTextElement?.type === "text") return true;
  const selected = state.selectedElementIds ?? {};
  return elements.some((el) => !el.isDeleted && el.type === "text" &&
    (selected[el.id] || (el.containerId && selected[el.containerId])));
}
