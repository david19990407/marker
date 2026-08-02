import { describe, expect, it } from "vitest";

/** Mirror VerticalMarkStrip value generation for numeric questions. */
function markStripValues(maximumMark: number, allowDecimals = false) {
  const numericMarks = allowDecimals
    ? Array.from(
        { length: Math.floor(maximumMark * 2) + 1 },
        (_, i) => i * 0.5,
      ).reverse()
    : Array.from(
        { length: Math.floor(maximumMark) + 1 },
        (_, i) => Math.floor(maximumMark) - i,
      );
  return [...numericMarks, "NA" as const];
}

describe("vertical mark strip values", () => {
  it("shows 1, 0 and NA for a one-mark question", () => {
    expect(markStripValues(1)).toEqual([1, 0, "NA"]);
  });

  it("shows 8 through 0 and NA for an eight-mark question", () => {
    expect(markStripValues(8)).toEqual([8, 7, 6, 5, 4, 3, 2, 1, 0, "NA"]);
  });

  it("produces a scrollable-length list for a thirty-mark question", () => {
    const values = markStripValues(30);
    expect(values[0]).toBe(30);
    expect(values[values.length - 1]).toBe("NA");
    expect(values).toHaveLength(32);
  });
});
