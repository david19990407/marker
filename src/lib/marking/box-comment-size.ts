import { clampNormRect } from "@/lib/marking/annotation-geometry";

/** Compact worksheet annotation typography — Arial ~10pt. */
export const BOX_COMMENT_FONT =
  'normal 10pt Arial, Helvetica, "Helvetica Neue", sans-serif';
export const BOX_COMMENT_LINE_HEIGHT = 1.25;
export const BOX_COMMENT_PAD_X = 6;
export const BOX_COMMENT_PAD_Y = 4;
/** Default new box comment width (~200px). */
export const BOX_COMMENT_DEFAULT_WIDTH_PX = 200;
export const BOX_COMMENT_MIN_WIDTH_PX = 140;
export const BOX_COMMENT_MAX_WIDTH_FRACTION = 0.5;

export function measureBoxCommentText(
  text: string,
  maxWidthPx: number,
  minWidthPx = BOX_COMMENT_MIN_WIDTH_PX,
): { widthPx: number; heightPx: number } {
  if (typeof document === "undefined") {
    const widthPx = Math.min(
      maxWidthPx,
      Math.max(minWidthPx, Math.min(maxWidthPx, 8 + text.length * 6)),
    );
    const charsPerLine = Math.max(12, Math.floor((widthPx - BOX_COMMENT_PAD_X * 2) / 6));
    const softLines = text.split("\n").reduce((sum, line) => {
      return sum + Math.max(1, Math.ceil(Math.max(1, line.length) / charsPerLine));
    }, 0);
    return {
      widthPx,
      heightPx: Math.max(22, softLines * 14 + BOX_COMMENT_PAD_Y * 2),
    };
  }

  const probe = document.createElement("div");
  probe.style.cssText = [
    "position:absolute",
    "visibility:hidden",
    "pointer-events:none",
    "white-space:pre-wrap",
    "word-break:break-word",
    "overflow-wrap:anywhere",
    `font:${BOX_COMMENT_FONT}`,
    `line-height:${BOX_COMMENT_LINE_HEIGHT}`,
    `padding:${BOX_COMMENT_PAD_Y}px ${BOX_COMMENT_PAD_X}px`,
    "box-sizing:border-box",
    `max-width:${Math.max(minWidthPx, maxWidthPx)}px`,
    `min-width:${minWidthPx}px`,
    "width:max-content",
  ].join(";");
  probe.textContent = text.length > 0 ? text : " ";
  document.body.appendChild(probe);
  const rawWidth = Math.ceil(probe.scrollWidth);
  const widthPx = Math.min(
    Math.max(minWidthPx, maxWidthPx),
    Math.max(minWidthPx, rawWidth + 1),
  );
  probe.style.width = `${widthPx}px`;
  probe.style.maxWidth = `${widthPx}px`;
  const heightPx = Math.max(22, Math.ceil(probe.scrollHeight));
  document.body.removeChild(probe);
  return { widthPx, heightPx };
}

export function sizeBoxCommentFromText(
  text: string,
  canvasWidthPx: number,
  canvasHeightPx: number,
  preferredWidthPx = BOX_COMMENT_DEFAULT_WIDTH_PX,
): { w_norm: number; h_norm: number } {
  const maxWidthPx = Math.max(
    BOX_COMMENT_MIN_WIDTH_PX,
    canvasWidthPx * BOX_COMMENT_MAX_WIDTH_FRACTION,
  );
  const targetWidth = Math.min(
    maxWidthPx,
    Math.max(BOX_COMMENT_MIN_WIDTH_PX, preferredWidthPx),
  );
  // Empty / new comments start at the default width; height still auto-fits.
  const { heightPx, widthPx } = measureBoxCommentText(
    text,
    text.trim() ? maxWidthPx : targetWidth,
    text.trim() ? BOX_COMMENT_MIN_WIDTH_PX : targetWidth,
  );
  const finalWidth = text.trim()
    ? Math.min(maxWidthPx, Math.max(BOX_COMMENT_MIN_WIDTH_PX, widthPx))
    : targetWidth;
  return {
    w_norm: Math.min(0.95, Math.max(0.08, finalWidth / Math.max(1, canvasWidthPx))),
    h_norm: Math.min(0.9, Math.max(0.03, heightPx / Math.max(1, canvasHeightPx))),
  };
}

export function placeBoxCommentAtPoint(
  xNorm: number,
  yNorm: number,
  text: string,
  canvasWidthPx: number,
  canvasHeightPx: number,
): { x_norm: number; y_norm: number; w_norm: number; h_norm: number } {
  const size = sizeBoxCommentFromText(
    text,
    canvasWidthPx,
    canvasHeightPx,
    BOX_COMMENT_DEFAULT_WIDTH_PX,
  );
  return clampNormRect({
    x: Math.min(1 - size.w_norm, Math.max(0, xNorm)),
    y: Math.min(1 - size.h_norm, Math.max(0, yNorm)),
    w: size.w_norm,
    h: size.h_norm,
  });
}

/** Width-driven resize: keep left or right edge, recalculate height from text. */
export function resizeBoxCommentWidth(
  text: string,
  xNorm: number,
  yNorm: number,
  wNorm: number,
  canvasWidthPx: number,
  canvasHeightPx: number,
  anchor: "left" | "right" = "left",
): { x_norm: number; y_norm: number; w_norm: number; h_norm: number } {
  const maxWidthPx = Math.max(
    BOX_COMMENT_MIN_WIDTH_PX,
    canvasWidthPx * BOX_COMMENT_MAX_WIDTH_FRACTION,
  );
  const widthPx = Math.min(
    maxWidthPx,
    Math.max(BOX_COMMENT_MIN_WIDTH_PX, wNorm * canvasWidthPx),
  );
  const { heightPx } = measureBoxCommentText(text, widthPx, widthPx);
  const w_norm = widthPx / Math.max(1, canvasWidthPx);
  const h_norm = Math.min(0.9, Math.max(0.03, heightPx / Math.max(1, canvasHeightPx)));
  const x_norm =
    anchor === "right"
      ? Math.min(1 - w_norm, Math.max(0, xNorm + (wNorm - w_norm)))
      : Math.min(1 - w_norm, Math.max(0, xNorm));
  return clampNormRect({
    x: x_norm,
    y: Math.min(1 - h_norm, Math.max(0, yNorm)),
    w: w_norm,
    h: h_norm,
  });
}

export function resizeBoxCommentForText(
  text: string,
  xNorm: number,
  yNorm: number,
  preferredWNorm: number | null,
  canvasWidthPx: number,
  canvasHeightPx: number,
): { x_norm: number; y_norm: number; w_norm: number; h_norm: number } {
  const maxW = BOX_COMMENT_MAX_WIDTH_FRACTION;
  const minW = BOX_COMMENT_MIN_WIDTH_PX / Math.max(1, canvasWidthPx);
  if (preferredWNorm != null && preferredWNorm > 0) {
    return resizeBoxCommentWidth(
      text,
      xNorm,
      yNorm,
      Math.min(maxW, Math.max(minW, preferredWNorm)),
      canvasWidthPx,
      canvasHeightPx,
      "left",
    );
  }
  const size = sizeBoxCommentFromText(text, canvasWidthPx, canvasHeightPx);
  return clampNormRect({
    x: Math.min(1 - size.w_norm, Math.max(0, xNorm)),
    y: Math.min(1 - size.h_norm, Math.max(0, yNorm)),
    w: size.w_norm,
    h: size.h_norm,
  });
}

export function appendFeedbackAvoidingDuplicate(
  existing: string | null | undefined,
  addition: string,
): string {
  const next = addition.trim();
  if (!next) return existing ?? "";
  const current = (existing ?? "").trim();
  if (!current) return next;
  if (current.includes(next)) return existing ?? next;
  return `${current}\n${next}`;
}
