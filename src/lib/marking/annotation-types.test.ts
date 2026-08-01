import { describe, expect, it } from "vitest";
import {
  annotationStyle,
  clampNorm,
  formatMarksLabel,
  useCircularMarkButtons,
} from "./annotation-types";

describe("annotation coordinate helpers", () => {
  it("clamps normalised coordinates", () => {
    expect(clampNorm(-0.2)).toBe(0);
    expect(clampNorm(1.4)).toBe(1);
    expect(clampNorm(0.25)).toBe(0.25);
  });

  it("builds percentage styles from normalised geometry without inflation", () => {
    expect(
      annotationStyle({
        x_norm: 0.1,
        y_norm: 0.2,
        w_norm: 0.3,
        h_norm: 0.4,
      }),
    ).toEqual({
      left: "10%",
      top: "20%",
      width: "30%",
      height: "40%",
    });
    expect(
      annotationStyle({
        x_norm: 0.1,
        y_norm: 0.2,
        w_norm: 0.01,
        h_norm: 0.005,
      }),
    ).toEqual({
      left: "10%",
      top: "20%",
      width: "1%",
      height: "0.5%",
    });
  });

  it("formats mark labels and circular thresholds", () => {
    expect(formatMarksLabel(0)).toBe("0 marks");
    expect(formatMarksLabel(1)).toBe("1 mark");
    expect(formatMarksLabel(5)).toBe("5 marks");
    expect(useCircularMarkButtons(5, 10)).toBe(true);
    expect(useCircularMarkButtons(20, 10)).toBe(false);
  });
});
