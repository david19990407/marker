/**
 * Authoritative drag payload for linked comments placed as annotations.
 * Never send assignment-comment IDs as comment_bank_items FKs.
 */

export type CommentDragSourceType =
  | "comment_bank_item"
  | "assignment_comment";

export type CommentDragPayload = {
  sourceType: CommentDragSourceType;
  /** Valid UUID for the matching source table, or null when unknown. */
  sourceId: string | null;
  text: string;
};

export function buildCommentDragPayload(input: {
  sourceType: CommentDragSourceType;
  sourceId: string;
  text: string;
}): CommentDragPayload {
  return {
    sourceType: input.sourceType,
    sourceId: input.sourceId || null,
    text: input.text,
  };
}

export function parseCommentDragPayload(
  raw: string | null | undefined,
): CommentDragPayload | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CommentDragPayload> & {
      id?: string;
      text?: string;
      source?: string;
    };
    const text = String(parsed.text ?? "").trim();
    if (!text) return null;

    const sourceType =
      parsed.sourceType === "assignment_comment" ||
      parsed.source === "assignment_comment"
        ? "assignment_comment"
        : parsed.sourceType === "comment_bank_item" ||
            parsed.source === "comment_bank_item"
          ? "comment_bank_item"
          : null;

    // Legacy untyped payloads cannot be trusted as bank-item FKs.
    if (!sourceType) {
      return {
        sourceType: "comment_bank_item",
        sourceId: null,
        text,
      };
    }

    const sourceId = String(parsed.sourceId ?? parsed.id ?? "").trim() || null;
    return { sourceType, sourceId, text };
  } catch {
    const text = raw.trim();
    if (!text) return null;
    return {
      sourceType: "comment_bank_item",
      sourceId: null,
      text,
    };
  }
}

export function annotationSourceFields(payload: CommentDragPayload): {
  source_comment_item_id: string | null;
  source_assignment_comment_id: string | null;
  source_type: CommentDragSourceType | null;
  text_snapshot: string;
  text_content: string;
} {
  return {
    source_comment_item_id:
      payload.sourceType === "comment_bank_item" ? payload.sourceId : null,
    source_assignment_comment_id:
      payload.sourceType === "assignment_comment" ? payload.sourceId : null,
    source_type: payload.sourceId ? payload.sourceType : null,
    text_snapshot: payload.text,
    text_content: payload.text,
  };
}
