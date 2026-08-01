import { describe, expect, it } from "vitest";
import {
  evaluateLegacyCompletion,
  evaluateStructuredCompletion,
  isStructuredResponseAnswered,
  isSubmissionStatusComplete,
} from "./completion";
import { createBlock, emptySection } from "./structure";
import { applyMcqOptions } from "./structure";

describe("submission status completeness", () => {
  it("treats submitted/late/marked as complete and draft/returned as incomplete", () => {
    expect(isSubmissionStatusComplete("submitted")).toBe(true);
    expect(isSubmissionStatusComplete("late")).toBe(true);
    expect(isSubmissionStatusComplete("marked")).toBe(true);
    expect(isSubmissionStatusComplete("draft")).toBe(false);
    expect(isSubmissionStatusComplete("returned")).toBe(false);
    expect(isSubmissionStatusComplete(null)).toBe(false);
  });
});

describe("structured completion", () => {
  it("ignores content blocks and teacher-review-only items", () => {
    const section = emptySection();
    section.blocks = [
      createBlock("heading"),
      createBlock("passage"),
      createBlock("teacher_review"),
      (() => {
        const q = createBlock("short_text");
        q.required = true;
        q.content = "Q1";
        return q;
      })(),
    ];

    const result = evaluateStructuredCompletion([section], []);
    expect(result.requiredCount).toBe(1);
    expect(result.isComplete).toBe(false);
    expect(result.missingRequired[0]?.label).toBe("Q1");
  });

  it("counts MCQ, multi-select, numeric, and extended writing answers", () => {
    const section = emptySection();
    const mcq = applyMcqOptions(createBlock("multiple_choice"), [
      { id: "a", label: "A", correct: true },
      { id: "b", label: "B", correct: false },
    ]);
    mcq.required = true;
    const multi = applyMcqOptions(createBlock("multiple_select"), [
      { id: "a", label: "A", correct: true },
      { id: "b", label: "B", correct: true },
      { id: "c", label: "C", correct: false },
    ]);
    multi.required = true;
    const numeric = createBlock("numeric");
    numeric.required = true;
    const writing = createBlock("extended_writing");
    writing.required = true;
    const optional = createBlock("short_text");
    optional.required = false;
    section.blocks = [mcq, multi, numeric, writing, optional];

    const responses = [
      { question_id: mcq.question_id!, text_value: "A" },
      { question_id: multi.question_id!, text_value: "A\nB" },
      { question_id: numeric.question_id!, numeric_value: 12 },
      { question_id: writing.question_id!, text_value: "An essay" },
    ];

    const result = evaluateStructuredCompletion([section], responses);
    expect(result.isComplete).toBe(true);
    expect(result.answeredRequiredCount).toBe(4);
    expect(
      isStructuredResponseAnswered(multi, {
        question_id: multi.question_id!,
        text_value: "",
      }),
    ).toBe(false);
  });

  it("checks required table student cells", () => {
    const table = createBlock("table");
    table.required = true;
    table.tableConfig = {
      rows: 2,
      cols: 2,
      header_row: true,
      col_labels: ["A", "B"],
    };
    table.cells = [
      {
        row_index: 1,
        col_index: 0,
        cell_type: "student_text",
        label: null,
        marks: null,
        read_only: false,
      },
      {
        row_index: 1,
        col_index: 1,
        cell_type: "readonly",
        label: "fixed",
        marks: null,
        read_only: true,
      },
    ];
    const section = emptySection();
    section.blocks = [table];

    expect(
      evaluateStructuredCompletion([section], [
        {
          question_id: table.question_id!,
          cells: [{ row_index: 1, col_index: 0, text_value: "ok" }],
        },
      ]).isComplete,
    ).toBe(true);

    expect(
      evaluateStructuredCompletion([section], [
        { question_id: table.question_id!, cells: [] },
      ]).isComplete,
    ).toBe(false);
  });
});

describe("legacy completion", () => {
  it("does not require written_response when structured answers exist", () => {
    expect(
      evaluateLegacyCompletion({
        allowText: true,
        allowFile: false,
        writtenResponse: "",
        hasStructuredAnswers: true,
      }).isComplete,
    ).toBe(true);
  });
});
