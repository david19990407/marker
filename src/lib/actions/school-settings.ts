"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/auth";

async function assertAdmin() {
  return requireProfile(["admin"]);
}

function revalidateBranding() {
  revalidatePath("/", "layout");
  revalidatePath("/login");
  revalidatePath("/forgot-password");
  revalidatePath("/update-password");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/dashboard");
  revalidatePath("/teacher/dashboard");
  revalidatePath("/student/dashboard");
  revalidatePath("/settings");
}

function duplicateMessage(error: { code?: string; message?: string }, entity: string) {
  if (error.code === "23505") {
    return `That ${entity} already exists. Choose a different name or code.`;
  }
  return error.message ?? `Failed to save ${entity}`;
}

function isHexColour(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

export async function getSchoolSettingsAction(): Promise<{
  data?: {
    id: string;
    school_name: string;
    platform_display_name: string;
    primary_colour: string;
    secondary_colour: string;
    accent_colour: string;
    max_upload_bytes: number;
  };
  error?: string;
}> {
  await assertAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("school_settings")
    .select(
      "id, school_name, platform_display_name, primary_colour, secondary_colour, accent_colour, max_upload_bytes",
    )
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
  const primaryColour = String(formData.get("primary_colour") ?? "").trim();
  const secondaryColour = String(formData.get("secondary_colour") ?? "").trim();
  const accentColour = String(formData.get("accent_colour") ?? "").trim();

  if (!schoolName) return { error: "School name is required" };
  if (!platformDisplayName) return { error: "Platform display name is required" };
  if (!isHexColour(primaryColour) || !isHexColour(secondaryColour) || !isHexColour(accentColour)) {
    return { error: "Theme colours must be valid hex values such as #7C3AED" };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("school_settings")
    .select("id")
    .limit(1)
    .maybeSingle();

  const payload = {
    school_name: schoolName,
    platform_display_name: platformDisplayName,
    primary_colour: primaryColour,
    secondary_colour: secondaryColour,
    accent_colour: accentColour,
    updated_by: profile.id,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await supabase
      .from("school_settings")
      .update(payload)
      .eq("id", existing.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("school_settings").insert(payload);
    if (error) return { error: error.message };
  }

  revalidateBranding();
  return { success: "Branding saved" };
}

// ── Year groups ────────────────────────────────────────────────────────────

export async function createYearGroupAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await assertAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim() || null;
  if (!name) return { error: "Year group name is required" };

  const supabase = await createClient();
  const { data: maxRow } = await supabase
    .from("school_year_groups")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = (maxRow?.sort_order ?? 0) + 1;

  const { error } = await supabase.from("school_year_groups").insert({
    label: name,
    name,
    code,
    sort_order: sortOrder,
    is_active: true,
  });
  if (error) return { error: duplicateMessage(error, "year group") };
  revalidatePath("/admin/settings");
  return { success: `Year group "${name}" added` };
}

export async function updateYearGroupAction(
  yearGroupId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await assertAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim() || null;
  if (!name) return { error: "Year group name is required" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("school_year_groups")
    .update({
      name,
      label: name,
      code,
      updated_at: new Date().toISOString(),
    })
    .eq("id", yearGroupId);
  if (error) return { error: duplicateMessage(error, "year group") };
  revalidatePath("/admin/settings");
  return { success: "Year group updated" };
}

export async function toggleYearGroupActiveAction(
  yearGroupId: string,
  isActive: boolean,
): Promise<ActionResult> {
  await assertAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("school_year_groups")
    .update({
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", yearGroupId);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  return { success: isActive ? "Year group activated" : "Year group deactivated" };
}

export async function archiveYearGroupAction(
  yearGroupId: string,
  archive: boolean,
): Promise<ActionResult> {
  await assertAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("school_year_groups")
    .update({
      archived_at: archive ? new Date().toISOString() : null,
      is_active: archive ? false : true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", yearGroupId);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  return { success: archive ? "Year group archived" : "Year group restored" };
}

export async function moveYearGroupAction(
  yearGroupId: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  await assertAdmin();
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("school_year_groups")
    .select("id, sort_order")
    .order("sort_order");
  if (!rows?.length) return { error: "No year groups found" };

  const index = rows.findIndex((r) => r.id === yearGroupId);
  if (index < 0) return { error: "Year group not found" };
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= rows.length) {
    return { error: "Already at the edge" };
  }

  const current = rows[index]!;
  const other = rows[swapIndex]!;
  const { error: e1 } = await supabase
    .from("school_year_groups")
    .update({ sort_order: other.sort_order })
    .eq("id", current.id);
  const { error: e2 } = await supabase
    .from("school_year_groups")
    .update({ sort_order: current.sort_order })
    .eq("id", other.id);
  if (e1 || e2) return { error: (e1 ?? e2)?.message ?? "Failed to reorder" };
  revalidatePath("/admin/settings");
  return { success: "Order updated" };
}

export async function deleteYearGroupAction(
  yearGroupId: string,
): Promise<ActionResult> {
  await assertAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_year_group", {
    p_year_group_id: yearGroupId,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  return { success: "Year group deleted" };
}

// ── Subjects ───────────────────────────────────────────────────────────────

export async function createSubjectAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await assertAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim() || null;
  const iconType = String(formData.get("icon_type") ?? "built_in").trim();
  const iconValue = String(formData.get("icon_value") ?? "book").trim() || "book";
  const colour = String(formData.get("colour") ?? "#7C3AED").trim() || "#7C3AED";
  if (!name) return { error: "Subject name is required" };

  const supabase = await createClient();
  const { data: maxRow } = await supabase
    .from("school_subjects")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("school_subjects").insert({
    name,
    code,
    icon_type: iconType === "upload" ? "upload" : "built_in",
    icon_value: iconValue,
    icon_key: iconType === "upload" ? "book" : iconValue,
    icon_storage_path: iconType === "upload" ? iconValue : null,
    colour,
    sort_order: (maxRow?.sort_order ?? 0) + 1,
    is_active: true,
  });
  if (error) return { error: duplicateMessage(error, "subject") };
  revalidatePath("/admin/settings");
  return { success: `Subject "${name}" added` };
}

export async function updateSubjectAction(
  subjectId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await assertAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim() || null;
  const iconType = String(formData.get("icon_type") ?? "built_in").trim();
  const iconValue = String(formData.get("icon_value") ?? "book").trim() || "book";
  const colour = String(formData.get("colour") ?? "#7C3AED").trim() || "#7C3AED";
  if (!name) return { error: "Subject name is required" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("school_subjects")
    .update({
      name,
      code,
      icon_type: iconType === "upload" ? "upload" : "built_in",
      icon_value: iconValue,
      icon_key: iconType === "upload" ? "book" : iconValue,
      icon_storage_path: iconType === "upload" ? iconValue : null,
      colour,
      updated_at: new Date().toISOString(),
    })
    .eq("id", subjectId);
  if (error) return { error: duplicateMessage(error, "subject") };
  revalidatePath("/admin/settings");
  return { success: "Subject updated" };
}

export async function toggleSubjectActiveAction(
  subjectId: string,
  isActive: boolean,
): Promise<ActionResult> {
  await assertAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("school_subjects")
    .update({
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", subjectId);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  return { success: isActive ? "Subject activated" : "Subject deactivated" };
}

export async function archiveSubjectAction(
  subjectId: string,
  archive: boolean,
): Promise<ActionResult> {
  await assertAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("school_subjects")
    .update({
      archived_at: archive ? new Date().toISOString() : null,
      is_active: archive ? false : true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", subjectId);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  return { success: archive ? "Subject archived" : "Subject restored" };
}

export async function moveSubjectAction(
  subjectId: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  await assertAdmin();
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("school_subjects")
    .select("id, sort_order")
    .order("sort_order");
  if (!rows?.length) return { error: "No subjects found" };

  const index = rows.findIndex((r) => r.id === subjectId);
  if (index < 0) return { error: "Subject not found" };
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= rows.length) {
    return { error: "Already at the edge" };
  }

  const current = rows[index]!;
  const other = rows[swapIndex]!;
  const { error: e1 } = await supabase
    .from("school_subjects")
    .update({ sort_order: other.sort_order })
    .eq("id", current.id);
  const { error: e2 } = await supabase
    .from("school_subjects")
    .update({ sort_order: current.sort_order })
    .eq("id", other.id);
  if (e1 || e2) return { error: (e1 ?? e2)?.message ?? "Failed to reorder" };
  revalidatePath("/admin/settings");
  return { success: "Order updated" };
}

export async function deleteSubjectAction(
  subjectId: string,
): Promise<ActionResult> {
  await assertAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_subject", {
    p_subject_id: subjectId,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  return { success: "Subject deleted" };
}

function sanitizeSvg(raw: string): string | null {
  const lower = raw.toLowerCase();
  if (
    lower.includes("<script") ||
    lower.includes("javascript:") ||
    lower.includes("onload=") ||
    lower.includes("onerror=") ||
    lower.includes("<foreignobject") ||
    lower.includes("xlink:href") ||
    lower.includes("data:text/html")
  ) {
    return null;
  }
  if (!lower.includes("<svg")) return null;
  return raw;
}

function pngDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) return null;
  if (buffer.toString("ascii", 1, 4) !== "PNG") return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

export async function uploadSubjectIconAction(
  formData: FormData,
): Promise<{ path?: string; publicUrl?: string; error?: string }> {
  await assertAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an SVG or PNG file" };
  }
  const type = file.type;
  if (!["image/png", "image/svg+xml"].includes(type)) {
    return { error: "Only SVG or PNG icons are allowed" };
  }
  if (file.size > 512_000) {
    return { error: "Icon must be 512KB or smaller" };
  }

  const supabase = await createClient();
  let uploadBody: Buffer;
  let contentType = type;
  let ext = "png";

  if (type === "image/svg+xml") {
    const raw = await file.text();
    const safe = sanitizeSvg(raw);
    if (!safe) {
      return {
        error:
          "SVG rejected. Remove scripts or event handlers and upload a simple icon SVG.",
      };
    }
    uploadBody = Buffer.from(safe, "utf8");
    ext = "svg";
    contentType = "image/svg+xml";
  } else {
    uploadBody = Buffer.from(await file.arrayBuffer());
    const dims = pngDimensions(uploadBody);
    if (!dims) return { error: "Invalid PNG file" };
    if (dims.width < 16 || dims.height < 16) {
      return { error: "PNG icons must be at least 16×16 pixels" };
    }
    if (dims.width > 2048 || dims.height > 2048) {
      return { error: "PNG icons must be 2048×2048 pixels or smaller" };
    }
    ext = "png";
  }

  const path = `icons/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("subject-icons")
    .upload(path, uploadBody, { contentType, upsert: false });
  if (error) return { error: error.message };

  const { data } = supabase.storage.from("subject-icons").getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

// ── Class colours ──────────────────────────────────────────────────────────

export async function createClassColourAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await assertAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const hex = String(formData.get("hex") ?? "").trim();
  if (!name) return { error: "Colour name is required" };
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    return { error: "Enter a valid hex colour such as #7C3AED" };
  }

  const supabase = await createClient();
  const { data: maxRow } = await supabase
    .from("school_class_colours")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("school_class_colours").insert({
    name,
    hex,
    sort_order: (maxRow?.sort_order ?? 0) + 1,
    is_active: true,
  });
  if (error) return { error: duplicateMessage(error, "colour") };
  revalidatePath("/admin/settings");
  return { success: `Colour "${name}" added` };
}

export async function toggleClassColourActiveAction(
  colourId: string,
  isActive: boolean,
): Promise<ActionResult> {
  await assertAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("school_class_colours")
    .update({ is_active: isActive })
    .eq("id", colourId);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  return { success: "Colour updated" };
}

export async function moveClassColourAction(
  colourId: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  await assertAdmin();
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("school_class_colours")
    .select("id, sort_order")
    .order("sort_order");
  if (!rows?.length) return { error: "No colours found" };

  const index = rows.findIndex((r) => r.id === colourId);
  if (index < 0) return { error: "Colour not found" };
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= rows.length) {
    return { error: "Already at the edge" };
  }

  const current = rows[index]!;
  const other = rows[swapIndex]!;
  const { error: e1 } = await supabase
    .from("school_class_colours")
    .update({ sort_order: other.sort_order })
    .eq("id", current.id);
  const { error: e2 } = await supabase
    .from("school_class_colours")
    .update({ sort_order: current.sort_order })
    .eq("id", other.id);
  if (e1 || e2) return { error: (e1 ?? e2)?.message ?? "Failed to reorder" };
  revalidatePath("/admin/settings");
  return { success: "Order updated" };
}

// Legacy aliases used by older settings page snippets
export async function addSubjectAction(
  prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return createSubjectAction(prev, formData);
}
