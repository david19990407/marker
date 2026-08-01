import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { HomeworkBuilder } from "@/components/teacher/homework-builder/homework-builder";
import {
  listCommentBankItemsAction,
  listCommentBanksAction,
} from "@/lib/actions/comment-banks";
import {
  listCommentBankGroupsAction,
  loadAssignmentCommentSelectionsAction,
} from "@/lib/actions/comment-bank-groups";
import { loadFeedbackFieldsAction } from "@/lib/actions/feedback-fields";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import { loadTemplateStructure } from "@/lib/homework/structure";
import type { Assignment, AssignmentCommentDraft } from "@/lib/types";

export default async function HomeworkBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireProfile(["teacher", "admin"]);
  const { id } = await params;
  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("assignments")
    .select("*, classes(name, subject)")
    .eq("id", id)
    .maybeSingle();

  if (!assignment) notFound();

  if (assignment.teacher_id !== profile.id) {
    const { data: ct } = await supabase
      .from("class_teachers")
      .select("id")
      .eq("class_id", assignment.class_id)
      .eq("teacher_id", profile.id)
      .maybeSingle();
    if (!ct) notFound();
  }

  if (!assignment.template_id) notFound();

  const initialSections = await loadTemplateStructure(
    supabase,
    assignment.template_id,
  );

  // Optional Phase-6 repair tables/columns — degrade gracefully if migration pending
  const [resourcesRes, markSchemesRes, commentsRes] =
    await Promise.all([
      supabase
        .from("assignment_resources")
        .select(
          "id, file_name, title, description, storage_path, file_type, resource_kind, external_url, visibility, sort_order",
        )
        .eq("assignment_id", id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("assignment_mark_schemes")
        .select(
          "id, title, file_name, storage_path, mime_type, file_size_bytes, sort_order",
        )
        .eq("template_id", assignment.template_id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("assignment_comments")
        .select(
          "id, short_label, full_comment, category, linked_question_id, linked_question_ids, linked_section_id, mark_range_min, mark_range_max, is_active, sort_order, available_for_drag_drop, available_for_overall, available_for_question, available_for_annotation, assessment_objective",
        )
        .eq("template_id", assignment.template_id)
        .order("sort_order", { ascending: true }),
    ]);

  const resources = (resourcesRes.data ?? []).filter(
    (r) => (r as { archived?: boolean }).archived !== true,
  );
  const markSchemes = (markSchemesRes.data ?? []).filter(
    (r) => (r as { archived?: boolean }).archived !== true,
  );
  // Prefer extended comment columns; fall back if migration not applied yet.
  let comments: Array<Record<string, unknown>> = (commentsRes.data ??
    []) as Array<Record<string, unknown>>;
  if (commentsRes.error) {
    const fallback = await supabase
      .from("assignment_comments")
      .select(
        "id, short_label, full_comment, category, linked_question_id, mark_range_min, mark_range_max, is_active, sort_order, available_for_drag_drop, available_for_overall, available_for_question",
      )
      .eq("template_id", assignment.template_id)
      .order("sort_order", { ascending: true });
    comments = (fallback.data ?? []) as Array<Record<string, unknown>>;
  }
  const className = Array.isArray(assignment.classes)
    ? assignment.classes[0]?.name
    : assignment.classes?.name;
  const classSubject = Array.isArray(assignment.classes)
    ? assignment.classes[0]?.subject
    : assignment.classes?.subject;

  const [
    fieldsResult,
    banksResult,
    groupsResult,
    itemsResult,
    commentSelectionResult,
  ] = await Promise.all([
    loadFeedbackFieldsAction(assignment.template_id),
    listCommentBanksAction({
      templateId: assignment.template_id,
      classId: assignment.class_id,
      subject: classSubject ?? null,
    }),
    listCommentBankGroupsAction(),
    listCommentBankItemsAction({
      templateId: assignment.template_id,
      classId: assignment.class_id,
      subject: classSubject ?? null,
    }),
    loadAssignmentCommentSelectionsAction(assignment.template_id),
  ]);

  const commentItems = (itemsResult.items ?? []).filter((item) => item.is_active);
  const commentGroups = (groupsResult.groups ?? []).filter((group) => group.is_active);
  const commentBanks = (banksResult.banks ?? [])
    .filter((bank) => bank.scope === "school" || bank.scope === "department")
    .map((bank) => ({
      ...bank,
      groups: commentGroups.filter((group) => group.bank_id === bank.id),
      items: commentItems.filter((item) => item.bank_id === bank.id),
    }))
    .filter((bank) => bank.items.length > 0);

  const initialComments = comments.map((comment) => {
    const linkedIds = Array.isArray(comment.linked_question_ids)
      ? (comment.linked_question_ids as string[])
      : comment.linked_question_id
        ? [String(comment.linked_question_id)]
        : [];
    return {
      _id: String(comment.id),
      short_label: String(comment.short_label ?? ""),
      full_comment: String(comment.full_comment ?? ""),
      category: String(comment.category ?? ""),
      linked_question_id: comment.linked_question_id
        ? String(comment.linked_question_id)
        : null,
      linked_question_ids: linkedIds,
      linked_section_id:
        typeof comment.linked_section_id === "string"
          ? comment.linked_section_id
          : null,
      mark_range_min:
        comment.mark_range_min != null ? Number(comment.mark_range_min) : null,
      mark_range_max:
        comment.mark_range_max != null ? Number(comment.mark_range_max) : null,
      is_active: Boolean(comment.is_active ?? true),
      sort_order: Number(comment.sort_order ?? 0),
      available_for_drag_drop: Boolean(comment.available_for_drag_drop ?? true),
      available_for_overall: Boolean(comment.available_for_overall ?? true),
      available_for_question: Boolean(comment.available_for_question ?? true),
      available_for_annotation: Boolean(comment.available_for_annotation),
      assessment_objective:
        typeof comment.assessment_objective === "string"
          ? comment.assessment_objective
          : null,
    } satisfies AssignmentCommentDraft;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Builder: ${assignment.title}`}
        description={className ?? "Assignment"}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={`/teacher/assignments/${id}/preview`}>
              <Button variant="secondary">Preview</Button>
            </Link>
            <Link href={`/teacher/assignments/${id}/edit`}>
              <Button variant="outline">Publish / schedule</Button>
            </Link>
            <Link href={`/teacher/assignments/${id}`}>
              <Button variant="outline">Back</Button>
            </Link>
          </div>
        }
      />

      <HomeworkBuilder
        assignment={assignment as Assignment & { template_id: string }}
        initialSections={initialSections}
        classNames={className ? [className] : []}
        resources={resources}
        markSchemes={markSchemes}
        initialComments={initialComments}
        commentBanks={commentBanks}
        selectedCommentItemIds={commentSelectionResult.selectedItemIds ?? []}
        feedbackFields={fieldsResult.fields ?? []}
      />
    </div>
  );
}
