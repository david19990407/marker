import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmissionPanel } from "@/components/student/submission-panel";
import {
  StructuredHomework,
  type ResponseWithCells,
} from "@/components/student/structured-homework";
import { DownloadButton } from "@/components/shared/download-button";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import { isStructuredAssignment } from "@/lib/homework/assignment-mode";
import { pickAuthoritativeResponsesByQuestion } from "@/lib/homework/response-protect";
import { loadTemplateStructure } from "@/lib/homework/structure";

export const dynamic = "force-dynamic";

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
      "id, title, instructions, due_at, release_at, maximum_mark, status, allow_text_submission, allow_file_submission, class_id, template_id, classes(name)",
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

  type ReleasedFeedback = {
    id?: string;
    mark: number | null;
    strengths: string | null;
    improvements: string | null;
    next_steps: string | null;
    field_values_json?: Record<string, unknown> | null;
    status: string;
    released_at: string | null;
  };
  let releasedFeedback: ReleasedFeedback | null = null;

  if (submission && ["marked", "returned"].includes(submission.status)) {
    const withFlexible = await supabase
      .from("feedback")
      .select(
        "id, mark, strengths, improvements, next_steps, field_values_json, status, released_at",
      )
      .eq("submission_id", submission.id)
      .eq("status", "released")
      .maybeSingle();
    if (withFlexible.data) {
      releasedFeedback = withFlexible.data as unknown as ReleasedFeedback;
    } else {
      const legacy = await supabase
        .from("feedback")
        .select(
          "id, mark, strengths, improvements, next_steps, status, released_at",
        )
        .eq("submission_id", submission.id)
        .eq("status", "released")
        .maybeSingle();
      releasedFeedback = (legacy.data as unknown as ReleasedFeedback) ?? null;
    }
  }

  let studentFeedbackFields: Array<{
    label: string;
    description: string | null;
    text: string;
  }> = [];
  if (releasedFeedback && assignment.template_id) {
    const [{ data: fieldDefs }, { data: valueRows }] = await Promise.all([
      supabase
        .from("assignment_feedback_fields")
        .select("id, field_key, label, description, sort_order, student_visible, teacher_only")
        .eq("template_id", assignment.template_id)
        .eq("student_visible", true)
        .eq("teacher_only", false)
        .order("sort_order", { ascending: true }),
      releasedFeedback.id
        ? supabase
            .from("feedback_field_values")
            .select("field_key, text_value, numeric_value, boolean_value, json_value")
            .eq("feedback_id", releasedFeedback.id)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    ]);

    const valuesByKey = new Map(
      (valueRows ?? []).map((row) => [String(row.field_key), row]),
    );
    const jsonBlob =
      (releasedFeedback as { field_values_json?: Record<string, unknown> })
        .field_values_json ?? {};

    if (fieldDefs?.length) {
      studentFeedbackFields = fieldDefs.map((field) => {
        const row = valuesByKey.get(String(field.field_key));
        const fromJson = jsonBlob[String(field.field_key)];
        const legacyKey = String(field.field_key) as
          | "strengths"
          | "improvements"
          | "next_steps";
        const legacyText =
          legacyKey in releasedFeedback
            ? String(
                (releasedFeedback as Record<string, unknown>)[legacyKey] ?? "",
              )
            : "";
        const text =
          (row?.text_value as string | null) ||
          (row?.numeric_value != null ? String(row.numeric_value) : "") ||
          (row?.boolean_value != null ? (row.boolean_value ? "Yes" : "No") : "") ||
          (typeof fromJson === "string" ? fromJson : "") ||
          legacyText ||
          "—";
        return {
          label: String(field.label),
          description: (field.description as string | null) ?? null,
          text,
        };
      });
    }
  }

  if (!studentFeedbackFields.length && releasedFeedback) {
    studentFeedbackFields = [
      { label: "Strengths", description: null, text: releasedFeedback.strengths || "—" },
      {
        label: "Improvements",
        description: null,
        text: releasedFeedback.improvements || "—",
      },
      {
        label: "Next steps",
        description: null,
        text: releasedFeedback.next_steps || "—",
      },
    ];
  }

  // Load structured content if template exists
  let structuredSections = null;
  const existingResponses: Record<string, ResponseWithCells> = {};
  let hasStructuredBlocks = false;

  if (assignment.template_id) {
    try {
      const sections = await loadTemplateStructure(supabase, assignment.template_id);
      hasStructuredBlocks = isStructuredAssignment(sections);

      if (hasStructuredBlocks) {
        structuredSections = sections;

        if (submission) {
          const { data: responses } = await supabase
            .from("student_responses")
            .select(
              "*, response_cells(row_index, col_index, text_value, numeric_value, boolean_value)",
            )
            .eq("submission_id", submission.id);

          const authoritative = pickAuthoritativeResponsesByQuestion(
            (responses ?? []) as Array<
              ResponseWithCells & {
                response_cells?: ResponseWithCells["cells"];
              }
            >,
          );
          for (const [questionId, r] of authoritative) {
            existingResponses[questionId] = {
              ...r,
              cells: Array.isArray(r.response_cells)
                ? r.response_cells
                : (r.cells ?? []),
            };
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
          <CardTitle className="mb-4">
            {editable ? "Homework worksheet" : "Submitted worksheet"}
          </CardTitle>
          <StructuredHomework
            key={`${assignmentId}-${submission?.status ?? "none"}-${editable ? "edit" : "ro"}`}
            assignmentId={assignmentId}
            sections={structuredSections}
            existingResponses={existingResponses}
            editable={editable}
            submissionStatus={submission?.status ?? null}
            submittedAt={submission?.submitted_at ?? null}
            allowUnsubmit
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

      {!hasStructuredBlocks ? (
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
      ) : null}

      {/* Legacy text/file panel ONLY for legacy assignments. */}
      {!hasStructuredBlocks &&
        (assignment.allow_text_submission || assignment.allow_file_submission) && (
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

      <Card>
        <CardTitle className="mb-2">Teacher feedback</CardTitle>
        {!releasedFeedback ? (
          <p className="text-sm text-slate-500">No feedback released yet</p>
        ) : (
          <div className="space-y-3 text-sm">
            <p>
              <span className="font-medium">Mark:</span>{" "}
              {releasedFeedback.mark ?? "—"} / {assignment.maximum_mark}
            </p>
            {releasedFeedback.released_at ? (
              <p className="text-slate-500">
                Returned{" "}
                {new Date(releasedFeedback.released_at).toLocaleString("en-GB")}
              </p>
            ) : null}
            {studentFeedbackFields.map((field) => (
              <div key={field.label}>
                <p className="font-medium">{field.label}</p>
                {field.description ? (
                  <p className="text-xs text-slate-400">{field.description}</p>
                ) : null}
                <p className="whitespace-pre-wrap text-slate-600">{field.text}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
