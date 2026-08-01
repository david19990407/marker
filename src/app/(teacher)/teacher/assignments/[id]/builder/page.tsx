import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { HomeworkBuilder } from "@/components/teacher/homework-builder/homework-builder";
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
    .select("*, classes(name)")
    .eq("id", id)
    .maybeSingle();

  if (!assignment) notFound();

  // Access check: owner or co-teacher
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

  const [
    initialSections,
    { data: resources },
    { data: markSchemes },
    { data: comments },
    { data: commentBanks },
    { data: commentBankLinks },
  ] = await Promise.all([
    loadTemplateStructure(supabase, assignment.template_id),
    supabase
      .from("assignment_resources")
      .select(
        "id, file_name, title, description, storage_path, file_type, resource_kind, external_url, visibility, sort_order",
      )
      .eq("assignment_id", id)
      .eq("archived", false)
      .order("sort_order", { ascending: true }),
    supabase
      .from("assignment_mark_schemes")
      .select("id, title, file_name, storage_path, mime_type, file_size_bytes, sort_order")
      .eq("template_id", assignment.template_id)
      .eq("archived", false)
      .order("sort_order", { ascending: true }),
    supabase
      .from("assignment_comments")
      .select(
        "id, short_label, full_comment, category, linked_question_id, mark_range_min, mark_range_max, is_active, sort_order, available_for_drag_drop, available_for_overall, available_for_question",
      )
      .eq("template_id", assignment.template_id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("school_default_comment_banks")
      .select("id, name, sort_order")
      .order("sort_order", { ascending: true }),
    supabase
      .from("assignment_comment_bank_links")
      .select("comment_bank_id")
      .eq("template_id", assignment.template_id),
  ]);

  const className = Array.isArray(assignment.classes)
    ? assignment.classes[0]?.name
    : assignment.classes?.name;
  const initialComments = (comments ?? []).map((comment) => ({
    _id: comment.id,
    short_label: comment.short_label,
    full_comment: comment.full_comment,
    category: comment.category ?? "",
    linked_question_id: comment.linked_question_id,
    mark_range_min: comment.mark_range_min != null ? Number(comment.mark_range_min) : null,
    mark_range_max: comment.mark_range_max != null ? Number(comment.mark_range_max) : null,
    is_active: comment.is_active ?? true,
    sort_order: comment.sort_order ?? 0,
    available_for_drag_drop: comment.available_for_drag_drop ?? true,
    available_for_overall: comment.available_for_overall ?? true,
    available_for_question: comment.available_for_question ?? true,
  })) satisfies AssignmentCommentDraft[];

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
        resources={resources ?? []}
        markSchemes={markSchemes ?? []}
        initialComments={initialComments}
        commentBanks={(commentBanks ?? []).map((bank) => ({
          id: bank.id,
          name: bank.name,
        }))}
        linkedCommentBankIds={(commentBankLinks ?? []).map((link) => link.comment_bank_id)}
      />
    </div>
  );
}
