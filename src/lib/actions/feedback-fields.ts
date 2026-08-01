"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/auth";
import type {
  AssignmentFeedbackField,
  FeedbackFieldConfig,
  FeedbackFieldValue,
} from "@/lib/feedback/types";
import { DEFAULT_FEEDBACK_FIELD_SEEDS } from "@/lib/feedback/types";
import { feedbackFieldDefinitionsSchema } from "@/lib/validations/feedback";

async function assertTeacher() {
  return requireProfile(["teacher", "admin"]);
}

function mapField(row: Record<string, unknown>): AssignmentFeedbackField {
  return {
    id: String(row.id),
    template_id: String(row.template_id),
    field_key: String(row.field_key),
    label: String(row.label),
    description: (row.description as string | null) ?? null,
    field_type: row.field_type as AssignmentFeedbackField["field_type"],
    sort_order: Number(row.sort_order ?? 0),
    is_required: Boolean(row.is_required),
    student_visible: Boolean(row.student_visible),
    teacher_only: Boolean(row.teacher_only),
    max_length: row.max_length == null ? null : Number(row.max_length),
    tracks_completion: Boolean(row.tracks_completion),
    allow_comment_bank: Boolean(row.allow_comment_bank),
    config: (row.config as FeedbackFieldConfig) ?? {},
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

export async function loadFeedbackFieldsAction(
  templateId: string,
): Promise<ActionResult & { fields?: AssignmentFeedbackField[] }> {
  await assertTeacher();
  const supabase = await createClient();

  await supabase.rpc("ensure_default_feedback_fields", {
    p_template_id: templateId,
  });

  const { data, error } = await supabase
    .from("assignment_feedback_fields")
    .select("*")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true });

  if (error) {
    if (/relation .*assignment_feedback_fields.* does not exist/i.test(error.message)) {
      return {
        fields: DEFAULT_FEEDBACK_FIELD_SEEDS.map((seed, index) => ({
          id: `legacy-${seed.field_key}`,
          template_id: templateId,
          ...seed,
          sort_order: seed.sort_order || index * 10,
        })),
      };
    }
    return { error: error.message };
  }

  if (!data?.length) {
    // RPC may be missing pre-migration — return code defaults.
    return {
      fields: DEFAULT_FEEDBACK_FIELD_SEEDS.map((seed, index) => ({
        id: `legacy-${seed.field_key}`,
        template_id: templateId,
        ...seed,
        sort_order: seed.sort_order || index * 10,
      })),
    };
  }

  return { fields: data.map((row) => mapField(row as Record<string, unknown>)) };
}

export async function saveFeedbackFieldsAction(
  templateId: string,
  fields: unknown,
): Promise<ActionResult> {
  await assertTeacher();
  const parsed = feedbackFieldDefinitionsSchema.safeParse(fields);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid fields" };
  }

  // Enforce visibility invariant in app layer too.
  for (const field of parsed.data) {
    if (field.teacher_only && field.student_visible) {
      return {
        error: `${field.label}: teacher-only fields cannot be student-visible`,
      };
    }
    if (field.field_type === "teacher_only_note") {
      field.teacher_only = true;
      field.student_visible = false;
      field.allow_comment_bank = false;
    }
  }

  const supabase = await createClient();
  const keys = new Set(parsed.data.map((f) => f.field_key));
  if (keys.size !== parsed.data.length) {
    return { error: "Feedback field keys must be unique" };
  }

  const { data: existing, error: loadError } = await supabase
    .from("assignment_feedback_fields")
    .select("id, field_key")
    .eq("template_id", templateId);
  if (loadError) {
    if (/does not exist/i.test(loadError.message)) {
      return {
        error:
          "Flexible feedback fields are not available yet. Run phase_05_flexible_feedback_and_comment_banks.sql.",
      };
    }
    return { error: loadError.message };
  }

  const existingById = new Map(
    (existing ?? []).map((row) => [String(row.id), String(row.field_key)]),
  );
  const keepIds = new Set(
    parsed.data.filter((f) => f.id).map((f) => String(f.id)),
  );

  for (const field of parsed.data) {
    const row = {
      template_id: templateId,
      field_key: field.field_key,
      label: field.label,
      description: field.description || null,
      field_type: field.field_type,
      sort_order: field.sort_order,
      is_required: field.is_required,
      student_visible: field.student_visible,
      teacher_only: field.teacher_only,
      max_length: field.max_length ?? null,
      tracks_completion: field.tracks_completion,
      allow_comment_bank: field.allow_comment_bank,
      config: field.config ?? {},
    };

    if (field.id && existingById.has(field.id)) {
      const { error } = await supabase
        .from("assignment_feedback_fields")
        .update(row)
        .eq("id", field.id)
        .eq("template_id", templateId);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase
        .from("assignment_feedback_fields")
        .insert(row);
      if (error) return { error: error.message };
    }
  }

  const toDelete = (existing ?? [])
    .map((row) => String(row.id))
    .filter((id) => !keepIds.has(id));
  if (toDelete.length) {
    // Do not delete classic keys that still have values — archive by renaming is safer;
    // only delete unused custom fields.
    const { error } = await supabase
      .from("assignment_feedback_fields")
      .delete()
      .in("id", toDelete)
      .eq("template_id", templateId)
      .not("field_key", "in", "(strengths,improvements,next_steps,private_notes)");
    if (error) return { error: error.message };
  }

  revalidatePath(`/teacher/assignments`);
  return { success: "Feedback fields saved" };
}

export async function loadFeedbackFieldValuesAction(
  feedbackId: string,
): Promise<ActionResult & { values?: FeedbackFieldValue[] }> {
  await requireProfile(["teacher", "admin", "student"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback_field_values")
    .select("*")
    .eq("feedback_id", feedbackId);
  if (error) {
    if (/does not exist/i.test(error.message)) return { values: [] };
    return { error: error.message };
  }
  return {
    values: (data ?? []).map((row) => ({
      field_id: String(row.field_id),
      field_key: String(row.field_key),
      text_value: (row.text_value as string | null) ?? null,
      numeric_value:
        row.numeric_value == null ? null : Number(row.numeric_value),
      boolean_value: (row.boolean_value as boolean | null) ?? null,
      json_value: row.json_value,
    })),
  };
}
