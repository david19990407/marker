import type { CSSProperties } from "react";
import { exactAnnotationStyle } from "./annotation-geometry";

export type AnnotationType =
  | "text_highlight"
  | "freehand"
  | "text_comment"
  | "area_comment"
  | "stamp"
  | "selection";

export type AnnotationVisibility = "teacher_only" | "student_visible";

export type AnnotationTool =
  | "select"
  | "text_highlight"
  | "area_comment"
  | "text_comment"
  | "stamp"
  | "delete";

export interface SubmissionAnnotation {
  id: string;
  submission_id: string;
  assignment_id: string;
  question_id: string | null;
  block_id: string | null;
  page_number: number | null;
  target_kind: "worksheet" | "pdf" | "image" | "docx" | "file";
  target_path: string | null;
  annotation_type: AnnotationType;
  x_norm: number;
  y_norm: number;
  w_norm: number;
  h_norm: number;
  geometry: Record<string, unknown>;
  text_content: string | null;
  colour: string;
  opacity: number;
  stroke_width: number;
  stamp_id: string | null;
  source_comment_item_id?: string | null;
  visibility: AnnotationVisibility;
  client_version: number;
  is_deleted: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface MarkingStamp {
  id: string;
  name: string;
  symbol_key: string;
  description: string | null;
  category: string;
  accessible_label: string;
  storage_path: string | null;
  mime_type: string | null;
  default_size_pct: number;
  subject_restriction: string | null;
  teacher_restriction_ids: string[];
  assignment_restriction_ids: string[];
  is_active: boolean;
  sort_order: number;
  archived_at: string | null;
}

export interface AssignmentStampSelection {
  id: string;
  assignment_id: string;
  stamp_id: string;
  enabled: boolean;
  sort_order: number;
  default_size_pct_override: number | null;
  stamp?: MarkingStamp;
}

export type QuestionMarkingStatus =
  | "unmarked"
  | "partially_marked"
  | "marked"
  | "flagged"
  | "not_applicable";

export type QuestionReviewState =
  | "not_reviewed"
  | "reviewed"
  | "flag_follow_up"
  | "not_attempted";

export type QuestionMarkingMode =
  | "numeric"
  | "reviewed"
  | "auto_mcq"
  | "comment_only"
  | "not_applicable";

export interface QuestionMarkRecord {
  id?: string;
  submission_id: string;
  question_id: string;
  marking_mode: QuestionMarkingMode;
  awarded_mark: number | null;
  maximum_mark: number;
  review_state: QuestionReviewState | null;
  marking_status: QuestionMarkingStatus;
  question_feedback: string | null;
  teacher_only_note: string | null;
  automatic_mark: number | null;
  override_mark: number | null;
  override_reason: string | null;
  flagged: boolean;
  client_version: number;
  marked_by?: string | null;
  marked_at?: string | null;
}

export { clamp01 as clampNorm } from "./annotation-geometry";

export function annotationStyle(
  annotation: Pick<
    SubmissionAnnotation,
    "x_norm" | "y_norm" | "w_norm" | "h_norm"
  >,
): CSSProperties {
  return exactAnnotationStyle({
    x: annotation.x_norm,
    y: annotation.y_norm,
    w: annotation.w_norm,
    h: annotation.h_norm,
  });
}

export function formatMarksLabel(n: number): string {
  return n === 1 ? "1 mark" : `${n} marks`;
}

export function isQuestionMarked(record: QuestionMarkRecord | undefined): boolean {
  if (!record) return false;
  return (
    record.marking_status === "marked" ||
    record.marking_status === "flagged" ||
    (record.awarded_mark != null && record.marking_status !== "unmarked")
  );
}

export function useCircularMarkButtons(
  maximumMark: number,
  threshold = 10,
): boolean {
  return maximumMark >= 0 && maximumMark <= threshold;
}
