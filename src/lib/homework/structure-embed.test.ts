import { describe, expect, it } from "vitest";
import {
  asEmbeddedArray,
  firstEmbeddedRecord,
  resolveMcqOptions,
  createBlock,
  applyMcqOptions,
} from "./structure";
import { collectPublishWarnings } from "./publish-readiness";
import { emptySection } from "./structure";
import { getMcqOptionText, normalizeMcqOption } from "./mcq-options";

describe("PostgREST one-to-one embed normalisation", () => {
  it("reads an object embed (unique FK) instead of requiring [0]", () => {
    const asObject = { id: "question-1", prompt: "Essay" };
    expect(firstEmbeddedRecord(asObject)?.id).toBe("question-1");
    expect(firstEmbeddedRecord([asObject])?.id).toBe("question-1");
    expect(firstEmbeddedRecord(null)).toBeNull();
    expect(firstEmbeddedRecord([])).toBeNull();
  });

  it("normalises table-cell embeds that may arrive as a single object", () => {
    expect(asEmbeddedArray({ row_index: 0, col_index: 1 })).toHaveLength(1);
    expect(
      asEmbeddedArray([
        { row_index: 0, col_index: 0 },
        { row_index: 0, col_index: 1 },
      ]),
    ).toHaveLength(2);
  });
});

describe("MCQ validation against canonical option text", () => {
  it("accepts four populated options after load-shaped objects", () => {
    const mcq = createBlock("multiple_choice");
    mcq.content = "Who wrote Hamlet?";
    mcq.marking_mode = "automatic";
    // Simulate DB payload where text is canonical and label mirrors it.
    mcq.mcq_options = [
      normalizeMcqOption({ id: "a", text: "Shakespeare", correct: true }),
      normalizeMcqOption({ id: "b", text: "Marlowe", correct: false }),
      normalizeMcqOption({ id: "c", text: "Jonson", correct: false }),
      normalizeMcqOption({ id: "d", text: "Kyd", correct: false }),
    ];
    const section = emptySection();
    section.blocks = [mcq];
    expect(
      collectPublishWarnings([section]).filter((w) => w.blocking),
    ).toHaveLength(0);
    expect(resolveMcqOptions(mcq).filter((o) => getMcqOptionText(o).trim())).toHaveLength(
      4,
    );
  });

  it("falls back to legacy label when text is an empty string", () => {
    expect(
      getMcqOptionText({ text: "", label: "Charles Dickens" }),
    ).toBe("Charles Dickens");
    const healed = normalizeMcqOption({
      id: "1",
      text: "",
      label: "Dickens",
      correct: false,
    });
    expect(healed.text).toBe("Dickens");
  });

  it("still blocks genuinely incomplete MCQs", () => {
    const mcq = applyMcqOptions(createBlock("multiple_choice"), [
      { id: "a", text: "Only one", correct: true },
    ]);
    mcq.content = "Incomplete";
    const section = emptySection();
    section.blocks = [mcq];
    const blocking = collectPublishWarnings([section]).filter((w) => w.blocking);
    expect(blocking.length).toBeGreaterThan(0);
    expect(blocking[0]?.message.toLowerCase()).toMatch(/option/);
  });
});
