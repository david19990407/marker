import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  StructuredHomework,
  type ResponseWithCells,
} from "@/components/student/structured-homework";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import { loadTemplateStructure } from "@/lib/homework/structure";

export default async function StudentHomeworkReviewPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const profile = await requireProfile(["student"]);
  const { assignmentId } = await params;
  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("assignments")
    .select(
      "id, title, status, class_id, template_id, release_at, due_at, classes(name)",
    )
    .eq("id", assignmentId)
    .eq("status", "published")
    .maybeSingle();
  if (!assignment) notFound();

  const { currentTimeMs } = await import("@/lib/utils/time");
  if (
    assignment.release_at &&
    new Date(assignment.release_at).getTime() > currentTimeMs()
  ) {
    notFound();
  }

  const { data: membership } = await supabase
    .from("class_members")
    .select("id")
    .eq("class_id", assignment.class_id)
    .eq("student_id", profile.id)
    .maybeSingle();
  if (!membership) notFound();

  if (!assignment.template_id) notFound();

  const sections = await loadTemplateStructure(supabase, assignment.template_id);

  const { data: submission } = await supabase
    .from("submissions")
    .select("*")
    .eq("assignment_id", assignmentId)
    .eq("student_id", profile.id)
    .maybeSingle();

  const existingResponses: Record<string, ResponseWithCells> = {};
  if (submission) {
    const { data: responses } = await supabase
      .from("student_responses")
      .select(
        "*, response_cells(row_index, col_index, text_value, numeric_value, boolean_value)",
      )
      .eq("submission_id", submission.id);

    for (const r of responses ?? []) {
      existingResponses[r.question_id] = {
        ...(r as ResponseWithCells),
        cells: Array.isArray(r.response_cells) ? r.response_cells : [],
      };
    }
  }

  const editable =
    !submission || ["draft", "returned"].includes(submission.status);

  const relatedClass = assignment.classes as
    | { name: string }
    | { name: string }[]
    | null;
  const className = Array.isArray(relatedClass)
    ? relatedClass[0]?.name
    : relatedClass?.name;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Review: ${assignment.title}`}
        description={className ?? "Homework"}
        action={
          <Link href={`/student/homework/${assignmentId}`}>
            <Button variant="outline">Back to homework</Button>
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Badge>{submission?.status ?? "not submitted"}</Badge>
        <Badge tone="neutral">
          Due{" "}
          {assignment.due_at
            ? new Date(assignment.due_at).toLocaleString("en-GB")
            : "—"}
        </Badge>
      </div>

      <Card>
        <CardTitle className="mb-4">Review your answers</CardTitle>
        <StructuredHomework
          assignmentId={assignmentId}
          sections={sections}
          existingResponses={existingResponses}
          editable={editable}
          reviewMode
        />
      </Card>
    </div>
  );
}
