import { describe, expect, it } from "vitest";
import { calculateTotalMarks } from "./marks";
import type { BuilderSection } from "@/lib/types";

describe("calculateTotalMarks", () => {
  it("sums assessable question marks and ignores review-only", () => {
    const sections: BuilderSection[] = [
      {
        _id: "s1",
        title: "Section",
        subsections: [],
        blocks: [
          {
            _id: "b1",
            question_id: "q1",
            block_type: "short_text",
            content: "Q1",
            teacher_only: false,
            max_marks: 5,
            marks_apply: true,
          },
          {
            _id: "b2",
            question_id: "q2",
            block_type: "teacher_review",
            content: "Review",
            teacher_only: true,
            max_marks: 10,
            review_only: true,
            marks_apply: true,
          },
          {
            _id: "b3",
            block_type: "heading",
            content: "Heading",
            teacher_only: false,
          },
        ],
      },
    ];
    expect(calculateTotalMarks(sections)).toBe(5);
  });
});
