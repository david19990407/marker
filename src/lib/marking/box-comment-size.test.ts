import { describe, expect, it } from "vitest";
import {
  appendFeedbackAvoidingDuplicate,
  placeBoxCommentAtPoint,
  sizeBoxCommentFromText,
} from "./box-comment-size";

describe("box comment sizing", () => {
  it("keeps short comments compact and under half canvas width", () => {
    const size = sizeBoxCommentFromText("Good detail", 800, 1100);
    expect(size.w).toBeLessThanOrEqual(0.48);
    expect(size.w * 800).toBeGreaterThanOrEqual(140);
    expect(size.h * 1100).toBeGreaterThanOrEqual(36);
  });

  it("wraps long comments without exceeding max width fraction", () => {
    const long =
      "This is a substantially longer teacher comment that should wrap across multiple lines without stretching across the whole worksheet surface.";
    const size = sizeBoxCommentFromText(long, 900, 1200);
    expect(size.w).toBeLessThanOrEqual(0.48 + 0.001);
    expect(size.h).toBeGreaterThan(sizeBoxCommentFromText("Short", 900, 1200).h);
  });

  it("places boxes inside the worksheet near edges", () => {
    const box = placeBoxCommentAtPoint(
      { x: 0.95, y: 0.95 },
      "Edge note",
      800,
      1100,
    );
    expect(box.x + box.w).toBeLessThanOrEqual(1.0001);
    expect(box.y + box.h).toBeLessThanOrEqual(1.0001);
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
