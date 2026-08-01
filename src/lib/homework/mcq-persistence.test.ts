import { describe, expect, it } from "vitest";
import {
  applyMcqOptions,
  createBlock,
  resolveMcqOptions,
  structureToPayload,
} from "./structure";
import { getMcqOptionText } from "./mcq-options";
import { collectPublishWarnings } from "./publish-readiness";
import { emptySection } from "./structure";

describe("MCQ persistence payload", () => {
  it("stores answer text on the shared text property", () => {
    const block = createBlock("multiple_select");
    const withOptions = applyMcqOptions(block, [
      { id: "a", text: "Alpha", correct: true, feedback: "yes" },
      { id: "b", text: "Beta", correct: false, feedback: "" },
      { id: "c", text: "Gamma", correct: true, feedback: "also" },
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
      {
        id: "a",
        text: "Alpha",
        label: "Alpha",
        feedback: "yes",
        is_correct: true,
      },
      {
        id: "b",
        text: "Beta",
        label: "Beta",
        feedback: "",
        is_correct: false,
      },
      {
        id: "c",
        text: "Gamma",
        label: "Gamma",
        feedback: "also",
        is_correct: true,
      },
    ]);
    expect(question.option_feedback).toEqual(["yes", "", "also"]);
    expect(question.correct_answer).toEqual({
      indexes: [0, 2],
      labels: ["Alpha", "Gamma"],
    });
    expect(question.config).toMatchObject({ option_label_style: "letters" });
  });

  it("keeps option edits when applying from previous block state", () => {
    const block = createBlock("multiple_choice");
    const first = applyMcqOptions(block, [
      { id: "1", text: "One", correct: true },
      { id: "2", text: "Two", correct: false },
    ]);
    const second = applyMcqOptions(first, [
      { id: "1", text: "One edited", correct: true },
      { id: "2", text: "Two edited", correct: false },
    ]);
    expect(resolveMcqOptions(second).map((o) => getMcqOptionText(o))).toEqual([
      "One edited",
      "Two edited",
    ]);
    expect(second.correct_option_indexes).toEqual([0]);
  });

  it("validates option.text so four populated answers publish", () => {
    const section = emptySection();
    const mcq = createBlock("multiple_choice");
    mcq.content = "Who wrote An Inspector Calls?";
    mcq.option_label_style = "letters";
    const filled = applyMcqOptions(mcq, [
      { id: "a", text: "William Shakespeare", correct: false },
      { id: "b", text: "Charles Dickens", correct: false },
      { id: "c", text: "J. B. Priestley", correct: true },
      { id: "d", text: "George Orwell", correct: false },
    ]);
    section.blocks = [filled];
    expect(
      collectPublishWarnings([section]).filter((w) => w.blocking),
    ).toHaveLength(0);
  });

  it("heals legacy Option A label + feedback answer before validation", () => {
    const section = emptySection();
    const mcq = createBlock("multiple_choice");
    mcq.content = "Author?";
    mcq.mcq_options = [
      {
        id: "a",
        label: "Option A",
        text: "Option A",
        feedback: "William Shakespeare",
        correct: true,
      },
      {
        id: "b",
        label: "Option B",
        text: "Option B",
        feedback: "Charles Dickens",
        correct: false,
      },
      {
        id: "c",
        label: "Option C",
        text: "Option C",
        feedback: "J. B. Priestley",
        correct: false,
      },
      {
        id: "d",
        label: "Option D",
        text: "Option D",
        feedback: "George Orwell",
        correct: false,
      },
    ];
    section.blocks = [mcq];
    const resolved = resolveMcqOptions(mcq);
    expect(resolved.map((o) => getMcqOptionText(o))).toEqual([
      "William Shakespeare",
      "Charles Dickens",
      "J. B. Priestley",
      "George Orwell",
    ]);
    expect(
      collectPublishWarnings([section]).filter((w) => w.blocking),
    ).toHaveLength(0);
  });
});
