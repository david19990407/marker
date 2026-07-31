"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/get-profile";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/actions/auth";

export async function adminAssignStudentAction(
  classId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireProfile(["admin"]);
  const studentId = String(formData.get("student_id") || "");
  if (!studentId) return { error: "Select a student" };

  const admin = createAdminClient();
  const { error } = await admin.from("class_members").upsert(
    { class_id: classId, student_id: studentId },
    { onConflict: "class_id,student_id" },
  );
  if (error) return { error: error.message };
  revalidatePath(`/admin/classes/${classId}`);
  revalidatePath("/admin/classes");
  return { success: "Student assigned" };
}

export async function adminRemoveStudentAction(
  classId: string,
  studentId: string,
): Promise<ActionResult> {
  await requireProfile(["admin"]);
  const admin = createAdminClient();
  const { error } = await admin
    .from("class_members")
    .delete()
    .eq("class_id", classId)
    .eq("student_id", studentId);
  if (error) return { error: error.message };
  revalidatePath(`/admin/classes/${classId}`);
  revalidatePath("/admin/classes");
  return { success: "Student removed" };
}

export async function adminArchiveClassAction(
  classId: string,
): Promise<ActionResult> {
  await requireProfile(["admin"]);
  const admin = createAdminClient();
  const { error } = await admin
    .from("classes")
    .update({ archived: true })
    .eq("id", classId);
  if (error) return { error: error.message };
  revalidatePath("/admin/classes");
  return { success: "Class archived" };
}
