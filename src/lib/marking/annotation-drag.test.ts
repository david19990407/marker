import { describe, expect, it } from "vitest";
import { clampNormBox } from "@/lib/marking/annotation-drag";

describe("clampNormBox", () => {
  it("keeps boxes inside the unit square", () => {
    expect(
      clampNormBox({ x_norm: -0.2, y_norm: 0.9, w_norm: 0.3, h_norm: 0.3 }),
    ).toEqual({
      x_norm: 0,
      y_norm: 0.7,
      w_norm: 0.3,
      h_norm: 0.3,
    });
  });

  it("enforces minimum size", () => {
    const box = clampNormBox({
      x_norm: 0.1,
      y_norm: 0.1,
      w_norm: 0.001,
      h_norm: 0.001,
    });
    expect(box.w_norm).toBeGreaterThanOrEqual(0.008);
    expect(box.h_norm).toBeGreaterThanOrEqual(0.008);
  });
});
