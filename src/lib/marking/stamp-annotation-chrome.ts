import type { CSSProperties } from "react";

/**
 * Visual chrome for stamp (image) annotations.
 * Unselected stamps must not show rectangular bounds, cards, or handles.
 */
export function stampAnnotationChrome(selected: boolean): CSSProperties {
  return {
    border: "none",
    // Selected: faint temporary guide only — never a solid rectangular frame.
    outline: selected ? "1px dashed rgba(15,23,42,0.28)" : "none",
    outlineOffset: selected ? 2 : 0,
    backgroundColor: "transparent",
    background: "transparent",
    boxShadow: "none",
    overflow: "visible",
    WebkitTapHighlightColor: "transparent",
  };
}

export function stampChromeIsInvisible(
  style: CSSProperties,
): boolean {
  return (
    (style.border === "none" || style.border === 0 || !style.border) &&
    (style.outline === "none" || !style.outline) &&
    (style.backgroundColor === "transparent" || !style.backgroundColor) &&
    (style.boxShadow === "none" || !style.boxShadow)
  );
}
