/**
 * Authoritative drag payload for linked comments.
 *
 * Evidence (live FK failure):
 * - `submission_annotations.source_comment_item_id` REFERENCES `comment_bank_items(id)`
 * - LinkedCommentsPanel dragged `assignment_comments.id` (as `_id`) into that column
 * - Postgres raised submission_annotations_source_comment_item_id_fkey
 */

export type CommentDragSourceType =
  | "comment_bank_item"
  | "assignment_comment";

export type CommentDragPayload = {
  sourceType: CommentDragSourceType;
  /** UUID for the matching source table, or null when unknown/untrusted. */
  sourceId: string | null;
  text: string;
  title?: string | null;
  shortLabel?: string | null;
};

export function buildCommentDragPayload(input: {
  sourceType: CommentDragSourceType;
  sourceId: string;
  text: string;
  title?: string | null;
  shortLabel?: string | null;
}): CommentDragPayload {
  return {
    sourceType: input.sourceType,
    sourceId: input.sourceId || null,
    text: input.text,
    title: input.title ?? null,
    shortLabel: input.shortLabel ?? null,
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
      itemId?: string;
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

    // Legacy untyped `{ id, text }` payloads cannot be trusted as bank-item FKs —
    // they were the exact cause of the live foreign-key failure.
    if (!sourceType) {
      return {
        sourceType: "comment_bank_item",
        sourceId: null,
        text,
        title: null,
        shortLabel: null,
      };
    }

    const sourceId =
      String(parsed.sourceId ?? parsed.id ?? parsed.itemId ?? "").trim() ||
      null;
    return {
      sourceType,
      sourceId,
      text,
      title: parsed.title ?? null,
      shortLabel: parsed.shortLabel ?? null,
    };
  } catch {
    const text = raw.trim();
    if (!text) return null;
    return {
      sourceType: "comment_bank_item",
      sourceId: null,
      text,
      title: null,
      shortLabel: null,
    };
  }
}

export function annotationSourceFields(payload: CommentDragPayload): {
  source_comment_item_id: string | null;
  source_assignment_comment_id: string | null;
  source_type: CommentDragSourceType | null;
  text_snapshot: string;
  text_content: string;
  source_title_snapshot: string | null;
  source_short_label_snapshot: string | null;
} {
  return {
    source_comment_item_id:
      payload.sourceType === "comment_bank_item" ? payload.sourceId : null,
    source_assignment_comment_id:
      payload.sourceType === "assignment_comment" ? payload.sourceId : null,
    source_type: payload.sourceId ? payload.sourceType : null,
    text_snapshot: payload.text,
    text_content: payload.text,
    source_title_snapshot: payload.title ?? null,
    source_short_label_snapshot: payload.shortLabel ?? null,
  };
}
