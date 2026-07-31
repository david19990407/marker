import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmissionPanel } from "@/components/student/submission-panel";
import { StructuredHomework } from "@/components/student/structured-homework";
import { DownloadButton } from "@/components/shared/download-button";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import { loadTemplateStructure } from "@/lib/homework/structure";
import { RESPONSE_BLOCK_TYPES } from "@/lib/types";
import type { StudentResponse } from "@/lib/types";

export default async function StudentAssignmentPage({
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
      "id, title, instructions, due_at, maximum_mark, status, allow_text_submission, allow_file_submission, class_id, template_id, classes(name)",
    )
    .eq("id", assignmentId)
    .eq("status", "published")
    .maybeSingle();
  if (!assignment) notFound();

  const { data: membership } = await supabase
    .from("class_members")
    .select("id")
    .eq("class_id", assignment.class_id)
    .eq("student_id", profile.id)
    .maybeSingle();
  if (!membership) notFound();

  const [{ data: resources }, { data: submission }] = await Promise.all([
    supabase
      .from("assignment_resources")
      .select("id, file_name, storage_path, file_type")
      .eq("assignment_id", assignmentId),
    supabase
      .from("submissions")
      .select("*")
      .eq("assignment_id", assignmentId)
      .eq("student_id", profile.id)
      .maybeSingle(),
  ]);

  const { data: feedback } =
    submission && ["marked", "returned"].includes(submission.status)
      ? await supabase
          .from("feedback")
          .select("mark, strengths, improvements, next_steps, status, released_at")
          .eq("submission_id", submission.id)
          .eq("status", "released")
          .maybeSingle()
      : { data: null };

  // Load structured content if template exists
  let structuredSections = null;
  const existingResponses: Record<string, StudentResponse> = {};
  let hasStructuredBlocks = false;

  if (assignment.template_id) {
    try {
      const sections = await loadTemplateStructure(supabase, assignment.template_id);

      // Check if there are any non-trivial blocks
      const allBlocks = sections.flatMap((s) => [
        ...s.blocks,
        ...s.subsections.flatMap((sub) => sub.blocks),
      ]);
      const nonEmpty = allBlocks.filter(
        (b) => !b.teacher_only && b.block_type !== "mark_scheme",
      );
      const hasResponseBlocks = nonEmpty.some((b) =>
        (RESPONSE_BLOCK_TYPES as readonly string[]).includes(b.block_type),
      );

      // Show structured view when there are multiple blocks or response blocks
      hasStructuredBlocks =
        hasResponseBlocks ||
        nonEmpty.length > 1 ||
        (nonEmpty.length === 1 && nonEmpty[0].block_type !== "instruction");

      if (hasStructuredBlocks) {
        structuredSections = sections;

        // Load existing student responses
        if (submission) {
          const { data: responses } = await supabase
            .from("student_responses")
            .select("*")
            .eq("submission_id", submission.id);

          if (responses) {
            for (const r of responses) {
              existingResponses[r.question_id] = r as StudentResponse;
            }
          }
        }
      }
    } catch {
      // If structure load fails, fall back to legacy view
    }
  }

  const relatedClass = assignment.classes as
    | { name: string }
    | { name: string }[]
    | null;
  const className = Array.isArray(relatedClass)
    ? relatedClass[0]?.name
    : relatedClass?.name;
  const editable =
    !submission || ["draft", "returned"].includes(submission.status);
  const { currentTimeMs } = await import("@/lib/utils/time");
  const late =
    assignment.due_at &&
    new Date(assignment.due_at).getTime() < currentTimeMs();

  return (
    <div className="space-y-6">
      <PageHeader
        title={assignment.title}
        description={className ?? "Homework"}
        action={
          <Link href="/student/homework">
            <Button variant="outline">Back</Button>
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
        {late ? <Badge tone="warning">Past due</Badge> : null}
        <Badge tone="neutral">Max {assignment.maximum_mark}</Badge>
      </div>

      {/* Structured homework content */}
      {hasStructuredBlocks && structuredSections ? (
        <Card>
          <CardTitle className="mb-4">Homework questions</CardTitle>
          <StructuredHomework
            assignmentId={assignmentId}
            sections={structuredSections}
            existingResponses={existingResponses}
            editable={editable}
          />
        </Card>
      ) : (
        /* Legacy instructions card */
        <Card>
          <CardTitle className="mb-2">Instructions</CardTitle>
          <p className="whitespace-pre-wrap text-sm leading-7 text-slate-600">
            {assignment.instructions || "No instructions provided."}
          </p>
        </Card>
      )}

      <Card>
        <CardTitle className="mb-4">Resources</CardTitle>
        {!resources?.length ? (
          <p className="text-sm text-slate-500">No resources for this assignment</p>
        ) : (
          <ul className="space-y-2">
            {resources.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 px-4 py-3 text-sm"
              >
                <span>{r.file_name}</span>
                <DownloadButton
                  bucket="assignment-resources"
                  path={r.storage_path}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Legacy submission panel (text/file) — always shown when assignment allows it */}
      {(assignment.allow_text_submission || assignment.allow_file_submission) && (
        <Card>
          <CardTitle className="mb-4">Submit work</CardTitle>
          <SubmissionPanel
            assignmentId={assignmentId}
            allowText={assignment.allow_text_submission}
            allowFile={assignment.allow_file_submission}
            editable={editable}
            writtenResponse={submission?.written_response ?? null}
            fileName={submission?.file_name ?? null}
            storagePath={submission?.storage_path ?? null}
          />
        </Card>
      )}

      {/* If structured only (no text/file submission), show submit button */}
      {hasStructuredBlocks &&
        !assignment.allow_text_submission &&
        !assignment.allow_file_submission &&
        editable && (
          <Card>
            <CardTitle className="mb-2">Submit homework</CardTitle>
            <p className="mb-4 text-sm text-slate-600">
              Save your answers above, then submit when you&apos;re ready.
            </p>
            <SubmissionPanel
              assignmentId={assignmentId}
              allowText={false}
              allowFile={false}
              editable={editable}
              writtenResponse={null}
              fileName={null}
              storagePath={null}
            />
          </Card>
        )}

      <Card>
        <CardTitle className="mb-2">Teacher feedback</CardTitle>
        {!feedback ? (
          <p className="text-sm text-slate-500">No feedback released yet</p>
        ) : (
          <div className="space-y-3 text-sm">
            <p>
              <span className="font-medium">Mark:</span>{" "}
              {feedback.mark ?? "—"} / {assignment.maximum_mark}
            </p>
            {feedback.released_at ? (
              <p className="text-slate-500">
                Returned{" "}
                {new Date(feedback.released_at).toLocaleString("en-GB")}
              </p>
            ) : null}
            <div>
              <p className="font-medium">Strengths</p>
              <p className="text-slate-600">{feedback.strengths || "—"}</p>
            </div>
            <div>
              <p className="font-medium">Improvements</p>
              <p className="text-slate-600">{feedback.improvements || "—"}</p>
            </div>
            <div>
              <p className="font-medium">Next steps</p>
              <p className="text-slate-600">{feedback.next_steps || "—"}</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
