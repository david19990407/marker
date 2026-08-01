"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/auth";
import type { MarkingStamp } from "@/lib/marking/annotation-types";

const MAX_STAMP_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/png", "image/svg+xml", "image/webp"]);

async function assertAdmin() {
  return requireProfile(["admin"]);
}

function mapStamp(row: Record<string, unknown>): MarkingStamp {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    symbol_key: String(row.symbol_key ?? ""),
    description: (row.description as string | null) ?? null,
    category: String(row.category ?? "general"),
    accessible_label: String(row.accessible_label ?? row.name ?? "Stamp"),
    storage_path: (row.storage_path as string | null) ?? null,
    mime_type: (row.mime_type as string | null) ?? null,
    default_size_pct: Number(row.default_size_pct ?? 8),
    subject_restriction: (row.subject_restriction as string | null) ?? null,
    teacher_restriction_ids: Array.isArray(row.teacher_restriction_ids)
      ? (row.teacher_restriction_ids as string[])
      : [],
    assignment_restriction_ids: Array.isArray(row.assignment_restriction_ids)
      ? (row.assignment_restriction_ids as string[])
      : [],
    is_active: Boolean(row.is_active),
    sort_order: Number(row.sort_order ?? 0),
    archived_at: (row.archived_at as string | null) ?? null,
  };
}

function slugKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60) || `stamp_${Date.now()}`;
}

export async function listAllStampsAction(): Promise<
  ActionResult & { stamps?: MarkingStamp[] }
> {
  await assertAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("school_marking_symbols")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) return { error: error.message };
  return {
    stamps: (data ?? []).map((row) => mapStamp(row as Record<string, unknown>)),
  };
}

export async function uploadMarkingStampAction(
  formData: FormData,
): Promise<ActionResult & { stamp?: MarkingStamp }> {
  const profile = await assertAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const accessibleLabel = String(
    formData.get("accessible_label") ?? name,
  ).trim();
  const category = String(formData.get("category") ?? "general").trim();
  const subjectRestriction =
    String(formData.get("subject_restriction") ?? "").trim() || null;
  const defaultSize = Number(formData.get("default_size_pct") ?? 8);
  const file = formData.get("file");

  if (!name || !accessibleLabel) {
    return { error: "Name and accessible label are required" };
  }
  if (!(file instanceof File)) {
    return { error: "Upload a PNG, SVG or WebP stamp image" };
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return { error: "Stamp must be PNG, SVG or WebP" };
  }
  if (file.size > MAX_STAMP_BYTES) {
    return { error: "Stamp file must be 2MB or smaller" };
  }

  const supabase = await createClient();
  const key = `${slugKey(name)}_${Date.now()}`;
  const storagePath = `${profile.id}/${key}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from("marking-stamps")
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) return { error: uploadError.message };

  const { data, error } = await supabase
    .from("school_marking_symbols")
    .insert({
      name,
      symbol_key: key,
      description: String(formData.get("description") ?? "") || null,
      category,
      accessible_label: accessibleLabel,
      storage_path: storagePath,
      mime_type: file.type,
      default_size_pct: Number.isFinite(defaultSize) ? defaultSize : 8,
      subject_restriction: subjectRestriction,
      is_active: true,
      sort_order: Number(formData.get("sort_order") ?? 100),
      created_by: profile.id,
    })
    .select("*")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/admin/marking-stamps");
  return {
    success: "Stamp uploaded",
    stamp: mapStamp(data as Record<string, unknown>),
  };
}

export async function archiveMarkingStampAction(
  stampId: string,
): Promise<ActionResult> {
  await assertAdmin();
  const supabase = await createClient();

  // Keep asset while annotations reference it.
  const { count } = await supabase
    .from("submission_annotations")
    .select("id", { count: "exact", head: true })
    .eq("stamp_id", stampId)
    .eq("is_deleted", false);

  const { error } = await supabase
    .from("school_marking_symbols")
    .update({
      is_active: false,
      archived_at: new Date().toISOString(),
    })
    .eq("id", stampId);
  if (error) return { error: error.message };

  revalidatePath("/admin/marking-stamps");
  return {
    success:
      (count ?? 0) > 0
        ? "Stamp archived. Historical annotations keep the image."
        : "Stamp archived",
  };
}

export async function updateMarkingStampAction(
  stampId: string,
  patch: {
    name?: string;
    accessible_label?: string;
    category?: string;
    default_size_pct?: number;
    subject_restriction?: string | null;
    is_active?: boolean;
    archived_at?: string | null;
  },
): Promise<ActionResult> {
  await assertAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("school_marking_symbols")
    .update(patch)
    .eq("id", stampId);
  if (error) return { error: error.message };
  revalidatePath("/admin/marking-stamps");
  return { success: "Stamp updated" };
}

export async function reorderMarkingStampAction(
  stampId: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  await assertAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("school_marking_symbols")
    .select("id, sort_order")
    .order("sort_order", { ascending: true });
  if (error) return { error: error.message };
  const rows = data ?? [];
  const index = rows.findIndex((row) => row.id === stampId);
  if (index < 0) return { error: "Stamp not found" };
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= rows.length) {
    return { success: "Already at edge" };
  }
  const current = rows[index]!;
  const other = rows[swapIndex]!;
  const { error: e1 } = await supabase
    .from("school_marking_symbols")
    .update({ sort_order: other.sort_order })
    .eq("id", current.id);
  if (e1) return { error: e1.message };
  const { error: e2 } = await supabase
    .from("school_marking_symbols")
    .update({ sort_order: current.sort_order })
    .eq("id", other.id);
  if (e2) return { error: e2.message };
  revalidatePath("/admin/marking-stamps");
  return { success: "Order updated" };
}

export async function deleteUnusedMarkingStampAction(
  stampId: string,
): Promise<ActionResult> {
  await assertAdmin();
  const supabase = await createClient();
  const { count } = await supabase
    .from("submission_annotations")
    .select("id", { count: "exact", head: true })
    .eq("stamp_id", stampId);
  if ((count ?? 0) > 0) {
    return {
      error:
        "This stamp is still referenced by annotations. Archive it instead so historical work keeps the image.",
    };
  }
  const { data: stamp } = await supabase
    .from("school_marking_symbols")
    .select("storage_path")
    .eq("id", stampId)
    .maybeSingle();
  const { error } = await supabase
    .from("school_marking_symbols")
    .delete()
    .eq("id", stampId);
  if (error) return { error: error.message };
  if (stamp?.storage_path) {
    await supabase.storage.from("marking-stamps").remove([stamp.storage_path]);
  }
  revalidatePath("/admin/marking-stamps");
  return { success: "Stamp deleted" };
}
