import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FeedbackForm } from "@/components/teacher/feedback-form";
import {
  LegacyMarkingPanels,
  StructuredMarkingWorkspace,
  type MarkingResponse,
} from "@/components/teacher/structured-marking-workspace";
import { requireProfile } from "@/lib/auth/get-profile";
import { isStructuredAssignment } from "@/lib/homework/assignment-mode";
import { loadTemplateStructure } from "@/lib/homework/structure";
import { createClient } from "@/lib/supabase/server";
import type { Feedback } from "@/lib/types";

async function teacherCanMarkClass(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teacherId: string,
  classId: string,
  assignmentTeacherId: string,
): Promise<boolean> {
  if (assignmentTeacherId === teacherId) return true;
  const { data: membership } = await supabase
    .from("class_teachers")
    .select("id")
    .eq("class_id", classId)
    .eq("teacher_id", teacherId)
    .eq("can_mark_submissions", true)
    .maybeSingle();
  return Boolean(membership);
}

export default async function MarkSubmissionPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const profile = await requireProfile(["teacher", "admin"]);
  const { submissionId } = await params;
  const supabase = await createClient();

  const { data: submission } = await supabase
    .from("submissions")
    .select(
      "*, student:profiles!submissions_student_id_fkey(display_name, email), assignments!inner(id, title, maximum_mark, teacher_id, instructions, template_id, class_id, allow_text_submission, allow_file_submission)",
    )
    .eq("id", submissionId)
    .maybeSingle();

  const assignment = Array.isArray(submission?.assignments)
    ? submission?.assignments[0]
    : submission?.assignments;
  if (!submission || !assignment) notFound();

  const canMark =
    profile.role === "admin" ||
    (await teacherCanMarkClass(
      supabase,
      profile.id,
      assignment.class_id,
      assignment.teacher_id,
    ));
  if (!canMark) notFound();

  const { data: feedback } = await supabase
    .from("feedback")
    .select("*")
    .eq("submission_id", submissionId)
    .maybeSingle();

  const student = Array.isArray(submission.student)
    ? submission.student[0]
    : submission.student;

  let structuredSections = null;
  let structuredResponses: MarkingResponse[] = [];
  let resources: Array<{ id: string; file_name: string; storage_path: string }> =
    [];
  let markSchemes: Array<{
    id: string;
    title: string;
    file_name: string;
    storage_path: string;
  }> = [];
  let commentBanks: Array<{ id: string; name: string }> = [];
  let assignmentComments: Array<{
    _id: string;
    short_label: string;
    full_comment: string;
    category: string;
    linked_question_id?: string | null;
    linked_question_ids?: string[];
    linked_section_id?: string | null;
    is_active: boolean;
    available_for_question: boolean;
    available_for_overall: boolean;
    available_for_annotation?: boolean;
    mark_range_min?: number | null;
    mark_range_max?: number | null;
    assessment_objective?: string | null;
  }> = [];

  if (assignment.template_id) {
    try {
      const sections = await loadTemplateStructure(
        supabase,
        assignment.template_id,
      );
      if (isStructuredAssignment(sections)) {
        structuredSections = sections;

        const [
          { data: responses },
          { data: resourceRows },
          { data: schemeRows },
          { data: bankLinks },
          commentsResult,
        ] = await Promise.all([
          supabase
            .from("student_responses")
            .select(
              "*, response_cells(row_index, col_index, text_value, numeric_value, boolean_value)",
            )
            .eq("submission_id", submissionId),
          supabase
            .from("assignment_resources")
            .select("id, file_name, storage_path")
            .eq("assignment_id", assignment.id),
          supabase
            .from("assignment_mark_schemes")
            .select("id, title, file_name, storage_path")
            .eq("template_id", assignment.template_id),
          supabase
            .from("assignment_comment_bank_links")
            .select(
              "comment_bank_id, school_default_comment_banks(id, name)",
            )
            .eq("template_id", assignment.template_id),
          supabase
            .from("assignment_comments")
            .select(
              "id, short_label, full_comment, category, linked_question_id, linked_question_ids, linked_section_id, mark_range_min, mark_range_max, is_active, available_for_question, available_for_overall, available_for_annotation, assessment_objective",
            )
            .eq("template_id", assignment.template_id)
            .order("sort_order", { ascending: true }),
        ]);

        let commentRows = commentsResult.data;
        if (commentsResult.error) {
          const { data: legacyComments } = await supabase
            .from("assignment_comments")
            .select(
              "id, short_label, full_comment, category, linked_question_id, mark_range_min, mark_range_max, is_active, available_for_question, available_for_overall",
            )
            .eq("template_id", assignment.template_id)
            .order("sort_order", { ascending: true });
          commentRows = legacyComments;
        }

        structuredResponses = (responses ?? []).map((r) => ({
          ...(r as MarkingResponse),
          cells: Array.isArray(r.response_cells) ? r.response_cells : [],
        }));
        resources = resourceRows ?? [];
        markSchemes = schemeRows ?? [];
        commentBanks = (bankLinks ?? [])
          .map((link) => {
            const bank = Array.isArray(link.school_default_comment_banks)
              ? link.school_default_comment_banks[0]
              : link.school_default_comment_banks;
            return bank
              ? { id: String(bank.id), name: String(bank.name) }
              : null;
          })
          .filter((b): b is { id: string; name: string } => Boolean(b));
        assignmentComments = (commentRows ?? []).map((row) => {
          const linkedIds = Array.isArray(row.linked_question_ids)
            ? (row.linked_question_ids as string[])
            : row.linked_question_id
              ? [String(row.linked_question_id)]
              : [];
          return {
            _id: String(row.id),
            short_label: String(row.short_label ?? ""),
            full_comment: String(row.full_comment ?? ""),
            category: String(row.category ?? ""),
            linked_question_id: row.linked_question_id
              ? String(row.linked_question_id)
              : null,
            linked_question_ids: linkedIds,
            linked_section_id: row.linked_section_id
              ? String(row.linked_section_id)
              : null,
            is_active: Boolean(row.is_active),
            available_for_question: Boolean(row.available_for_question),
            available_for_overall: Boolean(row.available_for_overall),
            available_for_annotation: Boolean(
              (row as { available_for_annotation?: boolean })
                .available_for_annotation,
            ),
            mark_range_min:
              row.mark_range_min == null ? null : Number(row.mark_range_min),
            mark_range_max:
              row.mark_range_max == null ? null : Number(row.mark_range_max),
            assessment_objective:
              (row as { assessment_objective?: string | null })
                .assessment_objective ?? null,
          };
        });
      }
    } catch {
      structuredSections = null;
    }
  }

  const isStructured = Boolean(structuredSections);

  return (
    <div className="space-y-6">
      <PageHeader
        title={student?.display_name ?? "Student work"}
        description={assignment.title}
        action={
          <Link href="/teacher/marking">
            <Button variant="outline">Back to queue</Button>
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Badge>{submission.status}</Badge>
        {submission.submitted_at ? (
          <Badge tone="neutral">
            Submitted {new Date(submission.submitted_at).toLocaleString("en-GB")}
          </Badge>
        ) : null}
        <Badge tone={isStructured ? "brand" : "neutral"}>
          {isStructured ? "Structured worksheet" : "Legacy submission"}
        </Badge>
      </div>

      {isStructured && structuredSections ? (
        <StructuredMarkingWorkspace
          submissionId={submissionId}
          maximumMark={Number(assignment.maximum_mark)}
          feedback={(feedback as Feedback | null) ?? null}
          sections={structuredSections}
          responses={structuredResponses}
          resources={resources}
          markSchemes={markSchemes}
          commentBanks={commentBanks}
          assignmentComments={assignmentComments}
          legacyWrittenResponse={submission.written_response}
          legacyFileName={submission.file_name}
          legacyStoragePath={submission.storage_path}
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <LegacyMarkingPanels
            writtenResponse={submission.written_response}
            fileName={submission.file_name}
            storagePath={submission.storage_path}
          />
          <Card>
            <CardTitle className="mb-4">Teacher feedback</CardTitle>
            <FeedbackForm
              submissionId={submissionId}
              maximumMark={Number(assignment.maximum_mark)}
              feedback={(feedback as Feedback | null) ?? null}
            />
          </Card>
        </div>
      )}
    </div>
  );
}
