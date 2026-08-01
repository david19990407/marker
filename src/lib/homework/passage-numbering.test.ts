import { describe, expect, it } from "vitest";
import {
  buildPassageRows,
  normalizePassageConfig,
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
    expect(shouldShowLineNumber(1, 1, config)).toBe(true);
    expect(shouldShowLineNumber(2, 1, config)).toBe(false);
    expect(shouldShowLineNumber(6, 1, config)).toBe(true);

    const manual = normalizePassageConfig({
      show_line_numbers: true,
      line_number_mode: "manual",
      line_number_interval: 5,
      starting_line_number: 1,
      manual_line_numbers: [2, 7, 15, 24],
    });
    expect(shouldShowLineNumber(2, 1, manual)).toBe(true);
    expect(shouldShowLineNumber(1, 1, manual)).toBe(false);
    expect(shouldShowLineNumber(7, 1, manual)).toBe(true);
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
      resolvePassageStart(
        { ...base, numbering_continuation: "restart" },
        20,
      ),
    ).toBe(1);
    expect(
      resolvePassageStart(
        { ...base, numbering_continuation: "continue" },
        20,
      ),
    ).toBe(21);
  });
});
