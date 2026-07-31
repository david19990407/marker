"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import { generateJoinCode } from "@/lib/utils/join-code";
import {
  assertSafeUpload,
  buildStoragePath,
} from "@/lib/utils/files";
import {
  assignmentSchema,
  feedbackSchema,
  teacherClassSchema,
} from "@/lib/validations/teacher";
import type { ActionResult } from "@/lib/actions/auth";

async function assertTeacher() {
  return requireProfile(["teacher", "admin"]);
}

async function assertOwnsClass(classId: string, teacherId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("classes")
    .select("id, teacher_id")
    .eq("id", classId)
    .maybeSingle();
  if (!data || data.teacher_id !== teacherId) {
    throw new Error("Class not found");
  }
  return data;
}

export async function createTeacherClassAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const profile = await assertTeacher();
  const parsed = teacherClassSchema.safeParse({
    name: formData.get("name"),
    subject: formData.get("subject") || "English",
    year_group: formData.get("year_group") || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid class" };
  }

  const supabase = await createClient();
  for (let i = 0; i < 5; i += 1) {
    const join_code = generateJoinCode();
    const { data, error } = await supabase
      .from("classes")
      .insert({
        ...parsed.data,
        teacher_id: profile.id,
        join_code,
      })
      .select("id")
      .single();
    if (!error && data) {
      revalidatePath("/teacher/classes");
      revalidatePath("/teacher/dashboard");
      redirect(`/teacher/classes/${data.id}`);
    }
    if (error?.code !== "23505") {
      return { error: error?.message ?? "Failed to create class" };
    }
  }
  return { error: "Could not generate a unique join code" };
}

export async function updateTeacherClassAction(
  classId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const profile = await assertTeacher();
  await assertOwnsClass(classId, profile.id);
  const parsed = teacherClassSchema.safeParse({
    name: formData.get("name"),
    subject: formData.get("subject") || "English",
    year_group: formData.get("year_group") || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid class" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("classes")
    .update(parsed.data)
    .eq("id", classId)
    .eq("teacher_id", profile.id);
  if (error) return { error: error.message };
  revalidatePath(`/teacher/classes/${classId}`);
  revalidatePath("/teacher/classes");
  return { success: "Class updated" };
}

export async function archiveTeacherClassAction(
  classId: string,
): Promise<ActionResult> {
  const profile = await assertTeacher();
  await assertOwnsClass(classId, profile.id);
  const supabase = await createClient();
  const { error } = await supabase
    .from("classes")
    .update({ archived: true })
    .eq("id", classId)
    .eq("teacher_id", profile.id);
  if (error) return { error: error.message };
  revalidatePath("/teacher/classes");
  return { success: "Class archived" };
}

export async function regenerateJoinCodeAction(
  classId: string,
): Promise<ActionResult> {
  const profile = await assertTeacher();
  await assertOwnsClass(classId, profile.id);
  const supabase = await createClient();
  for (let i = 0; i < 5; i += 1) {
    const join_code = generateJoinCode();
    const { error } = await supabase
      .from("classes")
      .update({ join_code })
      .eq("id", classId)
      .eq("teacher_id", profile.id);
    if (!error) {
      revalidatePath(`/teacher/classes/${classId}`);
      return { success: `New join code: ${join_code}` };
    }
    if (error.code !== "23505") return { error: error.message };
  }
  return { error: "Could not regenerate join code" };
}

export async function addStudentToClassAction(
  classId: string,
  studentId: string,
): Promise<ActionResult> {
  return addStudentByEmailAction(classId, undefined, studentId);
}

export async function addStudentByEmailAction(
  classId: string,
  email?: string,
  studentId?: string,
): Promise<ActionResult> {
  const profile = await assertTeacher();
  await assertOwnsClass(classId, profile.id);

  // Service role lookup only to resolve student identity; membership write uses
  // the teacher session so RLS still applies to class ownership.
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  let student: { id: string; role: string; is_active: boolean; display_name: string } | null =
    null;
  if (studentId) {
    const { data } = await admin
      .from("profiles")
      .select("id, role, is_active, display_name")
      .eq("id", studentId)
      .maybeSingle();
    student = data;
  } else if (email) {
    const { data } = await admin
      .from("profiles")
      .select("id, role, is_active, display_name")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();
    student = data;
  }

  if (!student || student.role !== "student" || !student.is_active) {
    return { error: "No active student found with that email" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("class_members").upsert(
    { class_id: classId, student_id: student.id },
    { onConflict: "class_id,student_id" },
  );
  if (error) return { error: error.message };
  revalidatePath(`/teacher/classes/${classId}`);
  return { success: `${student.display_name} added to the class` };
}

export async function removeStudentFromTeacherClassAction(
  classId: string,
  studentId: string,
): Promise<ActionResult> {
  const profile = await assertTeacher();
  await assertOwnsClass(classId, profile.id);
  const supabase = await createClient();
  const { error } = await supabase
    .from("class_members")
    .delete()
    .eq("class_id", classId)
    .eq("student_id", studentId);
  if (error) return { error: error.message };
  revalidatePath(`/teacher/classes/${classId}`);
  return { success: "Student removed" };
}

export async function saveAssignmentAction(
  assignmentId: string | null,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const profile = await assertTeacher();
  const parsed = assignmentSchema.safeParse({
    class_id: formData.get("class_id"),
    title: formData.get("title"),
    instructions: formData.get("instructions") || "",
    due_at: formData.get("due_at") || undefined,
    maximum_mark: formData.get("maximum_mark") || 30,
    allow_text_submission:
      formData.get("allow_text_submission") === "on" ||
      formData.get("allow_text_submission") === "true",
    allow_file_submission:
      formData.get("allow_file_submission") === "on" ||
      formData.get("allow_file_submission") === "true",
    status: formData.get("status") || "draft",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid assignment" };
  }
  if (!parsed.data.allow_text_submission && !parsed.data.allow_file_submission) {
    return { error: "Allow at least one submission method" };
  }

  await assertOwnsClass(parsed.data.class_id, profile.id);
  const supabase = await createClient();

  const payload = {
    ...parsed.data,
    teacher_id: profile.id,
  };

  if (assignmentId) {
    const { data: existing } = await supabase
      .from("assignments")
      .select("id, teacher_id")
      .eq("id", assignmentId)
      .maybeSingle();
    if (!existing || existing.teacher_id !== profile.id) {
      return { error: "Assignment not found" };
    }
    const { error } = await supabase
      .from("assignments")
      .update(payload)
      .eq("id", assignmentId);
    if (error) return { error: error.message };
    await maybeNotifyPublished(assignmentId, parsed.data.status, parsed.data.class_id, parsed.data.title);
    revalidatePath("/teacher/assignments");
    revalidatePath(`/teacher/assignments/${assignmentId}`);
    return { success: "Assignment saved" };
  }

  const { data, error } = await supabase
    .from("assignments")
    .insert(payload)
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Failed to create" };

  await maybeNotifyPublished(data.id, parsed.data.status, parsed.data.class_id, parsed.data.title);
  revalidatePath("/teacher/assignments");
  revalidatePath("/teacher/dashboard");
  redirect(`/teacher/assignments/${data.id}`);
}

async function maybeNotifyPublished(
  assignmentId: string,
  status: string,
  classId: string,
  title: string,
) {
  if (status !== "published") return;
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("class_members")
    .select("student_id")
    .eq("class_id", classId);
  if (!members?.length) return;
  await supabase.from("notifications").insert(
    members.map((m) => ({
      user_id: m.student_id,
      type: "assignment_published" as const,
      title: "New assignment",
      body: title,
      link_path: `/student/homework/${assignmentId}`,
    })),
  );
}

export async function archiveAssignmentAction(
  assignmentId: string,
): Promise<ActionResult> {
  const profile = await assertTeacher();
  const supabase = await createClient();
  const { error } = await supabase
    .from("assignments")
    .update({ status: "archived" })
    .eq("id", assignmentId)
    .eq("teacher_id", profile.id);
  if (error) return { error: error.message };
  revalidatePath("/teacher/assignments");
  return { success: "Assignment archived" };
}

export async function uploadAssignmentResourceAction(
  assignmentId: string,
  formData: FormData,
): Promise<ActionResult> {
  const profile = await assertTeacher();
  const supabase = await createClient();
  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, teacher_id")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment || assignment.teacher_id !== profile.id) {
    return { error: "Assignment not found" };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Choose a file to upload" };

  try {
    const { mime, safeName } = assertSafeUpload(file, "assignment-resource");
    const path = buildStoragePath(
      profile.id,
      assignmentId,
      `${crypto.randomUUID()}-${safeName}`,
    );
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from("assignment-resources")
      .upload(path, buffer, { contentType: mime, upsert: false });
    if (uploadError) return { error: uploadError.message };

    const { error } = await supabase.from("assignment_resources").insert({
      assignment_id: assignmentId,
      file_name: safeName,
      storage_path: path,
      file_type: mime,
      file_size: file.size,
    });
    if (error) return { error: error.message };
    revalidatePath(`/teacher/assignments/${assignmentId}`);
    return { success: "Resource uploaded" };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Upload failed" };
  }
}

export async function deleteAssignmentResourceAction(
  resourceId: string,
  assignmentId: string,
): Promise<ActionResult> {
  const profile = await assertTeacher();
  const supabase = await createClient();
  const { data: resource } = await supabase
    .from("assignment_resources")
    .select("id, storage_path, assignment_id, assignments!inner(teacher_id)")
    .eq("id", resourceId)
    .maybeSingle();

  const teacherId = Array.isArray(resource?.assignments)
    ? resource?.assignments[0]?.teacher_id
    : (resource?.assignments as { teacher_id: string } | undefined)?.teacher_id;

  if (!resource || teacherId !== profile.id) {
    return { error: "Resource not found" };
  }

  await supabase.storage.from("assignment-resources").remove([resource.storage_path]);
  const { error } = await supabase
    .from("assignment_resources")
    .delete()
    .eq("id", resourceId);
  if (error) return { error: error.message };
  revalidatePath(`/teacher/assignments/${assignmentId}`);
  return { success: "Resource removed" };
}

export async function saveFeedbackAction(
  submissionId: string,
  mode: "draft" | "release" | "return_unmarked",
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const profile = await assertTeacher();
  const parsed = feedbackSchema.safeParse({
    mark: formData.get("mark"),
    strengths: formData.get("strengths"),
    improvements: formData.get("improvements"),
    next_steps: formData.get("next_steps"),
    private_notes: formData.get("private_notes"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid feedback" };
  }

  const supabase = await createClient();
  const { data: submission } = await supabase
    .from("submissions")
    .select(
      "id, student_id, assignment_id, status, assignments!inner(id, teacher_id, maximum_mark, title)",
    )
    .eq("id", submissionId)
    .maybeSingle();

  const assignment = Array.isArray(submission?.assignments)
    ? submission?.assignments[0]
    : submission?.assignments;
  if (!submission || !assignment || assignment.teacher_id !== profile.id) {
    return { error: "Submission not found" };
  }

  if (
    parsed.data.mark !== null &&
    parsed.data.mark > Number(assignment.maximum_mark)
  ) {
    return { error: `Mark cannot exceed ${assignment.maximum_mark}` };
  }

  if (mode === "release" && parsed.data.mark === null) {
    return { error: "Enter a mark before releasing feedback" };
  }

  const feedbackStatus = mode === "draft" ? "draft" : "released";
  const now = new Date().toISOString();

  const { error: feedbackError } = await supabase.from("feedback").upsert(
    {
      submission_id: submissionId,
      teacher_id: profile.id,
      mark: mode === "return_unmarked" ? null : parsed.data.mark,
      strengths: parsed.data.strengths || null,
      improvements: parsed.data.improvements || null,
      next_steps: parsed.data.next_steps || null,
      private_notes: parsed.data.private_notes || null,
      status: feedbackStatus,
      released_at: mode === "draft" ? null : now,
    },
    { onConflict: "submission_id" },
  );
  if (feedbackError) return { error: feedbackError.message };

  if (mode !== "draft") {
    const submissionStatus = mode === "return_unmarked" ? "returned" : "marked";
    const { error: subError } = await supabase
      .from("submissions")
      .update({
        status: submissionStatus,
        marked_at: mode === "release" ? now : null,
        returned_at: now,
      })
      .eq("id", submissionId);
    if (subError) return { error: subError.message };

    await supabase.from("notifications").insert({
      user_id: submission.student_id,
      type: "feedback_released",
      title: "Feedback released",
      body: assignment.title,
      link_path: `/student/homework/${submission.assignment_id}`,
    });
  }

  revalidatePath("/teacher/marking");
  revalidatePath(`/teacher/marking/${submissionId}`);
  revalidatePath("/teacher/dashboard");
  return {
    success:
      mode === "draft"
        ? "Feedback saved as draft"
        : mode === "return_unmarked"
          ? "Work returned to student"
          : "Mark and feedback released",
  };
}

export async function reopenSubmissionAction(
  submissionId: string,
): Promise<ActionResult> {
  const profile = await assertTeacher();
  const supabase = await createClient();
  const { data: submission } = await supabase
    .from("submissions")
    .select("id, student_id, assignment_id, assignments!inner(teacher_id, title)")
    .eq("id", submissionId)
    .maybeSingle();
  const assignment = Array.isArray(submission?.assignments)
    ? submission?.assignments[0]
    : submission?.assignments;
  if (!submission || !assignment || assignment.teacher_id !== profile.id) {
    return { error: "Submission not found" };
  }

  const { error } = await supabase
    .from("submissions")
    .update({
      status: "returned",
      returned_at: new Date().toISOString(),
    })
    .eq("id", submissionId);
  if (error) return { error: error.message };

  await supabase
    .from("feedback")
    .update({ status: "draft", released_at: null })
    .eq("submission_id", submissionId);

  await supabase.from("notifications").insert({
    user_id: submission.student_id,
    type: "submission_reopened",
    title: "Submission reopened",
    body: `You can update your work for ${assignment.title}`,
    link_path: `/student/homework/${submission.assignment_id}`,
  });

  revalidatePath(`/teacher/marking/${submissionId}`);
  revalidatePath("/teacher/marking");
  return { success: "Submission reopened for the student" };
}
