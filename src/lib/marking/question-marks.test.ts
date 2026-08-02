import { describe, expect, it } from "vitest";
import {
  deriveMarkingStatus,
  formatQuestionMarkProgress,
  formatStudentReleasedMark,
  inferMarkingMode,
  isQuestionMarkingComplete,
  nextUnmarkedQuestionId,
  sumAwardedMarks,
} from "./question-marks";
import type { QuestionMarkRecord } from "./annotation-types";
import type { BuilderBlock } from "@/lib/types";

function block(partial: Partial<BuilderBlock>): BuilderBlock {
  return {
    _id: "b1",
    block_type: "short_text",
    content: "Q",
    prompt: null,
    required: true,
    max_marks: 1,
    review_only: false,
    question_id: "q1",
    ...partial,
  } as BuilderBlock;
}

function mark(
  partial: Partial<QuestionMarkRecord> & { question_id: string },
): QuestionMarkRecord {
  return {
    submission_id: "s1",
    marking_mode: "numeric",
    awarded_mark: null,
    maximum_mark: 4,
    review_state: null,
    not_attempted: false,
    marking_status: "unmarked",
    question_feedback: null,
    teacher_only_note: null,
    automatic_mark: null,
    override_mark: null,
    override_reason: null,
    flagged: false,
    client_version: 1,
    ...partial,
  };
}

describe("question-level marking helpers", () => {
  it("infers numeric, review and MCQ modes", () => {
    expect(inferMarkingMode(block({ max_marks: 1 }))).toBe("numeric");
    expect(inferMarkingMode(block({ review_only: true }))).toBe("reviewed");
    expect(
      inferMarkingMode(block({ block_type: "multiple_choice", max_marks: 1 })),
    ).toBe("auto_mcq");
    expect(inferMarkingMode(block({ max_marks: 0 }))).toBe("comment_only");
  });

  it("marks a 1-mark question and advances to next unmarked", () => {
    const q1 = mark({
      question_id: "q1",
      awarded_mark: 1,
      maximum_mark: 1,
      marking_status: "marked",
    });
    const map = new Map([["q1", q1]]);
    expect(
      deriveMarkingStatus({
        mode: "numeric",
        awardedMark: 1,
        reviewState: null,
        feedback: null,
        flagged: false,
      }),
    ).toBe("marked");
    expect(nextUnmarkedQuestionId(["q1", "q2", "q3"], map, "q1")).toBe("q2");
  });

  it("sums awarded marks and treats NA as zero", () => {
    const records: QuestionMarkRecord[] = [
      mark({
        question_id: "q1",
        awarded_mark: 4,
        maximum_mark: 4,
        marking_status: "marked",
      }),
      mark({
        question_id: "q2",
        awarded_mark: 0,
        maximum_mark: 6,
        not_attempted: true,
        marking_status: "marked",
      }),
      mark({
        question_id: "q3",
        awarded_mark: 3,
        maximum_mark: 5,
        marking_status: "marked",
      }),
    ];
    expect(sumAwardedMarks(records)).toEqual({
      awarded: 7,
      maximumCompleted: 15,
      markedCount: 3,
    });
  });

  it("distinguishes blank, zero and NA in teacher progress labels", () => {
    const unmarked = mark({ question_id: "q1", maximum_mark: 8 });
    expect(formatQuestionMarkProgress(unmarked, 8)).toBe("-/8");

    const zero = mark({
      question_id: "q1",
      awarded_mark: 0,
      maximum_mark: 8,
      marking_status: "marked",
    });
    expect(formatQuestionMarkProgress(zero, 8)).toBe("0/8");
    expect(formatStudentReleasedMark(zero)).toBe("0/8");

    const na = mark({
      question_id: "q1",
      awarded_mark: 0,
      maximum_mark: 8,
      not_attempted: true,
      marking_status: "marked",
    });
    expect(formatQuestionMarkProgress(na, 8)).toBe("NA/8");
    expect(formatStudentReleasedMark(na)).toBe("Not attempted");
    expect(
      deriveMarkingStatus({
        mode: "numeric",
        awardedMark: 0,
        reviewState: "not_attempted",
        feedback: null,
        flagged: false,
        notAttempted: true,
      }),
    ).toBe("marked");
    expect(isQuestionMarkingComplete(na)).toBe(true);
  });

  it("does not treat flagged as complete for release readiness", () => {
    expect(
      isQuestionMarkingComplete(
        mark({
          question_id: "q1",
          awarded_mark: 2,
          marking_status: "flagged",
          flagged: true,
        }),
      ),
    ).toBe(false);
  });
});
