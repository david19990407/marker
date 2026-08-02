import { describe, expect, it } from "vitest";
import {
  appendFeedbackAvoidingDuplicate,
  placeBoxCommentAtPoint,
  sizeBoxCommentFromText,
} from "./box-comment-size";

describe("box comment sizing", () => {
  it("starts empty comments at ~200px default width", () => {
    const size = sizeBoxCommentFromText("", 800, 1100);
    expect(Math.round(size.w_norm * 800)).toBe(200);
  });

  it("keeps short comments compact and under half canvas width", () => {
    const size = sizeBoxCommentFromText("Good detail", 800, 1100);
    expect(size.w_norm).toBeLessThanOrEqual(0.5);
    expect(size.w_norm * 800).toBeGreaterThanOrEqual(140);
    expect(size.h_norm * 1100).toBeGreaterThanOrEqual(20);
  });

  it("wraps long comments without exceeding max width fraction", () => {
    const long =
      "This is a substantially longer teacher comment that should wrap across multiple lines without stretching across the whole worksheet surface.";
    const size = sizeBoxCommentFromText(long, 900, 1200);
    expect(size.w_norm).toBeLessThanOrEqual(0.5 + 0.001);
    // Long text should reach the max-width band rather than staying at the
    // empty-box default of 200px.
    expect(size.w_norm * 900).toBeGreaterThan(200);
  });

  it("places boxes inside the worksheet near edges", () => {
    const box = placeBoxCommentAtPoint(0.95, 0.95, "Edge note", 800, 1100);
    expect(box.x_norm + box.w_norm).toBeLessThanOrEqual(1.0001);
    expect(box.y_norm + box.h_norm).toBeLessThanOrEqual(1.0001);
  });

  it("avoids inserting duplicate feedback lines", () => {
    expect(appendFeedbackAvoidingDuplicate("Well done", "Well done")).toBe(
      "Well done",
    );
    expect(appendFeedbackAvoidingDuplicate("Well done", "Add quote")).toBe(
      "Well done\nAdd quote",
    );
  });
});
