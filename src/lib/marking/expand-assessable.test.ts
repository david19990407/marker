import { describe, expect, it } from "vitest";
import {
  expandAssessableBlocks,
  parentScannedUploadBlockId,
} from "@/lib/marking/expand-assessable";
import type { BuilderSection } from "@/lib/types";
import { defaultScannedUploadConfig } from "@/lib/types";

describe("expandAssessableBlocks", () => {
  it("keeps Mode A scanned upload as a single assessable block", () => {
    const sections: BuilderSection[] = [
      {
        _id: "s1",
        title: "Section",
        blocks: [
          {
            _id: "b1",
            question_id: "q1",
            block_type: "scanned_homework_upload",
            content: "Upload essay",
            teacher_only: false,
            prompt: "Scan your work",
            max_marks: 16,
            required: true,
            marks_apply: true,
            scannedUploadConfig: defaultScannedUploadConfig(),
          },
        ],
      },
    ];
    const out = expandAssessableBlocks(sections);
    expect(out).toHaveLength(1);
    expect(out[0]?.question_id).toBe("q1");
    expect(out[0]?.max_marks).toBe(16);
  });

  it("expands Mode B attached questions and derives parent block id", () => {
    const sections: BuilderSection[] = [
      {
        _id: "s1",
        title: "Section",
        blocks: [
          {
            _id: "b1",
            question_id: "q-parent",
            block_type: "scanned_homework_upload",
            content: "Upload essay",
            teacher_only: false,
            prompt: "",
            max_marks: 16,
            required: true,
            marks_apply: true,
            scannedUploadConfig: {
              ...defaultScannedUploadConfig(),
              subquestions: [
                {
                  id: "sq1",
                  question_label: "Q1a",
                  title: "Content",
                  description: "",
                  maximum_mark: 8,
                  is_required: true,
                  include_in_total: true,
                  marking_guidance: "Look for ideas",
                  display_order: 0,
                },
                {
                  id: "sq2",
                  question_label: "Q1b",
                  title: "Organisation",
                  description: "",
                  maximum_mark: 4,
                  is_required: true,
                  include_in_total: true,
                  marking_guidance: "",
                  display_order: 1,
                },
                {
                  id: "sq3",
                  question_label: "Q1c",
                  title: "Accuracy",
                  description: "",
                  maximum_mark: 4,
                  is_required: true,
                  include_in_total: true,
                  marking_guidance: "",
                  display_order: 2,
                },
              ],
            },
          },
        ],
      },
    ];
    const out = expandAssessableBlocks(sections);
    expect(out).toHaveLength(3);
    expect(out.map((b) => b.question_id)).toEqual(["sq1", "sq2", "sq3"]);
    expect(out.reduce((sum, b) => sum + Number(b.max_marks ?? 0), 0)).toBe(16);
    expect(parentScannedUploadBlockId(out[0])).toBe("b1");
    expect(out[0]?.content).toBe("Content");
  });
});
