import { describe, expect, it } from "vitest";
import {
  deriveMarkingStatus,
  formatQuestionMarkProgress,
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
    block_type: "short_answer",
    content: "Q",
    prompt: null,
    required: true,
    max_marks: 1,
    review_only: false,
    question_id: "q1",
    ...partial,
  } as BuilderBlock;
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
    const q1: QuestionMarkRecord = {
      submission_id: "s1",
      question_id: "q1",
      marking_mode: "numeric",
      awarded_mark: 1,
      maximum_mark: 1,
      review_state: null,
      marking_status: "marked",
      question_feedback: null,
      teacher_only_note: null,
      automatic_mark: null,
      override_mark: null,
      override_reason: null,
      flagged: false,
      client_version: 1,
    };
    const map = new Map([["q1", q1]]);
    expect(deriveMarkingStatus({
      mode: "numeric",
      awardedMark: 1,
      reviewState: null,
      feedback: null,
      flagged: false,
    })).toBe("marked");
    expect(nextUnmarkedQuestionId(["q1", "q2", "q3"], map, "q1")).toBe("q2");
  });

  it("sums awarded marks and skips unmarked questions", () => {
    const records: QuestionMarkRecord[] = [
      {
        submission_id: "s1",
        question_id: "q1",
        marking_mode: "numeric",
        awarded_mark: 1,
        maximum_mark: 1,
        review_state: null,
        marking_status: "marked",
        question_feedback: "Good",
        teacher_only_note: null,
        automatic_mark: null,
        override_mark: null,
        override_reason: null,
        flagged: false,
        client_version: 1,
      },
      {
        submission_id: "s1",
        question_id: "q2",
        marking_mode: "numeric",
        awarded_mark: 4,
        maximum_mark: 5,
        review_state: null,
        marking_status: "marked",
        question_feedback: null,
        teacher_only_note: null,
        automatic_mark: null,
        override_mark: null,
        override_reason: null,
        flagged: false,
        client_version: 1,
      },
      {
        submission_id: "s1",
        question_id: "q3",
        marking_mode: "numeric",
        awarded_mark: null,
        maximum_mark: 20,
        review_state: null,
        marking_status: "unmarked",
        question_feedback: null,
        teacher_only_note: null,
        automatic_mark: null,
        override_mark: null,
        override_reason: null,
        flagged: false,
        client_version: 1,
      },
    ];
    expect(sumAwardedMarks(records)).toEqual({
      awarded: 5,
      maximumCompleted: 6,
      markedCount: 2,
    });
    const map = new Map(records.map((r) => [r.question_id, r]));
    expect(nextUnmarkedQuestionId(["q1", "q2", "q3"], map, "q1")).toBe("q3");
  });

  it("flags a question and treats review states correctly", () => {
    expect(
      deriveMarkingStatus({
        mode: "reviewed",
        awardedMark: null,
        reviewState: "reviewed",
        feedback: null,
        flagged: false,
      }),
    ).toBe("marked");
    expect(
      deriveMarkingStatus({
        mode: "numeric",
        awardedMark: 2,
        reviewState: null,
        feedback: null,
        flagged: true,
      }),
    ).toBe("flagged");
    expect(
      isQuestionMarkingComplete({
        submission_id: "s1",
        question_id: "q1",
        marking_mode: "numeric",
        awarded_mark: 2,
        maximum_mark: 4,
        review_state: null,
        marking_status: "flagged",
        question_feedback: null,
        teacher_only_note: null,
        automatic_mark: null,
        override_mark: null,
        override_reason: null,
        flagged: true,
        client_version: 1,
      }),
    ).toBe(false);
  });

  it("does not treat a bare zero award without marked status as complete", () => {
    const unmarkedZero: QuestionMarkRecord = {
      submission_id: "s1",
      question_id: "q1",
      marking_mode: "numeric",
      awarded_mark: null,
      maximum_mark: 4,
      review_state: null,
      marking_status: "unmarked",
      question_feedback: null,
      teacher_only_note: null,
      automatic_mark: null,
      override_mark: null,
      override_reason: null,
      flagged: false,
      client_version: 1,
    };
    expect(isQuestionMarkingComplete(unmarkedZero)).toBe(false);
    expect(formatQuestionMarkProgress(unmarkedZero, 4)).toBe("-/4");

    const awardedZero = {
      ...unmarkedZero,
      awarded_mark: 0,
      marking_status: "marked" as const,
    };
    expect(isQuestionMarkingComplete(awardedZero)).toBe(true);
    expect(formatQuestionMarkProgress(awardedZero, 4)).toBe("0/4");
  });
});
