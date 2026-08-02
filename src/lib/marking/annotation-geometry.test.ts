import { describe, expect, it } from "vitest";
import {
  dragBoxFromPoints,
  exactAnnotationStyle,
  normalizeStampDimensions,
  pointerToNorm,
  speechBubbleBox,
  stampNormSize,
  tailFromPointer,
} from "./annotation-geometry";

describe("annotation geometry", () => {
  const canvas = { left: 100, top: 50, width: 800, height: 600 };

  it("maps top-left to bottom-right drag exactly", () => {
    const start = pointerToNorm(100, 50, canvas);
    const end = pointerToNorm(500, 350, canvas);
    const box = dragBoxFromPoints(start, end);
    expect(box.x).toBeCloseTo(0, 5);
    expect(box.y).toBeCloseTo(0, 5);
    expect(box.w).toBeCloseTo(0.5, 5);
    expect(box.h).toBeCloseTo(0.5, 5);
  });

  it("maps opposite-direction drag to the same box", () => {
    const a = pointerToNorm(500, 350, canvas);
    const b = pointerToNorm(100, 50, canvas);
    const box = dragBoxFromPoints(a, b);
    expect(box.x).toBeCloseTo(0, 5);
    expect(box.y).toBeCloseTo(0, 5);
    expect(box.w).toBeCloseTo(0.5, 5);
    expect(box.h).toBeCloseTo(0.5, 5);
  });

  it("keeps logical size at 50% zoom (scaled CSS rect)", () => {
    const zoomed = { left: 200, top: 100, width: 400, height: 300 };
    const start = pointerToNorm(200, 100, zoomed);
    const end = pointerToNorm(400, 250, zoomed);
    const box = dragBoxFromPoints(start, end);
    expect(box.w).toBeCloseTo(0.5, 5);
    expect(box.h).toBeCloseTo(0.5, 5);
  });

  it("keeps logical size at 150% zoom", () => {
    const zoomed = { left: 50, top: 20, width: 1200, height: 900 };
    const start = pointerToNorm(50, 20, zoomed);
    const end = pointerToNorm(650, 470, zoomed);
    const box = dragBoxFromPoints(start, end);
    expect(box.w).toBeCloseTo(0.5, 5);
    expect(box.h).toBeCloseTo(0.5, 5);
  });

  it("accounts for scrolled canvas offsets via bounding rect", () => {
    const scrolled = { left: -120, top: -80, width: 800, height: 1200 };
    const start = pointerToNorm(80, 40, scrolled);
    const end = pointerToNorm(280, 240, scrolled);
    const box = dragBoxFromPoints(start, end);
    expect(box.x).toBeCloseTo((80 - -120) / 800, 5);
    expect(box.y).toBeCloseTo((40 - -80) / 1200, 5);
    expect(box.w).toBeCloseTo(200 / 800, 5);
    expect(box.h).toBeCloseTo(200 / 1200, 5);
  });

  it("does not inflate tiny highlights in style output", () => {
    const style = exactAnnotationStyle({ x: 0.1, y: 0.2, w: 0.01, h: 0.005 });
    expect(style.width).toBe("1%");
    expect(style.height).toBe("0.5%");
  });

  it("creates an expanded speech-bubble box", () => {
    const box = speechBubbleBox({ x: 0.5, y: 0.5 });
    expect(box.w).toBeGreaterThan(0.1);
    expect(box.h).toBeGreaterThan(0.05);
    expect(box.x).toBeLessThan(0.5);
    expect(box.y).toBeLessThan(0.5);
  });

  it("sizes stamps as visual squares using canvas aspect", () => {
    const size = stampNormSize(8, 800 / 1200);
    expect(size.w).toBeCloseTo(0.08, 5);
    expect(size.h).toBeCloseTo(0.08 * (800 / 1200), 5);
    expect(size.h).toBeLessThan(size.w);
  });

  it("normalises legacy equal-norm stamp rectangles", () => {
    const next = normalizeStampDimensions(
      {
        annotation_type: "stamp",
        w_norm: 0.08,
        h_norm: 0.08,
        geometry: {},
      },
      0.707,
    );
    expect(next).not.toBeNull();
    expect(next!.w_norm).toBeCloseTo(0.08, 5);
    expect(next!.h_norm).toBeCloseTo(0.08 * 0.707, 5);
    expect(next!.geometry.stamp_normalised).toBe(true);
  });

  it("skips already-normalised stamps", () => {
    const next = normalizeStampDimensions({
      annotation_type: "stamp",
      w_norm: 0.08,
      h_norm: 0.05,
      geometry: { stamp_normalised: true },
    });
    expect(next).toBeNull();
  });

  it("maps pointer to speech-bubble tail edges", () => {
    const rect = { left: 0, top: 0, width: 100, height: 80 };
    expect(tailFromPointer(50, 78, rect).tail_edge).toBe("bottom");
    expect(tailFromPointer(50, 2, rect).tail_edge).toBe("top");
    expect(tailFromPointer(2, 40, rect).tail_edge).toBe("left");
    expect(tailFromPointer(98, 40, rect).tail_edge).toBe("right");
  });

  it("survives browser resize by re-normalising against new rect", () => {
    const narrow = { left: 0, top: 0, width: 500, height: 400 };
    const wide = { left: 0, top: 0, width: 1000, height: 400 };
    const startN = pointerToNorm(100, 100, narrow);
    const endN = pointerToNorm(200, 200, narrow);
    const boxNarrow = dragBoxFromPoints(startN, endN);
    const startW = pointerToNorm(200, 100, wide);
    const endW = pointerToNorm(400, 200, wide);
    const boxWide = dragBoxFromPoints(startW, endW);
    expect(boxNarrow.x).toBeCloseTo(boxWide.x, 5);
    expect(boxNarrow.w).toBeCloseTo(boxWide.w, 5);
  });
});
