import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AssignmentForm } from "@/components/teacher/assignment-form";
import { AssignmentStampSelector } from "@/components/teacher/assignment-stamp-selector";
import { AssignmentCommentSelector } from "@/components/teacher/assignment-comment-selector";
import {
  listMarkingStampsAction,
  loadAssignmentStampSelectionsAction,
} from "@/lib/actions/marking-annotations";
import {
  listCommentBankItemsAction,
  listCommentBanksAction,
} from "@/lib/actions/comment-banks";
import {
  listCommentBankGroupsAction,
  loadAssignmentCommentSelectionsAction,
} from "@/lib/actions/comment-bank-groups";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import type { Assignment } from "@/lib/types";

export default async function EditAssignmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireProfile(["teacher", "admin"]);
  const { id } = await params;
  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("assignments")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  // Verify access: teacher_id match or class_teachers membership
  if (assignment && assignment.teacher_id !== profile.id) {
    const { data: ct } = await supabase
      .from("class_teachers")
      .select("id")
      .eq("class_id", assignment.class_id)
      .eq("teacher_id", profile.id)
      .maybeSingle();
    if (!ct) {
      notFound();
    }
  }

  // Classes the teacher can assign to (for the class display)
  const { data: ctRows } = await supabase
    .from("class_teachers")
    .select("classes(id, name, archived)")
    .eq("teacher_id", profile.id);

  const classesFromCt = (ctRows ?? []).flatMap((row) => {
    const c = Array.isArray(row.classes) ? row.classes[0] : row.classes;
    return c && !c.archived ? [{ id: c.id, name: c.name }] : [];
  });

  const { data: legacyClasses } = await supabase
    .from("classes")
    .select("id, name")
    .eq("teacher_id", profile.id)
    .eq("archived", false);

  const classIdsSeen = new Set(classesFromCt.map((c) => c.id));
  const classes = [
    ...classesFromCt,
    ...(legacyClasses ?? []).filter((c) => !classIdsSeen.has(c.id)),
  ].sort((a, b) => a.name.localeCompare(b.name));

  if (!assignment) notFound();

  const { data: classRow } = await supabase
    .from("classes")
    .select("subject")
    .eq("id", assignment.class_id)
    .maybeSingle();

  const [
    stampsResult,
    selectionsResult,
    banksResult,
    itemsResult,
    groupsResult,
    commentSelectionResult,
  ] = await Promise.all([
    listMarkingStampsAction({
      subject: classRow?.subject ?? null,
      assignmentId: id,
    }),
    loadAssignmentStampSelectionsAction(id),
    listCommentBanksAction({
      templateId: assignment.template_id,
      classId: assignment.class_id,
      subject: classRow?.subject ?? null,
    }),
    listCommentBankItemsAction({
      templateId: assignment.template_id,
      classId: assignment.class_id,
      subject: classRow?.subject ?? null,
    }),
    listCommentBankGroupsAction(),
    assignment.template_id
      ? loadAssignmentCommentSelectionsAction(assignment.template_id)
      : Promise.resolve({ selectedItemIds: [] }),
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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Edit assignment"
        action={
          <div className="flex gap-2">
            <Link href={`/teacher/assignments/${id}/builder`}>
              <Button variant="secondary">Homework builder</Button>
            </Link>
            <Link href={`/teacher/assignments/${id}`}>
              <Button variant="outline">Back</Button>
            </Link>
          </div>
        }
      />
      <Card>
        <AssignmentForm
          classes={classes ?? []}
          assignment={assignment as Assignment}
        />
      </Card>
      {assignment.template_id ? (
        <Card>
          <AssignmentCommentSelector
            templateId={assignment.template_id}
            banks={commentBanks}
            initialSelections={commentSelectionResult.selectedItemIds ?? []}
          />
        </Card>
      ) : null}
      <Card>
        <CardTitle className="mb-4">Marking stamps</CardTitle>
        <AssignmentStampSelector
          assignmentId={id}
          stamps={stampsResult.stamps ?? []}
          selectedStampIds={(selectionsResult.selections ?? [])
            .filter((s) => s.enabled)
            .map((s) => s.stamp_id)}
        />
      </Card>
    </div>
  );
}
