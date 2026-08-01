/** Pure geometry helpers for normalised annotation coordinates. */

export type PointNorm = { x: number; y: number };
export type BoxNorm = { x: number; y: number; w: number; h: number };

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Convert a viewport pointer into normalised canvas coordinates (0–1). */
export function pointerToNorm(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
): PointNorm {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  return {
    x: clamp01((clientX - rect.left) / rect.width),
    y: clamp01((clientY - rect.top) / rect.height),
  };
}

/** Build a normalised box from drag start/end, independent of drag direction. */
export function dragBoxFromPoints(start: PointNorm, end: PointNorm): BoxNorm {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x: clamp01(x),
    y: clamp01(y),
    w: clamp01(Math.abs(end.x - start.x)),
    h: clamp01(Math.abs(end.y - start.y)),
  };
}

/**
 * Exact percentage styles for overlays. Does not inflate tiny boxes with a
 * minimum percentage — stored geometry must match the teacher's drag.
 */
export function exactAnnotationStyle(box: BoxNorm): {
  left: string;
  top: string;
  width: string;
  height: string;
} {
  return {
    left: `${clamp01(box.x) * 100}%`,
    top: `${clamp01(box.y) * 100}%`,
    width: `${clamp01(box.w) * 100}%`,
    height: `${clamp01(box.h) * 100}%`,
  };
}

/** Compact speech-bubble marker size as a fraction of canvas. */
export const SPEECH_BUBBLE_SIZE = 0.028;

export function speechBubbleBox(point: PointNorm): BoxNorm {
  const size = SPEECH_BUBBLE_SIZE;
  return {
    x: clamp01(point.x - size / 2),
    y: clamp01(point.y - size / 2),
    w: size,
    h: size,
  };
}
