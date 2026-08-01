import { describe, expect, it } from "vitest";
import { createBlock, emptySection } from "./structure";
import {
  collectPublishWarnings,
  formatPublishIssueList,
  isEmptyMcqDraft,
} from "./publish-readiness";

describe("collectPublishWarnings", () => {
  it("flags empty media and incomplete MCQs with question numbers", () => {
    const section = emptySection();
    section.title = "Unit 1";
    const image = createBlock("image");
    const mcq = createBlock("multiple_choice");
    mcq.content = "Pick one";
    mcq.mcq_options = [{ id: "only", label: "A", correct: false }];
    mcq.marking_mode = "automatic";
    section.blocks = [image, mcq];

    const warnings = collectPublishWarnings([section]);
    expect(warnings.some((w) => w.message.includes("file or URL"))).toBe(true);
    const blocking = warnings.filter((w) => w.blocking);
    expect(blocking.some((w) => w.message.toLowerCase().includes("option"))).toBe(
      true,
    );
    expect(blocking.some((w) => w.questionNumber === 1)).toBe(true);
    expect(formatPublishIssueList(blocking)).toMatch(/Question 1/);
  });

  it("accepts a valid four-option single-choice MCQ", () => {
    const section = emptySection();
    const mcq = createBlock("multiple_choice");
    mcq.content = "Which answer is correct?";
    mcq.marking_mode = "automatic";
    mcq.mcq_options = [
      { id: "a", label: "A", correct: false },
      { id: "b", label: "B", correct: true },
      { id: "c", label: "C", correct: false },
      { id: "d", label: "D", correct: false },
    ];
    section.blocks = [mcq];
    const warnings = collectPublishWarnings([section]);
    expect(warnings.filter((w) => w.blocking)).toHaveLength(0);
  });

  it("does not require a correct answer for teacher-reviewed MCQs", () => {
    const section = emptySection();
    const mcq = createBlock("multiple_choice");
    mcq.content = "Discuss";
    mcq.marking_mode = "teacher_reviewed";
    mcq.mcq_options = [
      { id: "a", label: "A", correct: false },
      { id: "b", label: "B", correct: false },
    ];
    section.blocks = [mcq];
    expect(collectPublishWarnings([section]).filter((w) => w.blocking)).toHaveLength(
      0,
    );
  });

  it("ignores empty unused MCQ drafts", () => {
    const draft = createBlock("multiple_choice");
    draft.content = "";
    draft.prompt = "";
    draft.mcq_options = [
      { id: "a", label: "", correct: false },
      { id: "b", label: "", correct: false },
    ];
    expect(isEmptyMcqDraft(draft)).toBe(true);
    const section = emptySection();
    section.blocks = [draft];
    expect(collectPublishWarnings([section]).filter((w) => w.blocking)).toHaveLength(
      0,
    );
  });
});
