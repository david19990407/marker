import { describe, expect, it } from "vitest";
import {
  appendCommentWithoutDuplicate,
  filterCommentBankItems,
  generateDeterministicComment,
} from "./comment-templates";
import { evaluateFeedbackCompletion } from "./completion";
import type { AssignmentFeedbackField } from "./types";

describe("deterministic comment generation", () => {
  it("builds comments from teacher criteria without AI", () => {
    const result = generateDeterministicComment({
      studentName: "Alex",
      assignmentTitle: "Poetry analysis",
      strengths: ["clear thesis", "apt quotations"],
      improvements: ["deeper analysis"],
      nextSteps: ["revise conclusion"],
    });
    expect(result.strengths).toContain("clear thesis");
    expect(result.improvements).toContain("deeper analysis");
    expect(result.next_steps).toContain("revise conclusion");
    expect(result.combined).toContain("Alex");
  });

  it("prevents duplicate comment insertion", () => {
    const first = appendCommentWithoutDuplicate("", "Well structured.");
    expect(first.inserted).toBe(true);
    const second = appendCommentWithoutDuplicate(
      first.next,
      "Well structured.",
    );
    expect(second.inserted).toBe(false);
    expect(second.next).toBe(first.next);
  });

  it("filters comment banks by search, tone and favourites", () => {
    const items = [
      {
        title: "Clear",
        short_label: "Clear",
        full_text: "Clear explanation",
        category: "WWW",
        tags: ["clarity"],
        tone: "positive",
        is_active: true,
        bank_scope: "school",
        is_favourite: true,
      },
      {
        title: "Develop",
        short_label: "Develop",
        full_text: "Develop analysis",
        category: "EBI",
        tags: ["analysis"],
        tone: "corrective",
        is_active: true,
        bank_scope: "personal",
        is_favourite: false,
      },
    ];
    expect(
      filterCommentBankItems(items, { search: "analysis", tone: "corrective" }),
    ).toHaveLength(1);
    expect(filterCommentBankItems(items, { favouritesOnly: true })).toHaveLength(
      1,
    );
  });
});

describe("feedback field completion", () => {
  it("tracks required flexible fields", () => {
    const fields: AssignmentFeedbackField[] = [
      {
        id: "1",
        template_id: "t",
        field_key: "strengths",
        label: "Strengths",
        description: null,
        field_type: "rich_text",
        sort_order: 1,
        is_required: true,
        student_visible: true,
        teacher_only: false,
        max_length: 5000,
        tracks_completion: true,
        allow_comment_bank: true,
        config: {},
      },
      {
        id: "2",
        template_id: "t",
        field_key: "grade",
        label: "Grade",
        description: null,
        field_type: "grade",
        sort_order: 2,
        is_required: true,
        student_visible: true,
        teacher_only: false,
        max_length: null,
        tracks_completion: true,
        allow_comment_bank: false,
        config: { grades: ["A", "B"] },
      },
    ];
    const incomplete = evaluateFeedbackCompletion(fields, [
      {
        field_id: "1",
        field_key: "strengths",
        text_value: "Good work",
      },
    ]);
    expect(incomplete.isComplete).toBe(false);
    expect(incomplete.missingLabels).toEqual(["Grade"]);

    const complete = evaluateFeedbackCompletion(fields, [
      {
        field_id: "1",
        field_key: "strengths",
        text_value: "Good work",
      },
      {
        field_id: "2",
        field_key: "grade",
        text_value: "A",
      },
    ]);
    expect(complete.isComplete).toBe(true);
  });
});
