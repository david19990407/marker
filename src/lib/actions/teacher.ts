"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
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

export async function createTeacherClassAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const profile = await assertTeacher();
  if (profile.role === "student") {
    return { error: "Students cannot create classes" };
  }
  const parsed = teacherClassSchema.safeParse({
    name: formData.get("name"),
    subject: formData.get("subject") || "English",
    year_group: formData.get("year_group") || null,
    colour_hex: formData.get("colour_hex") || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid class" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_class_with_lead_teacher", {
    p_name: parsed.data.name,
    p_subject: parsed.data.subject,
    p_year_group: parsed.data.year_group,
    p_teacher_id: profile.id,
    p_colour_hex: parsed.data.colour_hex,
    p_additional_teacher_ids: [],
  });

  if (error) {
    return { error: error.message ?? "Failed to create class" };
  }

  const classId =
    data && typeof data === "object" && "id" in data
      ? String((data as { id: string }).id)
      : null;
  if (!classId) {
    return { error: "Failed to create class" };
  }

  revalidatePath("/teacher/classes");
  revalidatePath("/teacher/dashboard");
  redirect(`/teacher/classes/${classId}`);
}

export async function updateTeacherClassAction(
  ..._args: [string, ActionResult, FormData]
): Promise<ActionResult> {
  await assertTeacher();
  void _args;
  return {
    error:
      "Teachers cannot change class name, subject, year group or colour. Ask an administrator.",
  };
}

export async function archiveTeacherClassAction(
  ..._args: [string]
): Promise<ActionResult> {
  await assertTeacher();
  void _args;
  return {
    error: "Only administrators can archive or restore classes.",
  };
}

export async function regenerateJoinCodeAction(
  classId: string,
): Promise<ActionResult & { code?: string }> {
  const profile = await assertTeacher();
  await assertOwnsClass(classId, profile.id);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("regenerate_class_join_code", {
    p_class_id: classId,
  });
  if (error) return { error: error.message };
  const code = typeof data === "string" ? data : String(data ?? "");
  revalidatePath(`/teacher/classes/${classId}`);
  revalidatePath(`/admin/classes/${classId}`);
  return { success: `New join code: ${code}`, code };
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

  const { data: classRow } = await admin
    .from("classes")
    .select("id, archived")
    .eq("id", classId)
    .maybeSingle();
  if (!classRow) return { error: "Class not found" };
  if (classRow.archived) {
    return { error: "Cannot add students to an archived class" };
  }

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
  } else {
    return { error: "Enter a student email" };
  }

  if (!student) return { error: "No account found with that email" };
  if (student.role !== "student") return { error: "That user is not a student" };
  if (!student.is_active) return { error: "That student account is inactive" };

  const { data: existing } = await admin
    .from("class_members")
    .select("id")
    .eq("class_id", classId)
    .eq("student_id", student.id)
    .maybeSingle();
  if (existing) {
    return { error: "That student is already enrolled in this class" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("class_members").insert({
    class_id: classId,
    student_id: student.id,
  });
  if (error) {
    if (error.code === "23505") {
      return { error: "That student is already enrolled in this class" };
    }
    return { error: error.message };
  }
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
  ..._args: [string, ActionResult, FormData]
): Promise<ActionResult> {
  await assertTeacher();
  void _args;
  return {
    error: "Only administrators can add teachers to a class.",
  };
}

export async function updateClassTeacherRoleAction(
  ..._args: [string, string, ClassTeacherRole]
): Promise<ActionResult> {
  await assertTeacher();
  void _args;
  return {
    error: "Only administrators can change class teacher roles.",
  };
}

export async function removeClassTeacherAction(
  ..._args: [string, string]
): Promise<ActionResult> {
  await assertTeacher();
  void _args;
  return {
    error: "Only administrators can remove teachers from a class.",
  };
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

    const deploymentIds = extractDeploymentIds(rpcResult);
    if (deploymentIds[0]) {
      redirect(`/teacher/assignments/${deploymentIds[0]}/builder`);
    }
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
    .select(
      "id, class_id, teacher_id, title, instructions, allow_text_submission, allow_file_submission, maximum_mark, template_id",
    )
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

  const { data: rpcResult, error: rpcError } = await supabase.rpc(
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

  const newTemplateId =
    rpcResult && typeof rpcResult === "object"
      ? (rpcResult as { template_id?: string }).template_id
      : null;

  // Copy structured homework blocks into the new template (new IDs)
  if (assignment.template_id && newTemplateId) {
    try {
      const { loadTemplateStructure, structureToPayload, cloneSection } =
        await import("@/lib/homework/structure");
      const sourceSections = await loadTemplateStructure(
        supabase,
        assignment.template_id,
      );
      const copied = sourceSections.map((s) => cloneSection(s, ""));
      const payload = structureToPayload(copied);
      await supabase.rpc("save_assignment_structure", {
        p_template_id: newTemplateId,
        p_structure: payload,
      });
    } catch {
      // Metadata copy already succeeded; structure copy is best-effort
    }
  }

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
