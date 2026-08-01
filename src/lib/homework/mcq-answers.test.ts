import { describe, expect, it } from "vitest";
import {
  buildMcqAnswerJson,
  selectedMcqOptionIds,
} from "./mcq-answers";
import { applyMcqOptions, createBlock } from "./structure";

describe("mcq answer ids", () => {
  it("restores selections from json option ids", () => {
    const block = applyMcqOptions(createBlock("multiple_choice"), [
      { id: "opt-a", label: "Alpha", correct: true },
      { id: "opt-b", label: "Beta", correct: false },
      { id: "opt-c", label: "Gamma", correct: false },
      { id: "opt-d", label: "Delta", correct: false },
    ]);

    const ids = selectedMcqOptionIds(block, {
      json_value: buildMcqAnswerJson(["opt-c"]),
      text_value: "Gamma",
    });
    expect(ids).toEqual(["opt-c"]);
  });

  it("falls back to legacy label text", () => {
    const block = applyMcqOptions(createBlock("multiple_select"), [
      { id: "1", label: "One", correct: true },
      { id: "2", label: "Two", correct: true },
      { id: "3", label: "Three", correct: false },
    ]);
    expect(
      selectedMcqOptionIds(block, { text_value: "One\nThree", json_value: null }),
    ).toEqual(["1", "3"]);
  });
});
