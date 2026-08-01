import { describe, expect, it } from "vitest";
import { evaluateStructuredCompletion } from "./completion";
import { buildMcqAnswerJson } from "./mcq-answers";
import { collectResponses } from "./response-collect";
import { applyMcqOptions, createBlock, emptySection } from "./structure";

describe("structured submission flow helpers", () => {
  it("collects mcq option ids into json_value and labels into text_value", () => {
    const mcq = applyMcqOptions(createBlock("multiple_choice"), [
      { id: "a", label: "Red", correct: true },
      { id: "b", label: "Blue", correct: false },
    ]);
    const section = emptySection();
    section.blocks = [mcq];
    const values = {
      [mcq.question_id!]: { type: "mcq" as const, optionIds: ["b"] },
    };
    const responses = collectResponses(values, [section]);
    expect(responses).toHaveLength(1);
    expect(responses[0].json_value).toEqual(buildMcqAnswerJson(["b"]));
    expect(responses[0].text_value).toBe("Blue");
  });

  it("counts mcq answers from option ids for completion", () => {
    const mcq = applyMcqOptions(createBlock("multiple_choice"), [
      { id: "a", label: "Red", correct: true },
      { id: "b", label: "Blue", correct: false },
    ]);
    mcq.required = true;
    mcq.content = "Colour?";
    const section = emptySection();
    section.title = "Q";
    section.blocks = [mcq];

    const incomplete = evaluateStructuredCompletion([section], []);
    expect(incomplete.isComplete).toBe(false);

    const complete = evaluateStructuredCompletion([section], [
      {
        question_id: mcq.question_id!,
        text_value: "Blue",
        json_value: buildMcqAnswerJson(["b"]),
      },
    ]);
    expect(complete.isComplete).toBe(true);
    expect(complete.answeredAssessableCount).toBe(1);
  });
});
