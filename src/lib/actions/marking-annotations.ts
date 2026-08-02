"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/auth";
import type {
  AssignmentStampSelection,
  MarkingStamp,
  QuestionMarkRecord,
  SubmissionAnnotation,
} from "@/lib/marking/annotation-types";

async function assertTeacher() {
  return requireProfile(["teacher", "admin"]);
}

function mapAnnotation(row: Record<string, unknown>): SubmissionAnnotation {
  return {
    id: String(row.id),
    submission_id: String(row.submission_id),
    assignment_id: String(row.assignment_id),
    question_id: (row.question_id as string | null) ?? null,
    block_id: (row.block_id as string | null) ?? null,
    page_number: row.page_number == null ? null : Number(row.page_number),
    target_kind: (row.target_kind as SubmissionAnnotation["target_kind"]) ?? "worksheet",
    target_path: (row.target_path as string | null) ?? null,
    annotation_type: row.annotation_type as SubmissionAnnotation["annotation_type"],
    x_norm: Number(row.x_norm ?? 0),
    y_norm: Number(row.y_norm ?? 0),
    w_norm: Number(row.w_norm ?? 0),
    h_norm: Number(row.h_norm ?? 0),
    geometry: (row.geometry as Record<string, unknown>) ?? {},
    text_content: (row.text_content as string | null) ?? null,
    colour: String(row.colour ?? "#ef4444"),
    opacity: Number(row.opacity ?? 0.35),
    stroke_width: Number(row.stroke_width ?? 2),
    stamp_id: (row.stamp_id as string | null) ?? null,
    source_comment_item_id:
      (row.source_comment_item_id as string | null) ?? null,
    visibility:
      (row.visibility as SubmissionAnnotation["visibility"]) ??
      "student_visible",
    client_version: Number(row.client_version ?? 1),
    is_deleted: Boolean(row.is_deleted),
    created_by: String(row.created_by),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapStamp(row: Record<string, unknown>): MarkingStamp {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    symbol_key: String(row.symbol_key ?? ""),
    description: (row.description as string | null) ?? null,
    category: String(row.category ?? "general"),
    accessible_label: String(row.accessible_label ?? row.name ?? "Stamp"),
    storage_path: (row.storage_path as string | null) ?? null,
    mime_type: (row.mime_type as string | null) ?? null,
    default_size_pct: Number(row.default_size_pct ?? 8),
    default_width_px: Number(row.default_width_px ?? 64),
    default_height_px: Number(row.default_height_px ?? 64),
    subject_restriction: (row.subject_restriction as string | null) ?? null,
    teacher_restriction_ids: Array.isArray(row.teacher_restriction_ids)
      ? (row.teacher_restriction_ids as string[])
      : [],
    assignment_restriction_ids: Array.isArray(row.assignment_restriction_ids)
      ? (row.assignment_restriction_ids as string[])
      : [],
    is_active: Boolean(row.is_active),
    is_palette_visible:
      row.is_palette_visible === undefined || row.is_palette_visible === null
        ? true
        : Boolean(row.is_palette_visible),
    is_internal: Boolean(row.is_internal),
    sort_order: Number(row.sort_order ?? 0),
    archived_at: (row.archived_at as string | null) ?? null,
    asset_version: Number(row.asset_version ?? 1),
    current_asset_id: (row.current_asset_id as string | null) ?? null,
  };
}

function mapQuestionMark(row: Record<string, unknown>): QuestionMarkRecord {
  return {
    id: String(row.id),
    submission_id: String(row.submission_id),
    question_id: String(row.question_id),
    marking_mode: (row.marking_mode as QuestionMarkRecord["marking_mode"]) ?? "numeric",
    awarded_mark: row.awarded_mark == null ? null : Number(row.awarded_mark),
    maximum_mark: Number(row.maximum_mark ?? 0),
    review_state: (row.review_state as QuestionMarkRecord["review_state"]) ?? null,
    marking_status:
      (row.marking_status as QuestionMarkRecord["marking_status"]) ?? "unmarked",
    question_feedback: (row.question_feedback as string | null) ?? null,
    teacher_only_note: (row.teacher_only_note as string | null) ?? null,
    automatic_mark:
      row.automatic_mark == null ? null : Number(row.automatic_mark),
    override_mark: row.override_mark == null ? null : Number(row.override_mark),
    override_reason: (row.override_reason as string | null) ?? null,
    flagged: Boolean(row.flagged),
    client_version: Number(row.client_version ?? 1),
    marked_by: (row.marked_by as string | null) ?? null,
    marked_at: (row.marked_at as string | null) ?? null,
  };
}

export async function loadSubmissionAnnotationsAction(
  submissionId: string,
): Promise<ActionResult & { annotations?: SubmissionAnnotation[] }> {
  await assertTeacher();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("submission_annotations")
    .select("*")
    .eq("submission_id", submissionId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: true });
  if (error) {
    if (/does not exist/i.test(error.message)) return { annotations: [] };
    return { error: error.message };
  }
  return {
    annotations: (data ?? []).map((row) =>
      mapAnnotation(row as Record<string, unknown>),
    ),
  };
}

export async function saveAnnotationAction(
  payload: Partial<SubmissionAnnotation> & {
    submission_id: string;
    assignment_id: string;
    annotation_type: SubmissionAnnotation["annotation_type"];
  },
): Promise<ActionResult & { annotation?: SubmissionAnnotation }> {
  await assertTeacher();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("upsert_submission_annotation", {
    p_payload: payload,
  });
  if (error) {
    if (/stale_annotation_version/i.test(error.message)) {
      return { error: "A newer annotation version already exists. Reload and retry." };
    }
    if (/does not exist|schema cache/i.test(error.message)) {
      // Direct upsert fallback before RPC is available.
      const { data: row, error: upsertError } = await supabase
        .from("submission_annotations")
        .upsert({
          ...payload,
          client_version: payload.client_version ?? 1,
        })
        .select("*")
        .single();
      if (upsertError) {
        if (/does not exist/i.test(upsertError.message)) {
          return {
            error:
              "Annotations are not available yet. Run phase_06_annotations_and_stamps.sql.",
          };
        }
        return { error: upsertError.message };
      }
      // Avoid full-page annotation refetch during interactive drag/save.
      return {
        success: "Annotation saved",
        annotation: mapAnnotation(row as Record<string, unknown>),
      };
    }
    return { error: error.message };
  }
  // Client marking workspace keeps optimistic local state; skip revalidatePath
  // so saving one annotation does not refetch the whole submission payload.
  return {
    success: "Annotation saved",
    annotation: mapAnnotation(data as Record<string, unknown>),
  };
}

export async function deleteAnnotationAction(
  annotationId: string,
  submissionId: string,
  clientVersion: number,
): Promise<ActionResult> {
  await assertTeacher();
  const supabase = await createClient();
  const { error } = await supabase
    .from("submission_annotations")
    .update({
      is_deleted: true,
      client_version: clientVersion + 1,
    })
    .eq("id", annotationId)
    .lte("client_version", clientVersion);
  if (error) return { error: error.message };
  void submissionId;
  return { success: "Annotation deleted" };
}

export async function loadQuestionMarksAction(
  submissionId: string,
): Promise<ActionResult & { marks?: QuestionMarkRecord[] }> {
  await assertTeacher();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("question_marks")
    .select("*")
    .eq("submission_id", submissionId);
  if (error) {
    if (/does not exist/i.test(error.message)) return { marks: [] };
    return { error: error.message };
  }
  return {
    marks: (data ?? []).map((row) =>
      mapQuestionMark(row as Record<string, unknown>),
    ),
  };
}

export async function saveQuestionMarkAction(
  payload: QuestionMarkRecord,
): Promise<ActionResult & { mark?: QuestionMarkRecord }> {
  await assertTeacher();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("upsert_question_mark", {
    p_payload: payload,
  });
  if (error) {
    if (/stale_question_mark_version/i.test(error.message)) {
      return { error: "A newer mark already exists. Reload and retry." };
    }
    if (/does not exist|schema cache/i.test(error.message)) {
      const { data: row, error: upsertError } = await supabase
        .from("question_marks")
        .upsert(
          {
            submission_id: payload.submission_id,
            question_id: payload.question_id,
            marking_mode: payload.marking_mode,
            awarded_mark: payload.awarded_mark,
            maximum_mark: payload.maximum_mark,
            review_state: payload.review_state,
            marking_status: payload.marking_status,
            question_feedback: payload.question_feedback,
            teacher_only_note: payload.teacher_only_note,
            automatic_mark: payload.automatic_mark,
            override_mark: payload.override_mark,
            override_reason: payload.override_reason,
            flagged: payload.flagged,
            client_version: payload.client_version,
          },
          { onConflict: "submission_id,question_id" },
        )
        .select("*")
        .single();
      if (upsertError) {
        if (/does not exist/i.test(upsertError.message)) {
          return {
            error:
              "Question marks are not available yet. Run phase_06_annotations_and_stamps.sql.",
          };
        }
        return { error: upsertError.message };
      }
      return {
        success: "Mark saved",
        mark: mapQuestionMark(row as Record<string, unknown>),
      };
    }
    return { error: error.message };
  }
  return {
    success: "Mark saved",
    mark: mapQuestionMark(data as Record<string, unknown>),
  };
}

export async function listMarkingStampsAction(filters?: {
  subject?: string | null;
  assignmentId?: string | null;
  includeArchived?: boolean;
}): Promise<ActionResult & { stamps?: MarkingStamp[] }> {
  const profile = await assertTeacher();
  const supabase = await createClient();
  let query = supabase
    .from("school_marking_symbols")
    .select("*")
    .order("sort_order", { ascending: true });
  if (!filters?.includeArchived) {
    query = query.is("archived_at", null).eq("is_active", true);
  }
  const { data, error } = await query;
  if (error) {
    if (/does not exist/i.test(error.message)) return { stamps: [] };
    return { error: error.message };
  }
  const stamps = (data ?? [])
    .map((row) => mapStamp(row as Record<string, unknown>))
    .filter((stamp) => {
      if (stamp.is_internal) return false;
      if (!filters?.includeArchived) {
        if (!stamp.is_active || !stamp.is_palette_visible || stamp.archived_at) {
          return false;
        }
      }
      if (
        stamp.subject_restriction &&
        filters?.subject &&
        stamp.subject_restriction.toLowerCase() !==
          filters.subject.toLowerCase()
      ) {
        return false;
      }
      if (
        stamp.teacher_restriction_ids.length &&
        !stamp.teacher_restriction_ids.includes(profile.id) &&
        profile.role !== "admin"
      ) {
        return false;
      }
      if (
        stamp.assignment_restriction_ids.length &&
        filters?.assignmentId &&
        !stamp.assignment_restriction_ids.includes(filters.assignmentId)
      ) {
        return false;
      }
      return true;
    });
  return { stamps };
}

export async function loadAssignmentStampSelectionsAction(
  assignmentId: string,
): Promise<ActionResult & { selections?: AssignmentStampSelection[] }> {
  await assertTeacher();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assignment_stamp_selections")
    .select("*, stamp:school_marking_symbols(*)")
    .eq("assignment_id", assignmentId)
    .order("sort_order", { ascending: true });
  if (error) {
    if (/does not exist/i.test(error.message)) return { selections: [] };
    return { error: error.message };
  }
  return {
    selections: (data ?? []).map((row) => {
      const stampRow = Array.isArray(row.stamp) ? row.stamp[0] : row.stamp;
      return {
        id: String(row.id),
        assignment_id: String(row.assignment_id),
        stamp_id: String(row.stamp_id),
        enabled: Boolean(row.enabled),
        sort_order: Number(row.sort_order ?? 0),
        default_size_pct_override:
          row.default_size_pct_override == null
            ? null
            : Number(row.default_size_pct_override),
        stamp: stampRow
          ? mapStamp(stampRow as Record<string, unknown>)
          : undefined,
      };
    }),
  };
}

export async function saveAssignmentStampSelectionsAction(
  assignmentId: string,
  stampIds: string[],
): Promise<ActionResult> {
  await assertTeacher();
  const supabase = await createClient();
  const { error: delError } = await supabase
    .from("assignment_stamp_selections")
    .delete()
    .eq("assignment_id", assignmentId);
  if (delError && !/does not exist/i.test(delError.message)) {
    return { error: delError.message };
  }
  if (stampIds.length) {
    const rows = stampIds.map((stampId, index) => ({
      assignment_id: assignmentId,
      stamp_id: stampId,
      enabled: true,
      sort_order: index,
    }));
    const { error } = await supabase
      .from("assignment_stamp_selections")
      .insert(rows);
    if (error) return { error: error.message };
  }
  revalidatePath(`/teacher/assignments/${assignmentId}`);
  revalidatePath("/teacher/marking");
  return { success: "Assignment stamps updated" };
}
