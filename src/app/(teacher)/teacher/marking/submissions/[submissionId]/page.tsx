import { notFound } from "next/navigation";
import { Card, CardTitle } from "@/components/ui/card";
import { FeedbackForm } from "@/components/teacher/feedback-form";
import { DocumentMarkingWorkspace } from "@/components/teacher/marking/document-marking-workspace";
import {
  LegacyMarkingPanels,
  type MarkingResponse,
} from "@/components/teacher/structured-marking-workspace";
import { listCommentBankItemsAction } from "@/lib/actions/comment-banks";
import { loadFeedbackFieldsAction } from "@/lib/actions/feedback-fields";
import {
  listMarkingStampsAction,
  loadAssignmentStampSelectionsAction,
  loadQuestionMarksAction,
  loadSubmissionAnnotationsAction,
} from "@/lib/actions/marking-annotations";
import { requireProfile } from "@/lib/auth/get-profile";
import { isStructuredAssignment } from "@/lib/homework/assignment-mode";
import { pickAuthoritativeResponsesByQuestion } from "@/lib/homework/response-protect";
import { loadTemplateStructure } from "@/lib/homework/structure";
import {
  assertTeacherCanMarkClass,
  loadSubmissionNavigation,
} from "@/lib/marking/queries";
import { createClient } from "@/lib/supabase/server";
import type {
  AssignmentFeedbackField,
  CommentBankItem,
  FeedbackFieldValue,
} from "@/lib/feedback/types";
import type { Feedback } from "@/lib/types";
import type { MarkingStamp } from "@/lib/marking/annotation-types";

export const dynamic = "force-dynamic";

async function loadAssignmentBundle(
  supabase: Awaited<ReturnType<typeof createClient>>,
  submissionId: string,
) {
  const withPhase8 = await supabase
    .from("submissions")
    .select(
      "*, student:profiles!submissions_student_id_fkey(display_name, email), assignments!inner(id, title, maximum_mark, teacher_id, instructions, template_id, class_id, allow_text_submission, allow_file_submission, allow_decimal_question_marks, circular_mark_threshold, annotation_default_visibility, classes(name, subject))",
    )
    .eq("id", submissionId)
    .maybeSingle();

  if (!withPhase8.error) return withPhase8;

  return supabase
    .from("submissions")
    .select(
      "*, student:profiles!submissions_student_id_fkey(display_name, email), assignments!inner(id, title, maximum_mark, teacher_id, instructions, template_id, class_id, allow_text_submission, allow_file_submission, classes(name, subject))",
    )
    .eq("id", submissionId)
    .maybeSingle();
}

export default async function MarkSubmissionPage({
  params,
  searchParams,
}: {
  params: Promise<{ submissionId: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const profile = await requireProfile(["teacher", "admin"]);
  const { submissionId } = await params;
  const { filter } = await searchParams;
  const unmarkedOnly = filter === "unmarked";
  const supabase = await createClient();

  const { data: submission } = await loadAssignmentBundle(
    supabase,
    submissionId,
  );

  const assignment = Array.isArray(submission?.assignments)
    ? submission?.assignments[0]
    : submission?.assignments;
  if (!submission || !assignment) notFound();

  const canMark = await assertTeacherCanMarkClass(
    supabase,
    profile,
    assignment.class_id,
  );
  if (!canMark) notFound();

  const classRel = (
    assignment as {
      classes?:
        | { name?: string; subject?: string }
        | { name?: string; subject?: string }[];
    }
  ).classes;
  const classRow = Array.isArray(classRel) ? classRel[0] : classRel;
  const className = classRow?.name ?? null;
  const subject = classRow?.subject ?? null;

  const [
    { data: feedback },
    nav,
    commentItemsResult,
    fieldsResult,
    annotationsResult,
    questionMarksResult,
    stampsResult,
    stampSelectionsResult,
  ] = await Promise.all([
    supabase
      .from("feedback")
      .select("*")
      .eq("submission_id", submissionId)
      .maybeSingle(),
    loadSubmissionNavigation(
      supabase,
      profile,
      assignment.id,
      submissionId,
      unmarkedOnly,
    ),
    listCommentBankItemsAction({
      templateId: assignment.template_id,
      classId: assignment.class_id,
      // Phase 8: only pass administrator bank comments selected for this assignment.
      selectedOnly: true,
    }),
    assignment.template_id
      ? loadFeedbackFieldsAction(assignment.template_id)
      : Promise.resolve({ fields: [] as AssignmentFeedbackField[] }),
    loadSubmissionAnnotationsAction(submissionId),
    loadQuestionMarksAction(submissionId),
    listMarkingStampsAction({
      subject,
      assignmentId: assignment.id,
    }),
    loadAssignmentStampSelectionsAction(assignment.id),
  ]);

  let feedbackFieldValues: FeedbackFieldValue[] = [];
  if (feedback?.id) {
    const { data: valueRows } = await supabase
      .from("feedback_field_values")
      .select("*")
      .eq("feedback_id", feedback.id);
    feedbackFieldValues = (valueRows ?? []).map((row) => ({
      field_id: String(row.field_id),
      field_key: String(row.field_key),
      text_value: (row.text_value as string | null) ?? null,
      numeric_value:
        row.numeric_value == null ? null : Number(row.numeric_value),
      boolean_value: (row.boolean_value as boolean | null) ?? null,
      json_value: row.json_value,
    }));
  }

  const feedbackFields = fieldsResult.fields ?? [];
  const commentBankItems: CommentBankItem[] = commentItemsResult.items ?? [];

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

        let commentRows: Array<Record<string, unknown>> = (commentsResult.data ??
          []) as Array<Record<string, unknown>>;
        if (commentsResult.error) {
          const { data: legacyComments } = await supabase
            .from("assignment_comments")
            .select(
              "id, short_label, full_comment, category, linked_question_id, mark_range_min, mark_range_max, is_active, available_for_question, available_for_overall",
            )
            .eq("template_id", assignment.template_id)
            .order("sort_order", { ascending: true });
          commentRows = (legacyComments ?? []) as Array<Record<string, unknown>>;
        }

        const authoritative = pickAuthoritativeResponsesByQuestion(
          (responses ?? []) as Array<
            MarkingResponse & {
              response_cells?: MarkingResponse["cells"];
            }
          >,
        );
        structuredResponses = [...authoritative.values()].map((r) => ({
          ...r,
          cells: Array.isArray(r.response_cells)
            ? r.response_cells
            : (r.cells ?? []),
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
        assignmentComments = commentRows.map((row) => {
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
            available_for_annotation: Boolean(row.available_for_annotation),
            mark_range_min:
              row.mark_range_min == null ? null : Number(row.mark_range_min),
            mark_range_max:
              row.mark_range_max == null ? null : Number(row.mark_range_max),
            assessment_objective:
              typeof row.assessment_objective === "string"
                ? row.assessment_objective
                : null,
          };
        });
      }
    } catch {
      structuredSections = null;
    }
  }

  const isStructured = Boolean(structuredSections);
  const navItems = nav?.items ?? [];
  const navIndex = nav?.index ?? -1;
  const navTotal = nav?.total ?? 0;
  const prevSubmissionId =
    navIndex > 0 ? navItems[navIndex - 1]?.submissionId ?? null : null;
  const nextSubmissionId =
    navIndex >= 0 && navIndex < navTotal - 1
      ? navItems[navIndex + 1]?.submissionId ?? null
      : null;

  const selectedStampIds = new Set(
    (stampSelectionsResult.selections ?? [])
      .filter((s) => s.enabled)
      .map((s) => s.stamp_id),
  );
  const activeStamps = (stampsResult.stamps ?? []).filter(
    (stamp) => selectedStampIds.size === 0 || selectedStampIds.has(stamp.id),
  );

  // Keep archived stamps that historical annotations still reference.
  const annotationStampIds = Array.from(
    new Set(
      (annotationsResult.annotations ?? [])
        .map((a) => a.stamp_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  let stampsForWorkspace: MarkingStamp[] = activeStamps;
  if (annotationStampIds.length) {
    const missing = annotationStampIds.filter(
      (id) => !stampsForWorkspace.some((s) => s.id === id),
    );
    if (missing.length) {
      const archived = await listMarkingStampsAction({
        includeArchived: true,
      });
      const extras = (archived.stamps ?? []).filter((s) =>
        missing.includes(s.id),
      );
      stampsForWorkspace = [...stampsForWorkspace, ...extras];
    }
  }

  const circularThreshold = Number(
    (assignment as { circular_mark_threshold?: number }).circular_mark_threshold ??
      10,
  );
  const allowDecimalMarks = Boolean(
    (assignment as { allow_decimal_question_marks?: boolean })
      .allow_decimal_question_marks,
  );
  const annotationDefaultVisibility =
    (assignment as { annotation_default_visibility?: "teacher_only" | "student_visible" })
      .annotation_default_visibility ?? "teacher_only";

  return (
    <div className={isStructured ? "" : "space-y-4"}>
      {isStructured && structuredSections ? (
        <DocumentMarkingWorkspace
          submissionId={submissionId}
          assignmentId={assignment.id}
          classId={assignment.class_id}
          className={className}
          maximumMark={Number(assignment.maximum_mark)}
          feedback={(feedback as Feedback | null) ?? null}
          sections={structuredSections}
          responses={structuredResponses}
          resources={resources}
          markSchemes={markSchemes}
          commentBanks={commentBanks}
          assignmentComments={assignmentComments}
          feedbackFields={feedbackFields}
          feedbackFieldValues={feedbackFieldValues}
          commentBankItems={commentBankItems}
          studentName={student?.display_name ?? ""}
          assignmentTitle={assignment.title}
          submissionStatus={submission.status}
          submittedAt={submission.submitted_at}
          navIndex={navIndex}
          navTotal={navTotal}
          prevSubmissionId={prevSubmissionId}
          nextSubmissionId={nextSubmissionId}
          unmarkedOnly={unmarkedOnly}
          initialAnnotations={annotationsResult.annotations ?? []}
          initialQuestionMarks={questionMarksResult.marks ?? []}
          stamps={stampsForWorkspace}
          circularThreshold={circularThreshold}
          allowDecimalMarks={allowDecimalMarks}
          annotationDefaultVisibility={annotationDefaultVisibility}
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
              fields={feedbackFields}
              fieldValues={feedbackFieldValues}
              commentItems={commentBankItems}
              studentName={student?.display_name ?? ""}
              assignmentTitle={assignment.title}
            />
          </Card>
        </div>
      )}
    </div>
  );
}
