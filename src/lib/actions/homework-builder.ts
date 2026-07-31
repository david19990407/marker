"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import type { BuilderSection, StudentResponse } from "@/lib/types";
import { cloneSection, structureToPayload } from "@/lib/homework/structure";
import { structuredResponsesSchema } from "@/lib/validations/homework";
import type { ActionResult } from "@/lib/actions/auth";

async function assertTeacher() {
  return requireProfile(["teacher", "admin"]);
}

// ── Save structure ────────────────────────────────────────────────────────────

export async function saveHomeworkStructureAction(
  templateId: string,
  sections: BuilderSection[],
): Promise<ActionResult & { sections?: BuilderSection[] }> {
  await assertTeacher();
  const supabase = await createClient();

  const payload = structureToPayload(sections);

  const { error } = await supabase.rpc("save_assignment_structure", {
    p_template_id: templateId,
    p_structure: payload,
  });

  if (error) return { error: error.message };

  // Reload so client receives persisted question_ids
  const { loadTemplateStructure } = await import("@/lib/homework/structure");
  const reloaded = await loadTemplateStructure(supabase, templateId);

  revalidatePath(`/teacher/assignments`);
  return { success: "Structure saved", sections: reloaded };
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

  revalidatePath(`/student/homework/${assignmentId}`);
  revalidatePath(`/student/homework/${assignmentId}/review`);
  return { success: "Responses saved" };
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
    .select("id, due_at")
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

  const late =
    assignment.due_at != null &&
    new Date(assignment.due_at).getTime() < Date.now();

  const { error } = await supabase
    .from("submissions")
    .update({
      status: late ? "late" : "submitted",
      submitted_at: new Date().toISOString(),
    })
    .eq("id", submission.id)
    .eq("student_id", profile.id);

  if (error) return { error: error.message };

  revalidatePath(`/student/homework/${assignmentId}`);
  revalidatePath(`/student/homework/${assignmentId}/review`);
  return { success: "Homework submitted" };
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
