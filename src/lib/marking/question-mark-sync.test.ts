import { describe, expect, it } from "vitest";
import {
  appendFeedbackText,
  mergeServerMarkIfFresh,
} from "./question-mark-sync";
import type { QuestionMarkRecord } from "./annotation-types";

function mark(
  partial: Partial<QuestionMarkRecord> & { question_id: string },
): QuestionMarkRecord {
  return {
    submission_id: "s1",
    marking_mode: "numeric",
    awarded_mark: 1,
    maximum_mark: 4,
    review_state: null,
    marking_status: "marked",
    question_feedback: "",
    teacher_only_note: null,
    automatic_mark: null,
    override_mark: null,
    override_reason: null,
    flagged: false,
    client_version: 1,
    ...partial,
  };
}

describe("question mark autosave merge", () => {
  it("keeps local text when a stale mutation response arrives", () => {
    const local = mark({
      question_id: "q1",
      question_feedback: "Full typed sentence",
      client_version: 5,
    });
    const server = mark({
      question_id: "q1",
      question_feedback: "Full",
      client_version: 3,
    });
    expect(mergeServerMarkIfFresh(local, server, 9, 4)).toEqual(local);
  });

  it("applies server row when mutation ids match and version is fresh", () => {
    const local = mark({
      question_id: "q1",
      question_feedback: "Hello",
      client_version: 2,
    });
    const server = mark({
      question_id: "q1",
      question_feedback: "Hello",
      client_version: 2,
      id: "row-1",
    });
    expect(mergeServerMarkIfFresh(local, server, 7, 7).id).toBe("row-1");
  });

  it("prefers newer local client_version over older server", () => {
    const local = mark({
      question_id: "q1",
      question_feedback: "ABCDE",
      client_version: 4,
    });
    const server = mark({
      question_id: "q1",
      question_feedback: "ABC",
      client_version: 3,
    });
    expect(
      mergeServerMarkIfFresh(local, server, 3, 3).question_feedback,
    ).toBe("ABCDE");
  });

  it("appends inserted bank comments without wiping prior text", () => {
    expect(appendFeedbackText("Existing", "Bank note")).toBe(
      "Existing\n\nBank note",
    );
  });
});
