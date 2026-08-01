import { describe, expect, it } from "vitest";
import {
  applyAutomaticLabels,
  buildPassageRows,
  createPassageLine,
  normalizePassageConfig,
  normalizePassageLines,
  resolvePassageStart,
} from "./passage-numbering";

describe("passage line labels", () => {
  it("derives legacy interval configs into modes without inventing labels", () => {
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

  it("keeps typed labels exactly beside each row", () => {
    const lines = [
      createPassageLine("Line one", 0, "1"),
      createPassageLine("Line two", 1, null),
      createPassageLine("Line three", 2, "A"),
    ];
    const { rows, showGutter } = buildPassageRows("ignored", {
      lines,
      show_line_numbers: true,
      line_number_mode: "manual",
    });
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.label)).toEqual(["1", null, "A"]);
    expect(rows.map((r) => r.showNumber)).toEqual([true, false, true]);
    expect(showGutter).toBe(true);
  });

  it("blank labels show no number beside that row", () => {
    const lines = normalizePassageLines(
      [
        { id: "a", order: 0, text: "Only text", label: "" },
        { id: "b", order: 1, text: "Also text", label: null },
      ],
      "",
    );
    const { rows, showGutter } = buildPassageRows("", { lines });
    expect(rows.every((r) => r.label == null)).toBe(true);
    expect(showGutter).toBe(false);
  });

  it("migrates legacy numbered indexes into editable labels once", () => {
    const config = normalizePassageConfig({
      show_line_numbers: true,
      line_number_mode: "manual",
      starting_line_number: 1,
      numbered_line_indexes: [0, 2],
      manual_line_labels: { "0": "1", "2": "15" },
    }, "A\nB\nC");
    expect(config.lines?.map((l) => l.label)).toEqual(["1", null, "15"]);
  });

  it("automatic helpers only populate editable label fields", () => {
    const base = [
      createPassageLine("a", 0, null),
      createPassageLine("b", 1, null),
      createPassageLine("c", 2, null),
      createPassageLine("d", 3, null),
      createPassageLine("e", 4, null),
      createPassageLine("f", 5, null),
    ];
    const everyLine = applyAutomaticLabels(base, "every_line", 1);
    expect(everyLine.map((l) => l.label)).toEqual(["1", "2", "3", "4", "5", "6"]);

    const everyFifth = applyAutomaticLabels(base, "every_5", 1);
    expect(everyFifth.map((l) => l.label)).toEqual([
      "1",
      null,
      null,
      null,
      null,
      "6",
    ]);

    const cleared = applyAutomaticLabels(everyLine, "clear");
    expect(cleared.every((l) => l.label == null)).toBe(true);
  });

  it("does not invent labels from browser wrap — only stored rows", () => {
    const { rows } = buildPassageRows("One long paragraph without newlines", {
      lines: [createPassageLine("One long paragraph without newlines", 0, "10")],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("10");
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
