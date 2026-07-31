"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import {
  assertSafeUpload,
  buildStoragePath,
} from "@/lib/utils/files";
import { joinClassSchema, submissionDraftSchema } from "@/lib/validations/student";
import type { ActionResult } from "@/lib/actions/auth";

async function assertStudent() {
  return requireProfile(["student"]);
}

export async function joinClassAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const profile = await assertStudent();
  const parsed = joinClassSchema.safeParse({
    join_code: formData.get("join_code"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid join code" };
  }

  const supabase = await createClient();
  const { data: classRow } = await supabase
    .from("classes")
    .select("id, name, archived")
    .eq("join_code", parsed.data.join_code)
    .maybeSingle();

  if (!classRow || classRow.archived) {
    return { error: "No active class found for that join code" };
  }

  const { error } = await supabase.from("class_members").upsert(
    { class_id: classRow.id, student_id: profile.id },
    { onConflict: "class_id,student_id" },
  );
  if (error) return { error: error.message };

  revalidatePath("/student/classes");
  revalidatePath("/student/dashboard");
  revalidatePath("/student/homework");
  return { success: `Joined ${classRow.name}` };
}

async function getEditableSubmission(assignmentId: string, studentId: string) {
  const supabase = await createClient();
  const { data: assignment } = await supabase
    .from("assignments")
    .select(
      "id, title, status, due_at, allow_text_submission, allow_file_submission, class_id, maximum_mark",
    )
    .eq("id", assignmentId)
    .eq("status", "published")
    .maybeSingle();

  if (!assignment) return { error: "Assignment not found" as const };

  const { data: membership } = await supabase
    .from("class_members")
    .select("id")
    .eq("class_id", assignment.class_id)
    .eq("student_id", studentId)
    .maybeSingle();
  if (!membership) return { error: "You are not in this class" as const };

  let { data: submission } = await supabase
    .from("submissions")
    .select("*")
    .eq("assignment_id", assignmentId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (!submission) {
    const { data: created, error } = await supabase
      .from("submissions")
      .insert({
        assignment_id: assignmentId,
        student_id: studentId,
        status: "draft",
      })
      .select("*")
      .single();
    if (error || !created) {
      return { error: error?.message ?? "Could not create submission" as const };
    }
    submission = created;
  }

  if (!["draft", "returned"].includes(submission.status)) {
    return { error: "This submission can no longer be edited" as const };
  }

  return { assignment, submission, supabase };
}

export async function saveSubmissionDraftAction(
  assignmentId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const profile = await assertStudent();
  const parsed = submissionDraftSchema.safeParse({
    written_response: formData.get("written_response"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid response" };
  }

  const result = await getEditableSubmission(assignmentId, profile.id);
  if ("error" in result && result.error && !("submission" in result)) {
    return { error: result.error };
  }
  if (!("submission" in result) || !result.submission || !result.supabase) {
    return { error: "Unable to save draft" };
  }

  if (
    result.assignment &&
    !result.assignment.allow_text_submission &&
    parsed.data.written_response
  ) {
    return { error: "This assignment does not accept written responses" };
  }

  const { error } = await result.supabase
    .from("submissions")
    .update({
      written_response: parsed.data.written_response || null,
      status: "draft",
    })
    .eq("id", result.submission.id);
  if (error) return { error: error.message };

  revalidatePath(`/student/homework/${assignmentId}`);
  return { success: "Draft saved" };
}

export async function uploadSubmissionFileAction(
  assignmentId: string,
  formData: FormData,
): Promise<ActionResult> {
  const profile = await assertStudent();
  const result = await getEditableSubmission(assignmentId, profile.id);
  if (!("submission" in result) || !result.submission || !result.assignment) {
    return { error: "error" in result ? result.error : "Unable to upload" };
  }
  if (!result.assignment.allow_file_submission) {
    return { error: "This assignment does not accept file uploads" };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Choose a file to upload" };

  try {
    const { mime, safeName } = assertSafeUpload(file, "submission");
    const path = buildStoragePath(
      profile.id,
      assignmentId,
      `${crypto.randomUUID()}-${safeName}`,
    );
    const buffer = Buffer.from(await file.arrayBuffer());

    if (result.submission.storage_path) {
      await result.supabase.storage
        .from("student-submissions")
        .remove([result.submission.storage_path]);
    }

    const { error: uploadError } = await result.supabase.storage
      .from("student-submissions")
      .upload(path, buffer, { contentType: mime, upsert: false });
    if (uploadError) return { error: uploadError.message };

    const { error } = await result.supabase
      .from("submissions")
      .update({
        file_name: safeName,
        storage_path: path,
        status: "draft",
      })
      .eq("id", result.submission.id);
    if (error) return { error: error.message };

    revalidatePath(`/student/homework/${assignmentId}`);
    return { success: "File uploaded" };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Upload failed" };
  }
}

export async function submitHomeworkAction(
  assignmentId: string,
): Promise<ActionResult> {
  const profile = await assertStudent();
  const result = await getEditableSubmission(assignmentId, profile.id);
  if (!("submission" in result) || !result.submission || !result.assignment) {
    return { error: "error" in result ? result.error : "Unable to submit" };
  }

  const hasText = Boolean(result.submission.written_response?.trim());
  const hasFile = Boolean(result.submission.storage_path);

  const { count: structuredCount } = await result.supabase
    .from("student_responses")
    .select("id", { count: "exact", head: true })
    .eq("submission_id", result.submission.id);
  const hasStructured = (structuredCount ?? 0) > 0;

  if (
    result.assignment.allow_text_submission &&
    !result.assignment.allow_file_submission &&
    !hasText &&
    !hasStructured
  ) {
    return { error: "Write your response before submitting" };
  }
  if (
    result.assignment.allow_file_submission &&
    !result.assignment.allow_text_submission &&
    !hasFile &&
    !hasStructured
  ) {
    return { error: "Upload a file before submitting" };
  }
  if (!hasText && !hasFile && !hasStructured) {
    return {
      error:
        "Add answers, a written response, or a file before submitting",
    };
  }

  const now = new Date();
  const late =
    result.assignment.due_at &&
    now.getTime() > new Date(result.assignment.due_at).getTime();

  const { error } = await result.supabase
    .from("submissions")
    .update({
      status: late ? "late" : "submitted",
      submitted_at: now.toISOString(),
    })
    .eq("id", result.submission.id);
  if (error) return { error: error.message };

  // Notify all teachers with marking permission (fallback to lead teacher)
  const { data: classTeachers } = await result.supabase
    .from("class_teachers")
    .select("teacher_id")
    .eq("class_id", result.assignment.class_id)
    .eq("can_mark_submissions", true);

  if (classTeachers?.length) {
    await result.supabase.from("notifications").insert(
      classTeachers.map((ct) => ({
        user_id: ct.teacher_id,
        type: "homework_submitted" as const,
        title: "Homework submitted",
        body: `${profile.display_name} submitted ${result.assignment.title}`,
        link_path: `/teacher/marking/${result.submission.id}`,
      })),
    );
  } else {
    const { data: classRow } = await result.supabase
      .from("classes")
      .select("teacher_id")
      .eq("id", result.assignment.class_id)
      .maybeSingle();
    if (classRow?.teacher_id) {
      await result.supabase.from("notifications").insert({
        user_id: classRow.teacher_id,
        type: "homework_submitted" as const,
        title: "Homework submitted",
        body: `${profile.display_name} submitted ${result.assignment.title}`,
        link_path: `/teacher/marking/${result.submission.id}`,
      });
    }
  }

  revalidatePath(`/student/homework/${assignmentId}`);
  revalidatePath("/student/homework");
  revalidatePath("/student/dashboard");
  return {
    success: late
      ? "Submitted (marked late). Your teacher can now review it."
      : "Homework submitted successfully.",
  };
}
