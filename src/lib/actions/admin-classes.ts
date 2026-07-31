"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClassSchema } from "@/lib/validations/admin";
import type { ActionResult } from "@/lib/actions/auth";
import type { ClassTeacherRole } from "@/lib/types";

async function assertAdmin() {
  return requireProfile(["admin"]);
}

function revalidateClass(classId: string) {
  revalidatePath(`/admin/classes/${classId}`);
  revalidatePath("/admin/classes");
  revalidatePath(`/teacher/classes/${classId}`);
  revalidatePath("/teacher/classes");
}

export async function adminAssignStudentAction(
  classId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await assertAdmin();
  const studentId = String(formData.get("student_id") || "");
  const email = String(formData.get("email") || "").trim().toLowerCase();

  const admin = createAdminClient();
  const { data: classRow } = await admin
    .from("classes")
    .select("id, archived")
    .eq("id", classId)
    .maybeSingle();
  if (!classRow) return { error: "Class not found" };
  if (classRow.archived) return { error: "Cannot add students to an archived class" };

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
      .eq("email", email)
      .maybeSingle();
    student = data;
  } else {
    return { error: "Select a student or enter an email" };
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
  if (existing) return { error: "That student is already enrolled in this class" };

  const { error } = await admin.from("class_members").insert({
    class_id: classId,
    student_id: student.id,
  });
  if (error) {
    if (error.code === "23505") {
      return { error: "That student is already enrolled in this class" };
    }
    return { error: error.message };
  }
  revalidateClass(classId);
  return { success: `${student.display_name} added to the class` };
}

export async function adminRemoveStudentAction(
  classId: string,
  studentId: string,
): Promise<ActionResult> {
  await assertAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("class_members")
    .delete()
    .eq("class_id", classId)
    .eq("student_id", studentId);
  if (error) return { error: error.message };
  revalidateClass(classId);
  return { success: "Student removed" };
}

export async function adminUpdateClassAction(
  classId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await assertAdmin();
  const parsed = createClassSchema.safeParse({
    name: formData.get("name"),
    subject: formData.get("subject") || "English",
    year_group: formData.get("year_group") || null,
    teacher_id: formData.get("teacher_id") || formData.get("lead_teacher_id"),
    colour_hex: formData.get("colour_hex") || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid class" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_class", {
    p_class_id: classId,
    p_name: parsed.data.name,
    p_subject: parsed.data.subject,
    p_year_group: parsed.data.year_group,
    p_colour_hex: parsed.data.colour_hex,
    p_lead_teacher_id: parsed.data.teacher_id,
  });
  if (error) return { error: error.message };
  revalidateClass(classId);
  return { success: "Class updated" };
}

export async function adminArchiveClassAction(
  classId: string,
): Promise<ActionResult> {
  await assertAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_class_archived", {
    p_class_id: classId,
    p_archived: true,
  });
  if (error) return { error: error.message };
  revalidateClass(classId);
  return { success: "Class archived" };
}

export async function adminRestoreClassAction(
  classId: string,
): Promise<ActionResult> {
  await assertAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_class_archived", {
    p_class_id: classId,
    p_archived: false,
  });
  if (error) return { error: error.message };
  revalidateClass(classId);
  return { success: "Class restored" };
}

export async function adminRegenerateJoinCodeAction(
  classId: string,
): Promise<ActionResult & { code?: string }> {
  await assertAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("regenerate_class_join_code", {
    p_class_id: classId,
  });
  if (error) return { error: error.message };
  const code = typeof data === "string" ? data : String(data ?? "");
  revalidateClass(classId);
  return { success: `New join code: ${code}`, code };
}

export async function adminAddClassTeacherAction(
  classId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await assertAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "teacher") as ClassTeacherRole;
  if (!email) return { error: "Enter a teacher email" };

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
  const { error } = await supabase.rpc("admin_upsert_class_teacher", {
    p_class_id: classId,
    p_teacher_id: teacher.id,
    p_membership_role: role,
  });
  if (error) return { error: error.message };
  revalidateClass(classId);
  return {
    success: `${teacher.display_name} added as ${role.replace(/_/g, " ")}`,
  };
}

export async function adminPromoteLeadTeacherAction(
  classId: string,
  teacherId: string,
): Promise<ActionResult> {
  await assertAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_upsert_class_teacher", {
    p_class_id: classId,
    p_teacher_id: teacherId,
    p_membership_role: "lead_teacher",
  });
  if (error) return { error: error.message };
  revalidateClass(classId);
  return { success: "Lead teacher updated" };
}

export async function adminDemoteClassTeacherAction(
  classId: string,
  teacherId: string,
): Promise<ActionResult> {
  await assertAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_upsert_class_teacher", {
    p_class_id: classId,
    p_teacher_id: teacherId,
    p_membership_role: "teacher",
  });
  if (error) return { error: error.message };
  revalidateClass(classId);
  return { success: "Teacher demoted from lead" };
}

export async function adminRemoveClassTeacherAction(
  classId: string,
  teacherId: string,
): Promise<ActionResult> {
  await assertAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_remove_class_teacher", {
    p_class_id: classId,
    p_teacher_id: teacherId,
  });
  if (error) return { error: error.message };
  revalidateClass(classId);
  return { success: "Teacher removed from class" };
}
