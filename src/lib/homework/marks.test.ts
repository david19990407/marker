import { describe, expect, it } from "vitest";
import {
  calculateTotalMarks,
  formatMarkLabel,
  formatMarkLabelBracketed,
} from "./marks";
import type { BuilderSection } from "@/lib/types";

describe("formatMarkLabel", () => {
  it("uses singular for exactly one mark", () => {
    expect(formatMarkLabel(1)).toBe("1 mark");
    expect(formatMarkLabel(1.0)).toBe("1 mark");
    expect(formatMarkLabelBracketed(1)).toBe("[1 mark]");
  });

  it("uses plural for zero, decimals, and values greater than one", () => {
    expect(formatMarkLabel(0)).toBe("0 marks");
    expect(formatMarkLabel(2)).toBe("2 marks");
    expect(formatMarkLabel(1.5)).toBe("1.5 marks");
    expect(formatMarkLabelBracketed(2)).toBe("[2 marks]");
  });
});

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
