/** Shared helpers for pointer-local annotation dragging without server lag. */

export type NormBox = {
  x_norm: number;
  y_norm: number;
  w_norm: number;
  h_norm: number;
};

export function clampNormBox(box: NormBox): NormBox {
  const w = Math.min(0.98, Math.max(0.008, box.w_norm));
  const h = Math.min(0.98, Math.max(0.008, box.h_norm));
  return {
    w_norm: w,
    h_norm: h,
    x_norm: Math.min(1 - w, Math.max(0, box.x_norm)),
    y_norm: Math.min(1 - h, Math.max(0, box.y_norm)),
  };
}

/** Apply percentage geometry directly to a DOM node (bypasses React until commit). */
export function applyNormBoxStyle(
  el: HTMLElement | null,
  box: NormBox,
): void {
  if (!el) return;
  el.style.left = `${box.x_norm * 100}%`;
  el.style.top = `${box.y_norm * 100}%`;
  el.style.width = `${box.w_norm * 100}%`;
  el.style.height = `${box.h_norm * 100}%`;
}

/**
 * Schedule a callback on the next animation frame, coalescing rapid pointer moves.
 */
export function createRafScheduler() {
  let frame = 0;
  let pending: (() => void) | null = null;

  return {
    schedule(fn: () => void) {
      pending = fn;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const run = pending;
        pending = null;
        run?.();
      });
    },
    cancel() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      pending = null;
    },
  };
}
