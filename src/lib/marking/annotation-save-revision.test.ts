import { describe, expect, it } from "vitest";
import {
  isStaleAnnotationSaveResponse,
  mergeAnnotationAfterSave,
} from "./annotation-save-revision";
import type { SubmissionAnnotation } from "./annotation-types";

function base(overrides: Partial<SubmissionAnnotation> = {}): SubmissionAnnotation {
  return {
    id: "ann-1",
    submission_id: "sub",
    assignment_id: "asg",
    question_id: null,
    block_id: null,
    page_number: 1,
    target_kind: "worksheet",
    target_path: null,
    annotation_type: "area_comment",
    x_norm: 0.1,
    y_norm: 0.1,
    w_norm: 0.2,
    h_norm: 0.1,
    geometry: {},
    text_content: "Hello",
    colour: "#dc2626",
    opacity: 1,
    stroke_width: 2,
    stamp_id: null,
    visibility: "student_visible",
    client_version: 1,
    is_deleted: false,
    created_by: "t1",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("annotation save revision", () => {
  it("discards older save responses while typing continues", () => {
    const latest = new Map<string, number>();
    latest.set("ann-1", 2); // newer save already in flight / completed
    expect(isStaleAnnotationSaveResponse(latest.get("ann-1"), 1)).toBe(true);
    expect(isStaleAnnotationSaveResponse(latest.get("ann-1"), 2)).toBe(false);
  });

  it("keeps newer local text when an older server response resolves", () => {
    const local = base({
      text_content: "Newest typed text",
      text_snapshot: "Newest typed text",
      client_version: 3,
      updated_at: "2026-01-01T00:00:03.000Z",
    });
    const server = base({
      text_content: "Older saved text",
      text_snapshot: "Older saved text",
      client_version: 2,
      updated_at: "2026-01-01T00:00:02.000Z",
    });
    const merged = mergeAnnotationAfterSave(local, server);
    expect(merged.text_content).toBe("Newest typed text");
    expect(merged.client_version).toBe(3);
  });
});
