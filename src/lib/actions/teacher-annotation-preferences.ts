"use server";

import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/auth";
import type { TeacherStampPreference } from "@/lib/marking/teacher-stamp-order";

export async function loadTeacherStampPreferencesAction(): Promise<
  ActionResult & { preferences?: TeacherStampPreference[] }
> {
  const profile = await requireProfile(["teacher", "admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teacher_annotation_preferences")
    .select("stamp_id, display_order, is_pinned")
    .eq("teacher_id", profile.id)
    .order("display_order", { ascending: true });
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      return { preferences: [] };
    }
    return { error: error.message };
  }
  return {
    preferences: (data ?? []).map((row) => ({
      stamp_id: String(row.stamp_id),
      display_order: Number(row.display_order ?? 0),
      is_pinned: Boolean(row.is_pinned),
    })),
  };
}

export async function saveTeacherStampPreferencesAction(
  preferences: TeacherStampPreference[],
): Promise<ActionResult> {
  const profile = await requireProfile(["teacher", "admin"]);
  const supabase = await createClient();

  const { error: clearError } = await supabase
    .from("teacher_annotation_preferences")
    .delete()
    .eq("teacher_id", profile.id);
  if (clearError && !/does not exist|schema cache/i.test(clearError.message)) {
    console.error("[teacher-stamp-prefs] clear failed", clearError);
    return { error: "Could not save stamp order." };
  }

  if (!preferences.length) {
    return { success: "Stamp order reset to administrator defaults" };
  }

  const rows = preferences.map((pref, index) => ({
    teacher_id: profile.id,
    stamp_id: pref.stamp_id,
    display_order: Number.isFinite(pref.display_order)
      ? pref.display_order
      : index,
    is_pinned: Boolean(pref.is_pinned),
  }));

  const { error } = await supabase
    .from("teacher_annotation_preferences")
    .upsert(rows, { onConflict: "teacher_id,stamp_id" });
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      return {
        error:
          "Teacher stamp preferences are not available yet. Run fix_phase_08_annotation_toolbar_and_comment_interactions.sql.",
      };
    }
    console.error("[teacher-stamp-prefs] upsert failed", error);
    return { error: "Could not save stamp order." };
  }
  return { success: "Stamp order saved" };
}

export async function resetTeacherStampPreferencesAction(): Promise<ActionResult> {
  return saveTeacherStampPreferencesAction([]);
}
