"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/auth";

async function assertAdmin() {
  return requireProfile(["admin"]);
}

export async function getSchoolSettingsAction(): Promise<{
  data?: {
    id: string;
    school_name: string;
    platform_display_name: string;
    max_upload_bytes: number;
  };
  error?: string;
}> {
  await assertAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("school_settings")
    .select("id, school_name, platform_display_name, max_upload_bytes")
    .limit(1)
    .maybeSingle();
  if (error) return { error: error.message };
  return { data: data ?? undefined };
}

export async function updateSchoolSettingsAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const profile = await assertAdmin();
  const schoolName = String(formData.get("school_name") ?? "").trim();
  const platformDisplayName = String(
    formData.get("platform_display_name") ?? "",
  ).trim();

  if (!schoolName) return { error: "School name is required" };
  if (!platformDisplayName) return { error: "Platform display name is required" };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("school_settings")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("school_settings")
      .update({
        school_name: schoolName,
        platform_display_name: platformDisplayName,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("school_settings").insert({
      school_name: schoolName,
      platform_display_name: platformDisplayName,
      updated_by: profile.id,
    });
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/settings");
  return { success: "Settings updated" };
}

export async function toggleYearGroupActiveAction(
  yearGroupId: string,
  isActive: boolean,
): Promise<ActionResult> {
  await assertAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("school_year_groups")
    .update({ is_active: isActive })
    .eq("id", yearGroupId);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  return { success: "Year group updated" };
}

export async function toggleSubjectActiveAction(
  subjectId: string,
  isActive: boolean,
): Promise<ActionResult> {
  await assertAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("school_subjects")
    .update({ is_active: isActive })
    .eq("id", subjectId);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  return { success: "Subject updated" };
}

export async function addSubjectAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await assertAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Subject name is required" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("school_subjects")
    .insert({ name, icon_key: "book" });
  if (error) {
    if (error.code === "23505") return { error: "That subject already exists" };
    return { error: error.message };
  }
  revalidatePath("/admin/settings");
  return { success: `Subject "${name}" added` };
}
