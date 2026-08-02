import { describe, expect, it } from "vitest";
import {
  annotationSourceFields,
  buildCommentDragPayload,
  parseCommentDragPayload,
} from "@/lib/marking/comment-drag-source";

describe("comment drag source", () => {
  it("keeps bank item and assignment comment IDs on separate fields", () => {
    const bank = annotationSourceFields(
      buildCommentDragPayload({
        sourceType: "comment_bank_item",
        sourceId: "bank-1",
        text: "Well done",
      }),
    );
    expect(bank.source_comment_item_id).toBe("bank-1");
    expect(bank.source_assignment_comment_id).toBeNull();

    const assignment = annotationSourceFields(
      buildCommentDragPayload({
        sourceType: "assignment_comment",
        sourceId: "assign-1",
        text: "Check spelling",
      }),
    );
    expect(assignment.source_assignment_comment_id).toBe("assign-1");
    expect(assignment.source_comment_item_id).toBeNull();
  });

  it("never treats legacy untyped ids as bank FKs", () => {
    const parsed = parseCommentDragPayload(
      JSON.stringify({ id: "legacy-or-assignment-id", text: "Hello" }),
    );
    expect(parsed?.text).toBe("Hello");
    expect(parsed?.sourceId).toBeNull();
    const fields = annotationSourceFields(parsed!);
    expect(fields.source_comment_item_id).toBeNull();
    expect(fields.text_snapshot).toBe("Hello");
  });
});
