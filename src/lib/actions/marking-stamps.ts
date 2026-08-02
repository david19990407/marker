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

function mapStamp(row: Record<string, unknown>, usageCount = 0): MarkingStamp {
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
    default_width_px: Number(row.default_width_px ?? 64),
    default_height_px: Number(row.default_height_px ?? 64),
    subject_restriction: (row.subject_restriction as string | null) ?? null,
    teacher_restriction_ids: Array.isArray(row.teacher_restriction_ids)
      ? (row.teacher_restriction_ids as string[])
      : [],
    assignment_restriction_ids: Array.isArray(row.assignment_restriction_ids)
      ? (row.assignment_restriction_ids as string[])
      : [],
    is_active: Boolean(row.is_active),
    is_palette_visible:
      row.is_palette_visible === undefined || row.is_palette_visible === null
        ? true
        : Boolean(row.is_palette_visible),
    is_internal: Boolean(row.is_internal),
    sort_order: Number(row.sort_order ?? 0),
    archived_at: (row.archived_at as string | null) ?? null,
    archived_by: (row.archived_by as string | null) ?? null,
    asset_version: Number(row.asset_version ?? 1),
    current_asset_id: (row.current_asset_id as string | null) ?? null,
    default_opacity:
      row.default_opacity == null ? 1 : Number(row.default_opacity),
    usage_count: usageCount,
    created_at: (row.created_at as string | null) ?? null,
    updated_at: (row.updated_at as string | null) ?? null,
  };
}

function slugKey(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 60) || `stamp_${Date.now()}`
  );
}

function revalidateStampPaths() {
  revalidatePath("/admin/settings/marking-stamps");
  revalidatePath("/admin/marking-stamps");
  revalidatePath("/teacher/marking");
}

async function countStampUsage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  stampId: string,
): Promise<number> {
  const { count } = await supabase
    .from("submission_annotations")
    .select("id", { count: "exact", head: true })
    .eq("stamp_id", stampId)
    .eq("is_deleted", false);
  return count ?? 0;
}

async function countStampReferences(
  supabase: Awaited<ReturnType<typeof createClient>>,
  stampId: string,
): Promise<{ annotations: number; assignments: number }> {
  const [{ count: annotations }, { count: assignments }] = await Promise.all([
    supabase
      .from("submission_annotations")
      .select("id", { count: "exact", head: true })
      .eq("stamp_id", stampId),
    supabase
      .from("assignment_stamp_selections")
      .select("id", { count: "exact", head: true })
      .eq("stamp_id", stampId),
  ]);
  return {
    annotations: annotations ?? 0,
    assignments: assignments ?? 0,
  };
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
  const stamps = (
    await Promise.all(
      (data ?? []).map(async (row) => {
        const usage = await countStampUsage(
          supabase,
          String((row as { id: string }).id),
        );
        return mapStamp(row as Record<string, unknown>, usage);
      }),
    )
  ).filter((stamp) => !stamp.is_internal);
  return { stamps };
}

export async function uploadMarkingStampAction(
  _prev: ActionResult,
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
  const defaultWidth = Number(formData.get("default_width_px") ?? 64);
  const defaultHeight = Number(formData.get("default_height_px") ?? 64);
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
      default_width_px: Number.isFinite(defaultWidth) ? defaultWidth : 64,
      default_height_px: Number.isFinite(defaultHeight) ? defaultHeight : 64,
      subject_restriction: subjectRestriction,
      is_active: true,
      is_palette_visible: true,
      sort_order: Number(formData.get("sort_order") ?? 100),
      created_by: profile.id,
      updated_by: profile.id,
      asset_version: 1,
    })
    .select("*")
    .single();
  if (error) return { error: error.message };

  const stampId = String((data as { id: string }).id);
  const { data: asset } = await supabase
    .from("annotation_stamp_assets")
    .insert({
      stamp_id: stampId,
      storage_path: storagePath,
      mime_type: file.type,
      width: Number.isFinite(defaultWidth) ? defaultWidth : 64,
      height: Number.isFinite(defaultHeight) ? defaultHeight : 64,
      version: 1,
      created_by: profile.id,
      is_current: true,
    })
    .select("id")
    .maybeSingle();

  if (asset?.id) {
    await supabase
      .from("school_marking_symbols")
      .update({ current_asset_id: asset.id })
      .eq("id", stampId);
  }

  revalidateStampPaths();
  return {
    success: "Stamp uploaded",
    stamp: mapStamp(data as Record<string, unknown>),
  };
}

export async function updateMarkingStampAction(
  stampId: string,
  patch: {
    name?: string;
    accessible_label?: string;
    category?: string;
    default_size_pct?: number;
    default_width_px?: number;
    default_height_px?: number;
    default_opacity?: number;
    subject_restriction?: string | null;
    teacher_restriction_ids?: string[];
    assignment_restriction_ids?: string[];
    sort_order?: number;
    is_active?: boolean;
    is_palette_visible?: boolean;
    archived_at?: string | null;
  },
): Promise<ActionResult & { stamp?: MarkingStamp }> {
  const profile = await assertAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("school_marking_symbols")
    .update({
      ...patch,
      updated_by: profile.id,
    })
    .eq("id", stampId)
    .select("*")
    .single();
  if (error) return { error: error.message };
  revalidateStampPaths();
  const usage = await countStampUsage(supabase, stampId);
  return {
    success: "Stamp updated",
    stamp: mapStamp(data as Record<string, unknown>, usage),
  };
}

export async function replaceMarkingStampImageAction(
  stampId: string,
  formData: FormData,
): Promise<ActionResult & { stamp?: MarkingStamp }> {
  const profile = await assertAdmin();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "Upload a PNG, SVG or WebP stamp image" };
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return { error: "Stamp must be PNG, SVG or WebP" };
  }
  if (file.size > MAX_STAMP_BYTES) {
    return { error: "Stamp file must be 2MB or smaller" };
  }

  const width = Number(formData.get("default_width_px") ?? 64);
  const height = Number(formData.get("default_height_px") ?? 64);
  const supabase = await createClient();
  const { data: current, error: loadError } = await supabase
    .from("school_marking_symbols")
    .select("*")
    .eq("id", stampId)
    .maybeSingle();
  if (loadError || !current) {
    return { error: loadError?.message ?? "Stamp not found" };
  }

  const nextVersion = Number(current.asset_version ?? 1) + 1;
  const storagePath = `${profile.id}/${slugKey(String(current.name))}_v${nextVersion}_${Date.now()}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from("marking-stamps")
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) return { error: uploadError.message };

  await supabase
    .from("annotation_stamp_assets")
    .update({ is_current: false })
    .eq("stamp_id", stampId)
    .eq("is_current", true);

  const { data: asset, error: assetError } = await supabase
    .from("annotation_stamp_assets")
    .insert({
      stamp_id: stampId,
      storage_path: storagePath,
      mime_type: file.type,
      width: Number.isFinite(width) ? width : 64,
      height: Number.isFinite(height) ? height : 64,
      version: nextVersion,
      created_by: profile.id,
      is_current: true,
    })
    .select("id")
    .single();
  if (assetError) {
    // Table may be unavailable before migration — still update live path.
    const { data, error } = await supabase
      .from("school_marking_symbols")
      .update({
        storage_path: storagePath,
        mime_type: file.type,
        default_width_px: Number.isFinite(width) ? width : 64,
        default_height_px: Number.isFinite(height) ? height : 64,
        asset_version: nextVersion,
        updated_by: profile.id,
      })
      .eq("id", stampId)
      .select("*")
      .single();
    if (error) return { error: error.message };
    revalidateStampPaths();
    return {
      success: "Stamp image replaced",
      stamp: mapStamp(data as Record<string, unknown>),
    };
  }

  const { data, error } = await supabase
    .from("school_marking_symbols")
    .update({
      storage_path: storagePath,
      mime_type: file.type,
      default_width_px: Number.isFinite(width) ? width : 64,
      default_height_px: Number.isFinite(height) ? height : 64,
      asset_version: nextVersion,
      current_asset_id: asset.id,
      updated_by: profile.id,
    })
    .eq("id", stampId)
    .select("*")
    .single();
  if (error) return { error: error.message };

  revalidateStampPaths();
  const usage = await countStampUsage(supabase, stampId);
  return {
    success: "Stamp image replaced. Historical annotations keep the previous image.",
    stamp: mapStamp(data as Record<string, unknown>, usage),
  };
}

export async function hideMarkingStampFromPaletteAction(
  stampId: string,
): Promise<ActionResult & { stamp?: MarkingStamp }> {
  return updateMarkingStampAction(stampId, {
    is_palette_visible: false,
    is_active: true,
  });
}

export async function restoreMarkingStampToPaletteAction(
  stampId: string,
): Promise<ActionResult & { stamp?: MarkingStamp }> {
  return updateMarkingStampAction(stampId, {
    is_palette_visible: true,
    is_active: true,
    archived_at: null,
  });
}

export async function archiveMarkingStampAction(
  stampId: string,
): Promise<ActionResult & { stamp?: MarkingStamp }> {
  const profile = await assertAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("school_marking_symbols")
    .update({
      is_active: false,
      is_palette_visible: false,
      archived_at: new Date().toISOString(),
      archived_by: profile.id,
      updated_by: profile.id,
    })
    .eq("id", stampId)
    .select("*")
    .single();
  if (error) return { error: error.message };
  revalidateStampPaths();
  const usage = await countStampUsage(supabase, stampId);
  return {
    success: "Stamp archived. Historical annotations keep the image.",
    stamp: mapStamp(data as Record<string, unknown>, usage),
  };
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
    .eq("is_internal", false)
    .order("sort_order", { ascending: true });
  if (error) {
    if (/is_internal|does not exist|schema cache/i.test(error.message)) {
      const fallback = await supabase
        .from("school_marking_symbols")
        .select("id, sort_order")
        .order("sort_order", { ascending: true });
      if (fallback.error) return { error: fallback.error.message };
      return swapOrder(supabase, fallback.data ?? [], stampId, direction);
    }
    return { error: error.message };
  }
  return swapOrder(supabase, data ?? [], stampId, direction);
}

async function swapOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: Array<{ id: string; sort_order: number }>,
  stampId: string,
  direction: "up" | "down",
): Promise<ActionResult> {
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
  revalidateStampPaths();
  return { success: "Order updated" };
}

export async function deleteUnusedMarkingStampAction(
  stampId: string,
): Promise<
  ActionResult & {
    blocked?: boolean;
    references?: { annotations: number; assignments: number };
  }
> {
  await assertAdmin();
  const supabase = await createClient();
  const references = await countStampReferences(supabase, stampId);
  if (references.annotations > 0 || references.assignments > 0) {
    return {
      error:
        "This stamp has been used on existing work. You can remove it from the annotation palette while preserving the copies already placed on student scripts.",
      blocked: true,
      references,
    };
  }

  const { data: assets } = await supabase
    .from("annotation_stamp_assets")
    .select("storage_path")
    .eq("stamp_id", stampId);
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

  const paths = [
    ...new Set(
      [
        ...(assets ?? []).map((a) => a.storage_path),
        stamp?.storage_path,
      ].filter((p): p is string => Boolean(p)),
    ),
  ];
  if (paths.length) {
    await supabase.storage.from("marking-stamps").remove(paths);
  }
  revalidateStampPaths();
  return { success: "Stamp deleted permanently" };
}
