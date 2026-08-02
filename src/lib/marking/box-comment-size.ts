/** Automatic sizing for box comments from text content. */

import { clamp01, type BoxNorm, type PointNorm } from "./annotation-geometry";

const MIN_WIDTH_PX = 140;
const MAX_WIDTH_FRACTION = 0.48;
const MIN_HEIGHT_PX = 36;
const PADDING_X = 16;
const PADDING_Y = 14;
const LINE_HEIGHT = 16;
const FONT = "12px system-ui, sans-serif";

function measureTextBlock(
  text: string,
  maxWidthPx: number,
): { width: number; height: number } {
  if (typeof document === "undefined") {
    const chars = Math.max(text.length, 1);
    const estimatedWidth = Math.min(
      maxWidthPx,
      Math.max(MIN_WIDTH_PX, chars * 7 + PADDING_X),
    );
    const lines = Math.ceil((chars * 7) / Math.max(1, estimatedWidth - PADDING_X));
    return {
      width: estimatedWidth,
      height: Math.max(MIN_HEIGHT_PX, lines * LINE_HEIGHT + PADDING_Y),
    };
  }

  const el = document.createElement("div");
  el.style.cssText = [
    "position:absolute",
    "visibility:hidden",
    "pointer-events:none",
    `left:-9999px`,
    `top:0`,
    `max-width:${maxWidthPx}px`,
    `min-width:${MIN_WIDTH_PX}px`,
    `padding:6px 8px`,
    `box-sizing:border-box`,
    `font:${FONT}`,
    `line-height:${LINE_HEIGHT}px`,
    `white-space:pre-wrap`,
    `word-break:break-word`,
  ].join(";");
  el.textContent = text || " ";
  document.body.appendChild(el);
  const width = Math.ceil(
    Math.min(maxWidthPx, Math.max(MIN_WIDTH_PX, el.offsetWidth)),
  );
  // Remeasure at fixed width for wrapped height.
  el.style.width = `${width}px`;
  const height = Math.ceil(Math.max(MIN_HEIGHT_PX, el.offsetHeight));
  document.body.removeChild(el);
  return { width, height };
}

/** Compute normalised box size for comment text on a canvas. */
export function sizeBoxCommentFromText(
  text: string,
  canvasWidthPx: number,
  canvasHeightPx: number,
): { w: number; h: number } {
  const canvasW = Math.max(1, canvasWidthPx);
  const canvasH = Math.max(1, canvasHeightPx);
  const maxWidthPx = Math.max(MIN_WIDTH_PX, canvasW * MAX_WIDTH_FRACTION);
  const measured = measureTextBlock(text.trim() || " ", maxWidthPx);
  return {
    w: clamp01(measured.width / canvasW),
    h: clamp01(measured.height / canvasH),
  };
}

/** Place a sized box at a drop point, keeping it inside the worksheet. */
export function placeBoxCommentAtPoint(
  point: PointNorm,
  text: string,
  canvasWidthPx: number,
  canvasHeightPx: number,
): BoxNorm {
  const size = sizeBoxCommentFromText(text, canvasWidthPx, canvasHeightPx);
  let x = point.x;
  let y = point.y;
  if (x + size.w > 1) x = Math.max(0, 1 - size.w);
  if (y + size.h > 1) y = Math.max(0, 1 - size.h);
  x = clamp01(x);
  y = clamp01(y);
  return { x, y, w: size.w, h: size.h };
}

/** Recompute height (and width up to max) after text edits; keep top-left. */
export function resizeBoxCommentForText(
  current: BoxNorm,
  text: string,
  canvasWidthPx: number,
  canvasHeightPx: number,
): BoxNorm {
  const size = sizeBoxCommentFromText(text, canvasWidthPx, canvasHeightPx);
  const w = Math.min(size.w, Math.max(current.w, size.w));
  const h = size.h;
  return {
    x: clamp01(Math.min(current.x, 1 - w)),
    y: clamp01(Math.min(current.y, 1 - h)),
    w: clamp01(w),
    h: clamp01(h),
  };
}

export function appendFeedbackAvoidingDuplicate(
  existing: string | null | undefined,
  text: string,
): string {
  const next = text.trim();
  if (!next) return existing?.trim() ?? "";
  const prev = existing?.trim() ?? "";
  if (!prev) return next;
  if (prev.split(/\n+/).some((line) => line.trim() === next)) return prev;
  if (prev.includes(next)) return prev;
  return `${prev}\n${next}`;
}
