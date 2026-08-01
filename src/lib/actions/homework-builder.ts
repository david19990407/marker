"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import type { AssignmentCommentDraft, BuilderSection, StudentResponse } from "@/lib/types";
import { evaluateStructuredCompletion } from "@/lib/homework/completion";
import { isStructuredAssignment } from "@/lib/homework/assignment-mode";
import {
  cloneSection,
  loadTemplateStructure,
  structureToPayload,
} from "@/lib/homework/structure";
import { structuredResponsesSchema } from "@/lib/validations/homework";
import type { ActionResult } from "@/lib/actions/auth";
import { assertSafeUpload, buildStoragePath } from "@/lib/utils/files";

async function assertTeacher() {
  return requireProfile(["teacher", "admin"]);
}

// ── Save structure ────────────────────────────────────────────────────────────

export async function saveHomeworkStructureAction(
  templateId: string,
  sections: BuilderSection[],
  options?: { revalidate?: boolean },
): Promise<ActionResult & { savedAt?: string }> {
  await assertTeacher();
  const supabase = await createClient();

  const payload = structureToPayload(sections);

  const { error } = await supabase.rpc("save_assignment_structure", {
    p_template_id: templateId,
    p_structure: payload,
  });

  if (error) return { error: error.message };

  // Local-first autosave: never return reloaded structure (would wipe in-progress typing).
  // Client IDs are preserved by the SQL upsert. Do not remount the builder.
  if (options?.revalidate) {
    revalidatePath(`/teacher/assignments`);
  }

  return { success: "Structure saved", savedAt: new Date().toISOString() };
}

// ── Resources and mark schemes ───────────────────────────────────────────────

export async function uploadMarkSchemeAction(
  templateId: string,
  formData: FormData,
): Promise<ActionResult> {
  const profile = await assertTeacher();
  const supabase = await createClient();

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Choose a PDF to upload" };

  try {
    const { mime, safeName } = assertSafeUpload(file, "assignment-resource");
    if (mime !== "application/pdf" && !safeName.toLowerCase().endsWith(".pdf")) {
      return { error: "Mark schemes must be PDF files" };
    }

    const path = buildStoragePath(
      profile.id,
      templateId,
      "mark-schemes",
      `${crypto.randomUUID()}-${safeName}`,
    );
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from("assignment-resources")
      .upload(path, buffer, { contentType: "application/pdf", upsert: false });
    if (uploadError) return { error: uploadError.message };

    const { error } = await supabase.from("assignment_mark_schemes").insert({
      template_id: templateId,
      title: safeName.replace(/\.pdf$/i, ""),
      storage_path: path,
      file_name: safeName,
      mime_type: "application/pdf",
      file_size_bytes: file.size,
      created_by: profile.id,
    });
    if (error) return { error: error.message };

    return { success: "Mark scheme uploaded" };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Upload failed" };
  }
}

// ── Assignment-specific feedback comments ───────────────────────────────────

export async function saveAssignmentCommentsAction(
  templateId: string,
  comments: AssignmentCommentDraft[],
): Promise<ActionResult & { savedAt?: string }> {
  await assertTeacher();
  const supabase = await createClient();

  const ids = comments.map((comment) => comment._id);
  let deleteQuery = supabase
    .from("assignment_comments")
    .delete()
    .eq("template_id", templateId);

  if (ids.length > 0) {
    deleteQuery = deleteQuery.not("id", "in", `(${ids.join(",")})`);
  }

  const { error: deleteError } = await deleteQuery;
  if (deleteError) return { error: deleteError.message };

  if (comments.length > 0) {
    const rows = comments.map((comment, index) => ({
      id: comment._id,
      template_id: templateId,
      short_label: comment.short_label.trim() || "Untitled comment",
      full_comment: comment.full_comment,
      category: comment.category || null,
      linked_question_id: comment.linked_question_id || null,
      mark_range_min: comment.mark_range_min ?? null,
      mark_range_max: comment.mark_range_max ?? null,
      is_active: comment.is_active,
      sort_order: index,
      available_for_drag_drop: comment.available_for_drag_drop,
      available_for_overall: comment.available_for_overall,
      available_for_question: comment.available_for_question,
    }));

    const { error: upsertError } = await supabase
      .from("assignment_comments")
      .upsert(rows, { onConflict: "id" });
    if (upsertError) return { error: upsertError.message };
  }

  return { success: "Feedback comments saved", savedAt: new Date().toISOString() };
}

export async function saveCommentBankLinksAction(
  templateId: string,
  commentBankIds: string[],
): Promise<ActionResult> {
  await assertTeacher();
  const supabase = await createClient();

  const { error: deleteError } = await supabase
    .from("assignment_comment_bank_links")
    .delete()
    .eq("template_id", templateId);
  if (deleteError) return { error: deleteError.message };

  const uniqueIds = [...new Set(commentBankIds)].filter(Boolean);
  if (uniqueIds.length > 0) {
    const { error: insertError } = await supabase
      .from("assignment_comment_bank_links")
      .insert(uniqueIds.map((comment_bank_id) => ({ template_id: templateId, comment_bank_id })));
    if (insertError) return { error: insertError.message };
  }

  return { success: "Comment bank links saved" };
}

// ── Copy section from another template ───────────────────────────────────────

export async function copySectionFromTemplateAction(
  sourceTemplateId: string,
  sourceSectionId: string,
  targetTemplateId: string,
): Promise<ActionResult & { section?: BuilderSection }> {
  await assertTeacher();
  const supabase = await createClient();

  const [{ data: sourceTemplate }, { data: targetTemplate }] =
    await Promise.all([
      supabase
        .from("assignment_templates")
        .select("id, created_by")
        .eq("id", sourceTemplateId)
        .maybeSingle(),
      supabase
        .from("assignment_templates")
        .select("id, created_by")
        .eq("id", targetTemplateId)
        .maybeSingle(),
    ]);

  if (!sourceTemplate) return { error: "Source template not found" };
  if (!targetTemplate) return { error: "Target template not found" };

  const { loadTemplateStructure } = await import("@/lib/homework/structure");
  const sections = await loadTemplateStructure(supabase, sourceTemplateId);
  const found = sections.find((s) => s._id === sourceSectionId);

  if (!found) return { error: "Section not found in source template" };

  return { success: "Section copied", section: cloneSection(found) };
}

// ── Teacher templates list (for copy-from modal) ──────────────────────────────

export async function listMyTemplatesAction(): Promise<
  ActionResult & { templates?: Array<{ id: string; title: string }> }
> {
  const profile = await assertTeacher();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("assignment_templates")
    .select("id, title")
    .eq("created_by", profile.id)
    .order("created_at", { ascending: false });

  if (error) return { error: error.message };
  return { templates: data ?? [] };
}

export async function listTemplateSectionsAction(
  templateId: string,
): Promise<ActionResult & { sections?: Array<{ id: string; title: string }> }> {
  await assertTeacher();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("assignment_sections")
    .select("id, title, sort_order")
    .eq("template_id", templateId)
    .is("parent_section_id", null)
    .order("sort_order");

  if (error) return { error: error.message };
  return { sections: data ?? [] };
}

// ── Student structured responses ─────────────────────────────────────────────

export interface StructuredResponseInput {
  question_id: string;
  text_value?: string | null;
  numeric_value?: number | null;
  boolean_value?: boolean | null;
  json_value?: unknown;
  cells?: Array<{
    row_index: number;
    col_index: number;
    text_value?: string | null;
    numeric_value?: number | null;
    boolean_value?: boolean | null;
  }>;
}

async function assertStudentCanAccessAssignment(assignmentId: string) {
  const profile = await requireProfile(["student"]);
  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, class_id, status, release_at")
    .eq("id", assignmentId)
    .eq("status", "published")
    .maybeSingle();
  if (!assignment) return { error: "Assignment not found" as const };

  if (assignment.release_at && new Date(assignment.release_at).getTime() > Date.now()) {
    return { error: "This homework is not available yet" as const };
  }

  const { data: membership } = await supabase
    .from("class_members")
    .select("id")
    .eq("class_id", assignment.class_id)
    .eq("student_id", profile.id)
    .maybeSingle();
  if (!membership) return { error: "You are not in this class" as const };

  return { profile, supabase, assignment };
}

export async function saveStudentStructuredResponsesAction(
  assignmentId: string,
  responses: StructuredResponseInput[],
): Promise<ActionResult> {
  const access = await assertStudentCanAccessAssignment(assignmentId);
  if ("error" in access && access.error) return { error: access.error };
  const { profile, supabase } = access as Awaited<
    ReturnType<typeof assertStudentCanAccessAssignment>
  > & { profile: { id: string }; supabase: Awaited<ReturnType<typeof createClient>> };

  let { data: submission } = await supabase
    .from("submissions")
    .select("id, status")
    .eq("assignment_id", assignmentId)
    .eq("student_id", profile.id)
    .maybeSingle();

  if (!submission) {
    const { data: created, error: createError } = await supabase
      .from("submissions")
      .insert({ assignment_id: assignmentId, student_id: profile.id, status: "draft" })
      .select("id, status")
      .single();
    if (createError || !created) {
      return { error: createError?.message ?? "Could not create submission" };
    }
    submission = created;
  }

  if (!["draft", "returned"].includes(submission.status)) {
    return { error: "Submission is locked" };
  }

  const parsed = structuredResponsesSchema.safeParse(responses);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid responses" };
  }

  const errors: string[] = [];

  for (const resp of parsed.data) {
    const upsertRow: Omit<
      StudentResponse,
      "id" | "file_name" | "storage_path" | "created_at" | "updated_at"
    > = {
      submission_id: submission.id,
      question_id: resp.question_id,
      text_value: resp.text_value ?? null,
      numeric_value: resp.numeric_value ?? null,
      boolean_value: resp.boolean_value ?? null,
      json_value: resp.json_value ?? null,
    };

    const { data: upserted, error: upsertError } = await supabase
      .from("student_responses")
      .upsert(upsertRow, { onConflict: "submission_id,question_id" })
      .select("id")
      .single();

    if (upsertError) {
      errors.push(upsertError.message);
      continue;
    }

    if (resp.cells?.length && upserted) {
      const cellRows = resp.cells.map((c) => ({
        student_response_id: upserted.id,
        row_index: c.row_index,
        col_index: c.col_index,
        text_value: c.text_value ?? null,
        numeric_value: c.numeric_value ?? null,
        boolean_value: c.boolean_value ?? null,
      }));

      const { error: cellError } = await supabase
        .from("response_cells")
        .upsert(cellRows, { onConflict: "student_response_id,row_index,col_index" });

      if (cellError) errors.push(cellError.message);
    }
  }

  if (errors.length > 0) return { error: errors[0] };

  // Local-first: do not revalidatePath on autosave (prevents remount / text loss).
  return { success: "Responses saved", savedAt: new Date().toISOString() } as ActionResult & {
    savedAt: string;
  };
}

export async function submitStructuredHomeworkAction(
  assignmentId: string,
  responses: StructuredResponseInput[],
): Promise<ActionResult> {
  const saveResult = await saveStudentStructuredResponsesAction(assignmentId, responses);
  if (saveResult.error) return saveResult;

  const profile = await requireProfile(["student"]);
  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, title, due_at, class_id, template_id")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment) return { error: "Assignment not found" };

  const { data: submission } = await supabase
    .from("submissions")
    .select("id, status")
    .eq("assignment_id", assignmentId)
    .eq("student_id", profile.id)
    .maybeSingle();

  if (!submission || !["draft", "returned"].includes(submission.status)) {
    return { error: "Submission is locked" };
  }

  // Completion is calculated from structured responses, never legacy written_response.
  if (assignment.template_id) {
    try {
      const sections = await loadTemplateStructure(supabase, assignment.template_id);
      if (isStructuredAssignment(sections)) {
        const { data: stored } = await supabase
          .from("student_responses")
          .select(
            "question_id, text_value, numeric_value, boolean_value, json_value, file_name, storage_path, response_cells(row_index, col_index, text_value, numeric_value, boolean_value)",
          )
          .eq("submission_id", submission.id);

        const snapshots = (stored ?? []).map((row) => ({
          question_id: row.question_id as string,
          text_value: row.text_value as string | null,
          numeric_value: row.numeric_value as number | null,
          boolean_value: row.boolean_value as boolean | null,
          json_value: row.json_value,
          file_name: row.file_name as string | null,
          storage_path: row.storage_path as string | null,
          cells: Array.isArray(row.response_cells)
            ? (row.response_cells as Array<{
                row_index: number;
                col_index: number;
                text_value: string | null;
                numeric_value: number | null;
                boolean_value: boolean | null;
              }>)
            : [],
        }));

        const completion = evaluateStructuredCompletion(sections, snapshots);
        if (!completion.isComplete) {
          const missing = completion.missingRequired
            .slice(0, 3)
            .map((q) => q.label)
            .join("; ");
          return {
            error: missing
              ? `Complete required questions before submitting (${missing})`
              : "Complete required questions before submitting",
          };
        }
      }
    } catch {
      // If structure cannot be loaded, still allow submit of saved responses.
    }
  }

  const late =
    assignment.due_at != null &&
    new Date(assignment.due_at).getTime() < Date.now();
  const nextStatus = late ? "late" : "submitted";
  const submittedAt = new Date().toISOString();

  // Prefer transactional RPC when available; fall back if migration not applied yet.
  const { error: rpcError } = await supabase.rpc("submit_student_homework", {
    p_assignment_id: assignmentId,
    p_status: nextStatus,
    p_submitted_at: submittedAt,
  });

  if (rpcError) {
    const rpcMissing = /could not find the function|schema cache/i.test(
      rpcError.message ?? "",
    );
    if (!rpcMissing) {
      return { error: rpcError.message };
    }

    const { error } = await supabase
      .from("submissions")
      .update({
        status: nextStatus,
        submitted_at: submittedAt,
      })
      .eq("id", submission.id)
      .eq("student_id", profile.id)
      .in("status", ["draft", "returned"]);

    if (error) return { error: error.message };

    // Confirm the row actually flipped — RLS/with-check failures can no-op.
    const { data: confirmed } = await supabase
      .from("submissions")
      .select("status")
      .eq("id", submission.id)
      .maybeSingle();
    if (!confirmed || !["submitted", "late"].includes(confirmed.status)) {
      return { error: "Could not finalise submission status" };
    }
  }

  const { data: classTeachers } = await supabase
    .from("class_teachers")
    .select("teacher_id")
    .eq("class_id", assignment.class_id)
    .eq("can_mark_submissions", true);

  if (classTeachers?.length) {
    await supabase.from("notifications").insert(
      classTeachers.map((ct) => ({
        user_id: ct.teacher_id,
        type: "homework_submitted" as const,
        title: "Homework submitted",
        body: `${profile.display_name} submitted ${assignment.title}`,
        link_path: `/teacher/marking/${submission.id}`,
      })),
    );
  } else {
    const { data: classRow } = await supabase
      .from("classes")
      .select("teacher_id")
      .eq("id", assignment.class_id)
      .maybeSingle();
    if (classRow?.teacher_id) {
      await supabase.from("notifications").insert({
        user_id: classRow.teacher_id,
        type: "homework_submitted",
        title: "Homework submitted",
        body: `${profile.display_name} submitted ${assignment.title}`,
        link_path: `/teacher/marking/${submission.id}`,
      });
    }
  }

  revalidatePath(`/student/homework/${assignmentId}`);
  revalidatePath(`/student/homework/${assignmentId}/review`);
  revalidatePath("/student/homework");
  revalidatePath("/student/dashboard");
  revalidatePath("/teacher/marking");
  revalidatePath("/teacher/dashboard");
  return {
    success: late
      ? "Submitted (marked late). Your teacher can now review it."
      : "Homework submitted successfully.",
  };
}

// ── Load student's existing responses ────────────────────────────────────────

export async function loadStudentResponsesAction(
  submissionId: string,
): Promise<
  ActionResult & {
    responses?: Array<
      StudentResponse & {
        cells?: Array<{
          row_index: number;
          col_index: number;
          text_value: string | null;
          numeric_value: number | null;
          boolean_value: string | boolean | null;
        }>;
      }
    >;
  }
> {
  const profile = await requireProfile(["student", "teacher", "admin"]);
  const supabase = await createClient();

  const { data: submission } = await supabase
    .from("submissions")
    .select("id, student_id")
    .eq("id", submissionId)
    .maybeSingle();

  if (!submission) return { error: "Submission not found" };
  if (profile.role === "student" && submission.student_id !== profile.id) {
    return { error: "Not authorised" };
  }

  const { data, error } = await supabase
    .from("student_responses")
    .select(
      "*, response_cells(row_index, col_index, text_value, numeric_value, boolean_value)",
    )
    .eq("submission_id", submissionId);

  if (error) return { error: error.message };

  const responses = (data ?? []).map((r) => ({
    ...r,
    cells: Array.isArray(r.response_cells) ? r.response_cells : [],
  }));

  return { responses };
}
