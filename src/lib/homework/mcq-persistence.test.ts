import { describe, expect, it } from "vitest";
import {
  applyMcqOptions,
  createBlock,
  resolveMcqOptions,
  structureToPayload,
} from "./structure";

describe("MCQ persistence payload", () => {
  it("stores all correct answers for multiple select", () => {
    const block = createBlock("multiple_select");
    const withOptions = applyMcqOptions(block, [
      { id: "a", label: "Alpha", correct: true, feedback: "yes" },
      { id: "b", label: "Beta", correct: false, feedback: "" },
      { id: "c", label: "Gamma", correct: true, feedback: "also" },
    ]);

    const [sectionPayload] = structureToPayload([
      {
        _id: "sec-1",
        title: "Section",
        blocks: [withOptions],
        subsections: [],
      },
    ]);
    const question = sectionPayload.blocks[0];

    expect(question.correct_option_indexes).toEqual([0, 2]);
    expect(question.choices).toEqual([
      { id: "a", label: "Alpha", feedback: "yes", is_correct: true },
      { id: "b", label: "Beta", feedback: "", is_correct: false },
      { id: "c", label: "Gamma", feedback: "also", is_correct: true },
    ]);
    expect(question.option_feedback).toEqual(["yes", "", "also"]);
    expect(question.correct_answer).toEqual({
      indexes: [0, 2],
      labels: ["Alpha", "Gamma"],
    });
  });

  it("keeps option edits when applying from previous block state", () => {
    const block = createBlock("multiple_choice");
    const first = applyMcqOptions(block, [
      { id: "1", label: "One", correct: true },
      { id: "2", label: "Two", correct: false },
    ]);
    const second = applyMcqOptions(first, [
      { id: "1", label: "One edited", correct: true },
      { id: "2", label: "Two edited", correct: false },
    ]);
    expect(resolveMcqOptions(second).map((o) => o.label)).toEqual([
      "One edited",
      "Two edited",
    ]);
    expect(second.correct_option_indexes).toEqual([0]);
  });
});
