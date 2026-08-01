/** Pure geometry helpers for normalised annotation coordinates. */

export type PointNorm = { x: number; y: number };
export type BoxNorm = { x: number; y: number; w: number; h: number };

export type TailEdge = "left" | "right" | "top" | "bottom";

export type SpeechTailMeta = {
  tail_edge: TailEdge;
  /** 0–1 position along the chosen edge. */
  tail_offset: number;
  /** Relative length as a fraction of the shorter bubble side. */
  tail_length: number;
};

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

/** Compact speech-bubble collapsed marker size as a fraction of canvas width. */
export const SPEECH_BUBBLE_MARKER_SIZE = 0.028;

/** Default expanded speech-bubble size. */
export const DEFAULT_SPEECH_BUBBLE: BoxNorm = {
  x: 0,
  y: 0,
  w: 0.18,
  h: 0.09,
};

export const DEFAULT_SPEECH_TAIL: SpeechTailMeta = {
  tail_edge: "bottom",
  tail_offset: 0.5,
  tail_length: 0.35,
};

/** Place an expanded speech bubble centred on a point. */
export function speechBubbleBox(point: PointNorm): BoxNorm {
  const w = DEFAULT_SPEECH_BUBBLE.w;
  const h = DEFAULT_SPEECH_BUBBLE.h;
  return {
    x: clamp01(point.x - w / 2),
    y: clamp01(point.y - h / 2),
    w,
    h,
  };
}

/**
 * Stamp size as a visual square: width % of canvas width, height adjusted by
 * canvas aspect so the on-screen box is square (not a tall normalised square).
 */
export function stampNormSize(
  sizePct: number,
  canvasAspect: number,
): { w: number; h: number } {
  const w = clamp01(Math.max(0.01, sizePct / 100));
  const aspect =
    Number.isFinite(canvasAspect) && canvasAspect > 0 ? canvasAspect : 0.707;
  const h = clamp01(w * aspect);
  return { w, h };
}

/**
 * Detect legacy stamps that used equal w_norm/h_norm (square in normalised
 * space → tall rectangle on a portrait worksheet) and tighten height.
 */
export function normalizeStampDimensions(
  annotation: {
    annotation_type: string;
    w_norm: number;
    h_norm: number;
    geometry?: Record<string, unknown> | null;
  },
  canvasAspect = 0.707,
): { w_norm: number; h_norm: number; geometry: Record<string, unknown> } | null {
  if (annotation.annotation_type !== "stamp") return null;
  if (annotation.geometry?.stamp_normalised === true) return null;
  const w = annotation.w_norm;
  const h = annotation.h_norm;
  if (!(w > 0) || !(h > 0)) return null;

  const aspect =
    Number.isFinite(canvasAspect) && canvasAspect > 0 ? canvasAspect : 0.707;
  const expectedH = clamp01(w * aspect);

  const equalNorms = Math.abs(w - h) < 0.002;
  const oversizedH = h > expectedH * 1.25;

  if (!equalNorms && !oversizedH) return null;

  return {
    w_norm: w,
    h_norm: expectedH,
    geometry: {
      ...(annotation.geometry ?? {}),
      stamp_normalised: true,
    },
  };
}

export function readCollapsed(geometry: Record<string, unknown> | null | undefined) {
  return geometry?.collapsed === true;
}

export function readSpeechTail(
  geometry: Record<string, unknown> | null | undefined,
): SpeechTailMeta {
  const edge = geometry?.tail_edge;
  const validEdge =
    edge === "left" || edge === "right" || edge === "top" || edge === "bottom"
      ? edge
      : DEFAULT_SPEECH_TAIL.tail_edge;
  const offset = Number(geometry?.tail_offset);
  const length = Number(geometry?.tail_length);
  return {
    tail_edge: validEdge,
    tail_offset: clamp01(Number.isFinite(offset) ? offset : DEFAULT_SPEECH_TAIL.tail_offset),
    tail_length: Number.isFinite(length)
      ? Math.min(0.8, Math.max(0.15, length))
      : DEFAULT_SPEECH_TAIL.tail_length,
  };
}

/**
 * Map a pointer relative to a bubble's client rect onto the nearest edge and
 * an offset along that edge (for movable speech-bubble tails).
 */
export function tailFromPointer(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
): Pick<SpeechTailMeta, "tail_edge" | "tail_offset"> {
  if (rect.width <= 0 || rect.height <= 0) {
    return { tail_edge: "bottom", tail_offset: 0.5 };
  }
  const x = clamp01((clientX - rect.left) / rect.width);
  const y = clamp01((clientY - rect.top) / rect.height);
  const distTop = y;
  const distBottom = 1 - y;
  const distLeft = x;
  const distRight = 1 - x;
  const min = Math.min(distTop, distBottom, distLeft, distRight);
  if (min === distTop) return { tail_edge: "top", tail_offset: x };
  if (min === distBottom) return { tail_edge: "bottom", tail_offset: x };
  if (min === distLeft) return { tail_edge: "left", tail_offset: y };
  return { tail_edge: "right", tail_offset: y };
}
