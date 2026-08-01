import { describe, expect, it } from "vitest";
import {
  buildPassageRows,
  displayNumbersToIndexes,
  normalizePassageConfig,
  parseManualLineNumberList,
  resolvePassageStart,
  shouldShowLineNumber,
} from "./passage-numbering";

describe("passage numbering", () => {
  it("derives legacy interval configs into modes", () => {
    expect(normalizePassageConfig({ show_line_numbers: false }).line_number_mode).toBe(
      "none",
    );
    expect(
      normalizePassageConfig({ show_line_numbers: true, line_number_interval: 1 })
        .line_number_mode,
    ).toBe("every_line");
    expect(
      normalizePassageConfig({ show_line_numbers: true, line_number_interval: 5 })
        .line_number_mode,
    ).toBe("every_5");
  });

  it("numbers hard newlines only", () => {
    const { rows, endingLineNumber } = buildPassageRows(
      "Line one\nLine two\nLine three",
      {
        show_line_numbers: true,
        line_number_mode: "every_line",
        line_number_interval: 1,
        starting_line_number: 1,
      },
    );
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.displayNumber)).toEqual([1, 2, 3]);
    expect(rows.every((r) => r.showNumber)).toBe(true);
    expect(endingLineNumber).toBe(3);
  });

  it("supports every fifth and manual display sets", () => {
    const config = normalizePassageConfig({
      show_line_numbers: true,
      line_number_mode: "every_5",
      line_number_interval: 5,
      starting_line_number: 1,
    });
    expect(shouldShowLineNumber(0, 1, 1, config)).toBe(true);
    expect(shouldShowLineNumber(1, 2, 1, config)).toBe(false);
    expect(shouldShowLineNumber(5, 6, 1, config)).toBe(true);

    const manual = normalizePassageConfig({
      show_line_numbers: true,
      line_number_mode: "manual",
      line_number_interval: 5,
      starting_line_number: 1,
      manual_line_numbers: [2, 7, 15, 24],
    });
    expect(shouldShowLineNumber(1, 2, 1, manual)).toBe(true);
    expect(shouldShowLineNumber(0, 1, 1, manual)).toBe(false);
    expect(shouldShowLineNumber(6, 7, 1, manual)).toBe(true);
  });

  it("prefers numbered_line_indexes over display numbers", () => {
    const config = normalizePassageConfig({
      show_line_numbers: true,
      line_number_mode: "manual",
      line_number_interval: 5,
      starting_line_number: 1,
      numbered_line_indexes: [0, 2],
      manual_line_numbers: [99],
    });
    expect(shouldShowLineNumber(0, 1, 1, config)).toBe(true);
    expect(shouldShowLineNumber(1, 2, 1, config)).toBe(false);
    expect(shouldShowLineNumber(2, 3, 1, config)).toBe(true);
  });

  it("parses comma-separated manual lists without dropping values", () => {
    expect(parseManualLineNumberList("1, 6, 11, 16").values).toEqual([
      1, 6, 11, 16,
    ]);
    expect(parseManualLineNumberList("1,").values).toEqual([1]);
    expect(parseManualLineNumberList("1, x").error).toMatch(/whole number/i);
    expect(displayNumbersToIndexes([1, 6], 1, 20).indexes).toEqual([0, 5]);
  });

  it("supports custom labels on logical lines", () => {
    const { rows } = buildPassageRows("A\nB\nC\nD", {
      show_line_numbers: true,
      line_number_mode: "manual",
      line_number_interval: 5,
      starting_line_number: 1,
      numbered_line_indexes: [0, 2],
      manual_line_labels: { "0": 1, "2": 20 },
    });
    expect(rows[0].showNumber).toBe(true);
    expect(rows[0].displayNumber).toBe(1);
    expect(rows[2].showNumber).toBe(true);
    expect(rows[2].displayNumber).toBe(20);
    expect(rows[1].showNumber).toBe(false);
  });

  it("resolves restart, continue, and custom starts", () => {
    const base = normalizePassageConfig({
      show_line_numbers: true,
      line_number_mode: "every_line",
      line_number_interval: 1,
      starting_line_number: 10,
      numbering_continuation: "custom_start",
    });
    expect(resolvePassageStart(base, 20)).toBe(10);
    expect(
      resolvePassageStart({ ...base, numbering_continuation: "restart" }, 20),
    ).toBe(1);
    expect(
      resolvePassageStart({ ...base, numbering_continuation: "continue" }, 20),
    ).toBe(21);
  });
});
