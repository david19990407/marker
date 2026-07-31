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
  createAssignmentSchema,
  feedbackSchema,
  teacherClassSchema,
} from "@/lib/validations/teacher";
import type { ActionResult } from "@/lib/actions/auth";
import type { ClassTeacherRole } from "@/lib/types";

async function assertTeacher() {
  return requireProfile(["teacher", "admin"]);
}

async function assertOwnsClass(classId: string, teacherId: string) {
  const supabase = await createClient();
  // Check class_teachers membership first (covers co-teachers)
  const { data: membership } = await supabase
    .from("class_teachers")
    .select("id")
    .eq("class_id", classId)
    .eq("teacher_id", teacherId)
    .maybeSingle();
  if (membership) return;
  // Fallback: check legacy classes.teacher_id for classes created before migration
  const { data: cls } = await supabase
    .from("classes")
    .select("id, teacher_id")
    .eq("id", classId)
    .maybeSingle();
  if (!cls || cls.teacher_id !== teacherId) {
    throw new Error("Class not found");
  }
}

async function assertLeadTeacher(classId: string, teacherId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("class_teachers")
    .select("membership_role")
    .eq("class_id", classId)
    .eq("teacher_id", teacherId)
    .maybeSingle();
  if (data?.membership_role === "lead_teacher") return;
  // Fallback: original teacher_id is implicitly lead
  const { data: cls } = await supabase
    .from("classes")
    .select("teacher_id")
    .eq("id", classId)
    .maybeSingle();
  if (!cls || cls.teacher_id !== teacherId) {
    throw new Error("Only the lead teacher can perform this action");
  }
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
      // Register as lead teacher in class_teachers
      await supabase.from("class_teachers").upsert(
        {
          class_id: data.id,
          teacher_id: profile.id,
          membership_role: "lead_teacher",
          can_create_assignments: true,
          can_mark_submissions: true,
          can_manage_members: true,
        },
        { onConflict: "class_id,teacher_id" },
      );
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
    .eq("id", classId);
  if (error) return { error: error.message };
  revalidatePath(`/teacher/classes/${classId}`);
  revalidatePath("/teacher/classes");
  return { success: "Class updated" };
}

export async function archiveTeacherClassAction(
  classId: string,
): Promise<ActionResult> {
  const profile = await assertTeacher();
  await assertLeadTeacher(classId, profile.id);
  const supabase = await createClient();
  const { error } = await supabase
    .from("classes")
    .update({ archived: true })
    .eq("id", classId);
  if (error) return { error: error.message };
  revalidatePath("/teacher/classes");
  return { success: "Class archived" };
}

export async function regenerateJoinCodeAction(
  classId: string,
): Promise<ActionResult> {
  const profile = await assertTeacher();
  await assertLeadTeacher(classId, profile.id);
  const supabase = await createClient();
  for (let i = 0; i < 5; i += 1) {
    const join_code = generateJoinCode();
    const { error } = await supabase
      .from("classes")
      .update({ join_code })
      .eq("id", classId);
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

export async function addClassTeacherAction(
  classId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const profile = await assertTeacher();
  await assertLeadTeacher(classId, profile.id);

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = (String(formData.get("role") ?? "teacher")) as ClassTeacherRole;
  if (!email) return { error: "Enter a teacher email" };

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const { data: teacher } = await admin
    .from("profiles")
    .select("id, role, is_active, display_name")
    .eq("email", email)
    .maybeSingle();

  if (!teacher || teacher.role === "student" || !teacher.is_active) {
    return { error: "No active teacher found with that email" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("class_teachers").upsert(
    {
      class_id: classId,
      teacher_id: teacher.id,
      membership_role: role,
      can_create_assignments: true,
      can_mark_submissions: true,
      can_manage_members: role === "lead_teacher",
    },
    { onConflict: "class_id,teacher_id" },
  );
  if (error) return { error: error.message };
  revalidatePath(`/teacher/classes/${classId}`);
  return { success: `${teacher.display_name} added as ${role.replace(/_/g, " ")}` };
}

export async function updateClassTeacherRoleAction(
  classId: string,
  targetTeacherId: string,
  role: ClassTeacherRole,
): Promise<ActionResult> {
  const profile = await assertTeacher();
  await assertLeadTeacher(classId, profile.id);

  if (targetTeacherId === profile.id) {
    return { error: "You cannot change your own role" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("class_teachers")
    .update({
      membership_role: role,
      can_manage_members: role === "lead_teacher",
    })
    .eq("class_id", classId)
    .eq("teacher_id", targetTeacherId);
  if (error) return { error: error.message };
  revalidatePath(`/teacher/classes/${classId}`);
  return { success: "Role updated" };
}

export async function removeClassTeacherAction(
  classId: string,
  targetTeacherId: string,
): Promise<ActionResult> {
  const profile = await assertTeacher();
  await assertLeadTeacher(classId, profile.id);

  if (targetTeacherId === profile.id) {
    return { error: "You cannot remove yourself from the class" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("class_teachers")
    .delete()
    .eq("class_id", classId)
    .eq("teacher_id", targetTeacherId);
  if (error) return { error: error.message };
  revalidatePath(`/teacher/classes/${classId}`);
  return { success: "Teacher removed from class" };
}

export async function saveAssignmentAction(
  assignmentId: string | null,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const profile = await assertTeacher();
  const supabase = await createClient();

  // --- CREATE: multi-class via RPC ---
  if (!assignmentId) {
    const classIds = formData.getAll("class_ids").map(String).filter(Boolean);
    const parsed = createAssignmentSchema.safeParse({
      class_ids: classIds,
      title: formData.get("title"),
      instructions: formData.get("instructions") || "",
      due_at: formData.get("due_at") || undefined,
      release_at: formData.get("release_at") || undefined,
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

    let perClassDueAt: Record<string, string> = {};
    const perClassJson = String(formData.get("per_class_due_at_json") || "{}");
    try {
      perClassDueAt = JSON.parse(perClassJson);
    } catch {
      // use empty
    }

    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "create_assignment_template_and_deploy",
      {
        p_title: parsed.data.title,
        p_instructions: parsed.data.instructions,
        p_class_ids: parsed.data.class_ids,
        p_due_at: parsed.data.due_at,
        p_release_at: parsed.data.release_at,
        p_maximum_mark: parsed.data.maximum_mark,
        p_allow_text: parsed.data.allow_text_submission,
        p_allow_file: parsed.data.allow_file_submission,
        p_status: parsed.data.status,
        p_per_class_due_at: perClassDueAt,
        p_academic_year: null,
      },
    );
    if (rpcError) return { error: rpcError.message };

    if (parsed.data.status === "published") {
      const deploymentIds = extractDeploymentIds(rpcResult);
      if (deploymentIds.length) {
        for (const deploymentId of deploymentIds) {
          const { data: dep } = await supabase
            .from("assignments")
            .select("id, title, class_id")
            .eq("id", deploymentId)
            .maybeSingle();
          if (dep) {
            await maybeNotifyPublished(
              dep.id,
              "published",
              dep.class_id,
              dep.title,
            );
          }
        }
      } else {
        for (const classId of parsed.data.class_ids) {
          const { data: deployments } = await supabase
            .from("assignments")
            .select("id, title")
            .eq("class_id", classId)
            .eq("teacher_id", profile.id)
            .eq("title", parsed.data.title)
            .limit(1);
          const dep = deployments?.[0];
          if (dep) {
            await maybeNotifyPublished(dep.id, "published", classId, dep.title);
          }
        }
      }
    }

    revalidatePath("/teacher/assignments");
    revalidatePath("/teacher/dashboard");
    redirect("/teacher/assignments");
  }

  // --- EDIT: single deployment ---
  const parsed = assignmentSchema.safeParse({
    class_id: formData.get("class_id"),
    title: formData.get("title"),
    instructions: formData.get("instructions") || "",
    due_at: formData.get("due_at") || undefined,
    release_at: formData.get("release_at") || undefined,
    maximum_mark: formData.get("maximum_mark") || 30,
    allow_text_submission:
      formData.get("allow_text_submission") === "on" ||
      formData.get("allow_text_submission") === "true",
    allow_file_submission:
      formData.get("allow_file_submission") === "on" ||
      formData.get("allow_file_submission") === "true",
    status: formData.get("status") || "draft",
    update_template:
      formData.get("update_template") === "on" ||
      formData.get("update_template") === "true",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid assignment" };
  }
  if (!parsed.data.allow_text_submission && !parsed.data.allow_file_submission) {
    return { error: "Allow at least one submission method" };
  }

  const { data: existing } = await supabase
    .from("assignments")
    .select("id, teacher_id, class_id, template_id")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!existing) return { error: "Assignment not found" };

  // Authorisation: teacher_id match OR class_teachers membership
  if (existing.teacher_id !== profile.id) {
    const { data: ct } = await supabase
      .from("class_teachers")
      .select("id")
      .eq("class_id", existing.class_id)
      .eq("teacher_id", profile.id)
      .maybeSingle();
    if (!ct) return { error: "Assignment not found" };
  }

  const { error } = await supabase
    .from("assignments")
    .update({
      class_id: parsed.data.class_id,
      title: parsed.data.title,
      instructions: parsed.data.instructions,
      due_at: parsed.data.due_at,
      release_at: parsed.data.release_at,
      maximum_mark: parsed.data.maximum_mark,
      allow_text_submission: parsed.data.allow_text_submission,
      allow_file_submission: parsed.data.allow_file_submission,
      status: parsed.data.status,
    })
    .eq("id", assignmentId);
  if (error) return { error: error.message };

  // Optionally sync content changes back to the template (triggers DB sync to other deployments)
  if (
    parsed.data.update_template &&
    existing.template_id
  ) {
    await supabase
      .from("assignment_templates")
      .update({
        title: parsed.data.title,
        instructions: parsed.data.instructions,
        allow_text_submission: parsed.data.allow_text_submission,
        allow_file_submission: parsed.data.allow_file_submission,
        default_maximum_mark: parsed.data.maximum_mark,
      })
      .eq("id", existing.template_id);
  }

  await maybeNotifyPublished(
    assignmentId,
    parsed.data.status,
    parsed.data.class_id,
    parsed.data.title,
  );
  revalidatePath("/teacher/assignments");
  revalidatePath(`/teacher/assignments/${assignmentId}`);
  return { success: "Assignment saved" };
}

export async function copyAssignmentAction(
  assignmentId: string,
): Promise<ActionResult> {
  const profile = await assertTeacher();
  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, class_id, teacher_id, title, instructions, allow_text_submission, allow_file_submission, maximum_mark")
    .eq("id", assignmentId)
    .maybeSingle();

  if (!assignment) return { error: "Assignment not found" };
  if (assignment.teacher_id !== profile.id) {
    const { data: ct } = await supabase
      .from("class_teachers")
      .select("id")
      .eq("class_id", assignment.class_id)
      .eq("teacher_id", profile.id)
      .maybeSingle();
    if (!ct) return { error: "Assignment not found" };
  }

  const { error: rpcError } = await supabase.rpc(
    "create_assignment_template_and_deploy",
    {
      p_title: `Copy of ${assignment.title}`,
      p_instructions: assignment.instructions,
      p_class_ids: [assignment.class_id],
      p_due_at: null,
      p_release_at: null,
      p_maximum_mark: assignment.maximum_mark,
      p_allow_text: assignment.allow_text_submission,
      p_allow_file: assignment.allow_file_submission,
      p_status: "draft",
      p_per_class_due_at: {},
      p_academic_year: null,
    },
  );
  if (rpcError) return { error: rpcError.message };

  revalidatePath("/teacher/assignments");
  return { success: `Created draft copy "Copy of ${assignment.title}"` };
}

/** Normalise create_assignment_template_and_deploy jsonb/uuid return shapes. */
function extractDeploymentIds(rpcResult: unknown): string[] {
  if (!rpcResult || typeof rpcResult !== "object") return [];
  const ids = (rpcResult as { deployment_ids?: unknown }).deployment_ids;
  if (!Array.isArray(ids)) return [];
  return ids.filter((id): id is string => typeof id === "string");
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
