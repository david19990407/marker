"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/auth";
import type { CommentBank, CommentBankItem } from "@/lib/feedback/types";
import {
  commentBankItemSchema,
  commentBankSchema,
} from "@/lib/validations/feedback";

async function assertTeacher() {
  return requireProfile(["teacher", "admin"]);
}

async function assertAdmin() {
  return requireProfile(["admin"]);
}

function mapBank(row: Record<string, unknown>): CommentBank {
  return {
    id: String(row.id),
    scope: row.scope as CommentBank["scope"],
    name: String(row.name ?? ""),
    description: (row.description as string | null) ?? null,
    owner_id: (row.owner_id as string | null) ?? null,
    department_name: (row.department_name as string | null) ?? null,
    subject: (row.subject as string | null) ?? null,
    year_group: (row.year_group as string | null) ?? null,
    teacher_restriction_ids: Array.isArray(row.teacher_restriction_ids)
      ? (row.teacher_restriction_ids as string[])
      : [],
    class_id: (row.class_id as string | null) ?? null,
    template_id: (row.template_id as string | null) ?? null,
    is_active: Boolean(row.is_active),
    sort_order: Number(row.sort_order ?? 0),
  };
}

function mapItem(row: Record<string, unknown>): CommentBankItem {
  return {
    id: String(row.id),
    bank_id: String(row.bank_id),
    group_id: (row.group_id as string | null) ?? null,
    title: String(row.title ?? ""),
    short_label: String(row.short_label ?? ""),
    full_text: String(row.full_text ?? ""),
    category: String(row.category ?? ""),
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    year_group: (row.year_group as string | null) ?? null,
    subject: (row.subject as string | null) ?? null,
    tone: (row.tone as CommentBankItem["tone"]) ?? "neutral",
    mark_range_min:
      row.mark_range_min == null ? null : Number(row.mark_range_min),
    mark_range_max:
      row.mark_range_max == null ? null : Number(row.mark_range_max),
    linked_question_id: (row.linked_question_id as string | null) ?? null,
    is_active: Boolean(row.is_active),
    sort_order: Number(row.sort_order ?? 0),
  };
}

export async function listCommentBanksAction(filters?: {
  templateId?: string | null;
  classId?: string | null;
  subject?: string | null;
}): Promise<ActionResult & { banks?: CommentBank[] }> {
  await assertTeacher();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comment_banks")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) {
    // Pre-migration compatibility.
    if (/relation .*comment_banks.* does not exist/i.test(error.message)) {
      return { banks: [] };
    }
    return { error: error.message };
  }

  const banks = (data ?? [])
    .map((row) => mapBank(row as Record<string, unknown>))
    .filter((bank) => {
      if (bank.scope === "assignment") {
        return !filters?.templateId || bank.template_id === filters.templateId;
      }
      if (bank.scope === "class") {
        return !filters?.classId || bank.class_id === filters.classId;
      }
      if (bank.scope === "department" && filters?.subject) {
        return (
          !bank.subject ||
          bank.subject.toLowerCase() === filters.subject.toLowerCase()
        );
      }
      return true;
    });

  return { banks };
}

export async function listCommentBankItemsAction(filters?: {
  templateId?: string | null;
  classId?: string | null;
  subject?: string | null;
  includeArchived?: boolean;
  selectedOnly?: boolean;
}): Promise<
  ActionResult & {
    items?: CommentBankItem[];
    favouriteIds?: string[];
    recentIds?: string[];
  }
> {
  const profile = await assertTeacher();
  const supabase = await createClient();

  const banksResult = await listCommentBanksAction(filters);
  if (banksResult.error) return { error: banksResult.error };
  const banks = banksResult.banks ?? [];
  if (!banks.length) return { items: [], favouriteIds: [], recentIds: [] };

  const bankIds = banks.map((b) => b.id);
  let itemsQuery = supabase
    .from("comment_bank_items")
    .select("*")
    .in("bank_id", bankIds)
    .order("sort_order", { ascending: true });
  if (!filters?.includeArchived) {
    itemsQuery = itemsQuery.eq("is_active", true);
  }

  const [{ data: items, error }, { data: favs }, { data: recent }] =
    await Promise.all([
      itemsQuery,
      supabase
        .from("teacher_comment_favourites")
        .select("comment_item_id")
        .eq("teacher_id", profile.id),
      supabase
        .from("teacher_comment_recent")
        .select("comment_item_id, used_at")
        .eq("teacher_id", profile.id)
        .order("used_at", { ascending: false })
        .limit(20),
    ]);

  if (error) {
    if (/relation .*comment_bank_items.* does not exist/i.test(error.message)) {
      return { items: [], favouriteIds: [], recentIds: [] };
    }
    return { error: error.message };
  }

  let selectedItemIds: Set<string> | null = null;
  if (filters?.selectedOnly && filters.templateId) {
    const { data: selections, error: selectionsError } = await supabase
      .from("assignment_comment_selections")
      .select("comment_item_id")
      .eq("template_id", filters.templateId)
      .eq("selected", true);
    if (selectionsError) {
      if (!/does not exist|schema cache/i.test(selectionsError.message)) {
        return { error: selectionsError.message };
      }
    } else {
      selectedItemIds = new Set(
        (selections ?? []).map((row) => String(row.comment_item_id)),
      );
    }
  }

  const bankById = new Map(banks.map((b) => [b.id, b]));
  const favouriteIds = (favs ?? []).map((f) => String(f.comment_item_id));
  const recentIds = (recent ?? []).map((r) => String(r.comment_item_id));
  const recentAt = new Map(
    (recent ?? []).map((r) => [
      String(r.comment_item_id),
      String(r.used_at ?? ""),
    ]),
  );

  return {
    items: (items ?? [])
      .map((row) => {
        const item = mapItem(row as Record<string, unknown>);
        const bank = bankById.get(item.bank_id);
        return {
          ...item,
          bank_name: bank?.name,
          bank_scope: bank?.scope,
          is_favourite: favouriteIds.includes(item.id),
          recent_used_at: recentAt.get(item.id) ?? null,
        };
      })
      .filter((item) => !selectedItemIds || selectedItemIds.has(item.id)),
    favouriteIds,
    recentIds,
  };
}

export async function saveCommentBankAction(
  input: unknown,
): Promise<ActionResult & { bank?: CommentBank }> {
  const profile = await assertAdmin();
  const parsed = commentBankSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid bank" };
  }
  const supabase = await createClient();
  const payload = {
    ...parsed.data,
    owner_id:
      parsed.data.scope === "personal" || parsed.data.scope === "department"
        ? profile.id
        : null,
    description: parsed.data.description || null,
    department_name: parsed.data.department_name || null,
    subject: parsed.data.subject || null,
    year_group: parsed.data.year_group || null,
    teacher_restriction_ids: parsed.data.teacher_restriction_ids ?? [],
    class_id: parsed.data.class_id || null,
    template_id: parsed.data.template_id || null,
  };

  if (parsed.data.id) {
    const { data, error } = await supabase
      .from("comment_banks")
      .update(payload)
      .eq("id", parsed.data.id)
      .select("*")
      .single();
    if (error) return { error: error.message };
    revalidatePath("/teacher/comment-banks");
    revalidatePath("/admin/settings/comment-banks");
    return { success: "Comment bank updated", bank: mapBank(data) };
  }

  const { data, error } = await supabase
    .from("comment_banks")
    .insert(payload)
    .select("*")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/teacher/comment-banks");
  revalidatePath("/admin/settings/comment-banks");
  return { success: "Comment bank created", bank: mapBank(data) };
}

export async function saveCommentBankItemAction(
  input: unknown,
): Promise<ActionResult & { item?: CommentBankItem }> {
  const profile = await assertAdmin();
  const parsed = commentBankItemSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid comment" };
  }
  const supabase = await createClient();
  const payload = {
    ...parsed.data,
    created_by: profile.id,
    group_id: parsed.data.group_id || null,
    category: parsed.data.category || "",
    year_group: parsed.data.year_group || null,
    subject: parsed.data.subject || null,
    linked_question_id: parsed.data.linked_question_id || null,
    mark_range_min: parsed.data.mark_range_min ?? null,
    mark_range_max: parsed.data.mark_range_max ?? null,
  };

  if (parsed.data.id) {
    const update = { ...payload };
    delete (update as { id?: string }).id;
    const { data, error } = await supabase
      .from("comment_bank_items")
      .update(update)
      .eq("id", parsed.data.id)
      .select("*")
      .single();
    if (error) return { error: error.message };
    revalidatePath("/teacher/comment-banks");
    revalidatePath("/admin/settings/comment-banks");
    return { success: "Comment saved", item: mapItem(data) };
  }

  const { data, error } = await supabase
    .from("comment_bank_items")
    .insert(payload)
    .select("*")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/teacher/comment-banks");
  revalidatePath("/admin/settings/comment-banks");
  return { success: "Comment created", item: mapItem(data) };
}

export async function archiveCommentBankItemAction(
  itemId: string,
): Promise<ActionResult> {
  await assertAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("comment_bank_items")
    .update({ is_active: false })
    .eq("id", itemId);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings/comment-banks");
  return { success: "Comment archived" };
}

export async function toggleCommentFavouriteAction(
  commentItemId: string,
  favourite: boolean,
): Promise<ActionResult> {
  const profile = await assertTeacher();
  const supabase = await createClient();
  if (favourite) {
    const { error } = await supabase.from("teacher_comment_favourites").upsert({
      teacher_id: profile.id,
      comment_item_id: commentItemId,
    });
    if (error) return { error: error.message };
    return { success: "Added to favourites" };
  }
  const { error } = await supabase
    .from("teacher_comment_favourites")
    .delete()
    .eq("teacher_id", profile.id)
    .eq("comment_item_id", commentItemId);
  if (error) return { error: error.message };
  return { success: "Removed from favourites" };
}

export async function recordCommentUseAction(
  commentItemId: string,
): Promise<ActionResult> {
  await assertTeacher();
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_comment_bank_use", {
    p_comment_item_id: commentItemId,
  });
  if (error) {
    if (/could not find the function|schema cache|does not exist/i.test(error.message)) {
      // Soft-fail before migration.
      return { success: "ok" };
    }
    return { error: error.message };
  }
  return { success: "ok" };
}
