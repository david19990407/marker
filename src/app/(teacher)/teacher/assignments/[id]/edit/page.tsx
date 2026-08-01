import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AssignmentForm } from "@/components/teacher/assignment-form";
import { AssignmentStampSelector } from "@/components/teacher/assignment-stamp-selector";
import {
  listMarkingStampsAction,
  loadAssignmentStampSelectionsAction,
} from "@/lib/actions/marking-annotations";
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

  const [stampsResult, selectionsResult] = await Promise.all([
    listMarkingStampsAction({
      subject: classRow?.subject ?? null,
      assignmentId: id,
    }),
    loadAssignmentStampSelectionsAction(id),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
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
