"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/auth";
import type { CommentBankGroup } from "@/lib/feedback/types";

function mapGroup(row: Record<string, unknown>): CommentBankGroup {
  return {
    id: String(row.id),
    bank_id: String(row.bank_id),
    name: String(row.name ?? ""),
    short_code: (row.short_code as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    sort_order: Number(row.sort_order ?? 0),
    linked_question_id: (row.linked_question_id as string | null) ?? null,
    mark_range_min:
      row.mark_range_min == null ? null : Number(row.mark_range_min),
    mark_range_max:
      row.mark_range_max == null ? null : Number(row.mark_range_max),
    category: String(row.category ?? ""),
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    is_active: Boolean(row.is_active),
  };
}

export async function listCommentBankGroupsAction(
  bankId?: string,
): Promise<ActionResult & { groups?: CommentBankGroup[] }> {
  await requireProfile(["teacher", "admin"]);
  const supabase = await createClient();
  let query = supabase
    .from("comment_bank_groups")
    .select("*")
    .order("sort_order", { ascending: true });
  if (bankId) query = query.eq("bank_id", bankId);
  const { data, error } = await query;
  if (error) {
    if (/does not exist/i.test(error.message)) return { groups: [] };
    return { error: error.message };
  }
  return {
    groups: (data ?? []).map((row) => mapGroup(row as Record<string, unknown>)),
  };
}

export async function saveCommentBankGroupAction(input: {
  id?: string;
  bank_id: string;
  name: string;
  short_code?: string | null;
  description?: string | null;
  sort_order?: number;
  linked_question_id?: string | null;
  mark_range_min?: number | null;
  mark_range_max?: number | null;
  category?: string;
  is_active?: boolean;
}): Promise<ActionResult & { group?: CommentBankGroup }> {
  await requireProfile(["admin", "teacher"]);
  const supabase = await createClient();
  const payload = {
    bank_id: input.bank_id,
    name: input.name.trim(),
    short_code: input.short_code?.trim() || null,
    description: input.description?.trim() || null,
    sort_order: input.sort_order ?? 0,
    linked_question_id: input.linked_question_id || null,
    mark_range_min: input.mark_range_min ?? null,
    mark_range_max: input.mark_range_max ?? null,
    category: input.category ?? "",
    is_active: input.is_active ?? true,
  };
  if (!payload.name) return { error: "Group name is required" };

  if (input.id) {
    const { data, error } = await supabase
      .from("comment_bank_groups")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .single();
    if (error) return { error: error.message };
    revalidatePath("/admin/settings/comment-banks");
    return { success: "Group updated", group: mapGroup(data) };
  }

  const { data, error } = await supabase
    .from("comment_bank_groups")
    .insert(payload)
    .select("*")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/admin/settings/comment-banks");
  return { success: "Group created", group: mapGroup(data) };
}

export async function importCommentBankToAssignmentAction(input: {
  templateId: string;
  sourceBankId: string;
  mode: "link" | "copy";
}): Promise<ActionResult> {
  const profile = await requireProfile(["teacher", "admin"]);
  const supabase = await createClient();

  if (input.mode === "link") {
    const { error } = await supabase.from("assignment_comment_bank_imports").upsert(
      {
        template_id: input.templateId,
        source_bank_id: input.sourceBankId,
        import_mode: "link",
        is_active: true,
        created_by: profile.id,
      },
      { onConflict: "template_id,source_bank_id,import_mode" },
    );
    if (error) {
      if (/does not exist/i.test(error.message)) {
        return {
          error:
            "Run fix_phase_08_marking_workspace_usability.sql to enable bank imports.",
        };
      }
      return { error: error.message };
    }
    revalidatePath(`/teacher/assignments`);
    return {
      success:
        "Linked bank added. Future administrator updates to the source bank remain available.",
    };
  }

  // Copy mode: duplicate bank + groups + items as assignment-scoped bank.
  const { data: source, error: sourceError } = await supabase
    .from("comment_banks")
    .select("*")
    .eq("id", input.sourceBankId)
    .maybeSingle();
  if (sourceError || !source) {
    return { error: sourceError?.message ?? "Source bank not found" };
  }

  const { data: copiedBank, error: copyError } = await supabase
    .from("comment_banks")
    .insert({
      scope: "assignment",
      name: `${source.name} (assignment copy)`,
      description: source.description,
      subject: source.subject,
      department_name: source.department_name,
      template_id: input.templateId,
      is_active: true,
      sort_order: source.sort_order ?? 0,
      owner_id: profile.id,
    })
    .select("*")
    .single();
  if (copyError || !copiedBank) {
    return { error: copyError?.message ?? "Unable to copy bank" };
  }

  const { data: groups } = await supabase
    .from("comment_bank_groups")
    .select("*")
    .eq("bank_id", input.sourceBankId)
    .order("sort_order", { ascending: true });

  const groupIdMap = new Map<string, string>();
  for (const group of groups ?? []) {
    const { data: newGroup } = await supabase
      .from("comment_bank_groups")
      .insert({
        bank_id: copiedBank.id,
        name: group.name,
        short_code: group.short_code,
        description: group.description,
        sort_order: group.sort_order,
        linked_question_id: group.linked_question_id,
        mark_range_min: group.mark_range_min,
        mark_range_max: group.mark_range_max,
        category: group.category,
        tags: group.tags,
        is_active: group.is_active,
      })
      .select("id")
      .single();
    if (newGroup) groupIdMap.set(String(group.id), String(newGroup.id));
  }

  const { data: items } = await supabase
    .from("comment_bank_items")
    .select("*")
    .eq("bank_id", input.sourceBankId)
    .order("sort_order", { ascending: true });

  if (items?.length) {
    await supabase.from("comment_bank_items").insert(
      items.map((item) => ({
        bank_id: copiedBank.id,
        group_id: item.group_id
          ? groupIdMap.get(String(item.group_id)) ?? null
          : null,
        title: item.title,
        short_label: item.short_label,
        full_text: item.full_text,
        category: item.category,
        tags: item.tags,
        year_group: item.year_group,
        subject: item.subject,
        tone: item.tone,
        mark_range_min: item.mark_range_min,
        mark_range_max: item.mark_range_max,
        linked_question_id: item.linked_question_id,
        is_active: item.is_active,
        sort_order: item.sort_order,
        created_by: profile.id,
      })),
    );
  }

  await supabase.from("assignment_comment_bank_imports").upsert(
    {
      template_id: input.templateId,
      source_bank_id: input.sourceBankId,
      import_mode: "copy",
      copied_bank_id: copiedBank.id,
      is_active: true,
      created_by: profile.id,
    },
    { onConflict: "template_id,source_bank_id,import_mode" },
  );

  revalidatePath(`/teacher/assignments`);
  return {
    success:
      "Copied bank into this assignment. Later source updates will not overwrite personalised copies.",
  };
}
