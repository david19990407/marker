import { describe, expect, it } from "vitest";
import {
  annotationSourceFields,
  buildCommentDragPayload,
  parseCommentDragPayload,
} from "@/lib/marking/comment-drag-source";

describe("comment drag source — live FK reproduction", () => {
  it("keeps bank item and assignment comment IDs on separate fields", () => {
    const bank = annotationSourceFields(
      buildCommentDragPayload({
        sourceType: "comment_bank_item",
        sourceId: "11111111-1111-1111-1111-111111111111",
        text: "Well done",
      }),
    );
    expect(bank.source_comment_item_id).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(bank.source_assignment_comment_id).toBeNull();

    // THIS was the live bug: assignment comment id must NEVER go into
    // source_comment_item_id (FK → comment_bank_items).
    const assignment = annotationSourceFields(
      buildCommentDragPayload({
        sourceType: "assignment_comment",
        sourceId: "22222222-2222-2222-2222-222222222222",
        text: "Check spelling",
      }),
    );
    expect(assignment.source_assignment_comment_id).toBe(
      "22222222-2222-2222-2222-222222222222",
    );
    expect(assignment.source_comment_item_id).toBeNull();
    expect(assignment.text_snapshot).toBe("Check spelling");
  });

  it("never treats legacy untyped ids as bank FKs", () => {
    // Exact legacy payload shape from LinkedCommentsPanel before the fix.
    const parsed = parseCommentDragPayload(
      JSON.stringify({
        id: "22222222-2222-2222-2222-222222222222",
        text: "Hello",
      }),
    );
    expect(parsed?.text).toBe("Hello");
    expect(parsed?.sourceId).toBeNull();
    const fields = annotationSourceFields(parsed!);
    expect(fields.source_comment_item_id).toBeNull();
    expect(fields.text_snapshot).toBe("Hello");
  });

  it("preserves typed bank-item payloads", () => {
    const raw = JSON.stringify(
      buildCommentDragPayload({
        sourceType: "comment_bank_item",
        sourceId: "33333333-3333-3333-3333-333333333333",
        text: "Bank note",
      }),
    );
    const parsed = parseCommentDragPayload(raw);
    expect(parsed?.sourceId).toBe("33333333-3333-3333-3333-333333333333");
    expect(annotationSourceFields(parsed!).source_comment_item_id).toBe(
      "33333333-3333-3333-3333-333333333333",
    );
  });
});
