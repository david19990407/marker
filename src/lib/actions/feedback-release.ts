"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/auth";
import {
  isQuestionMarkingComplete,
  listIncompleteQuestionLabels,
} from "@/lib/marking/question-marks";
import type { QuestionMarkRecord } from "@/lib/marking/annotation-types";

async function assertCanMarkSubmission(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profile: { id: string; role: string },
  submissionId: string,
) {
  const { data: submission } = await supabase
    .from("submissions")
    .select(
      "id, student_id, assignment_id, status, assignments!inner(id, teacher_id, title, class_id, maximum_mark, template_id)",
    )
    .eq("id", submissionId)
    .maybeSingle();

  const assignment = Array.isArray(submission?.assignments)
    ? submission?.assignments[0]
    : submission?.assignments;
  if (!submission || !assignment) return null;

  if (profile.role === "admin" || assignment.teacher_id === profile.id) {
    return { submission, assignment };
  }

  const { data: co } = await supabase
    .from("class_teachers")
    .select("id")
    .eq("class_id", assignment.class_id)
    .eq("teacher_id", profile.id)
    .eq("can_mark_submissions", true)
    .maybeSingle();
  if (!co) return null;
  return { submission, assignment };
}

function mapMark(row: Record<string, unknown>): QuestionMarkRecord {
  return {
    id: String(row.id),
    submission_id: String(row.submission_id),
    question_id: String(row.question_id),
    marking_mode: (row.marking_mode as QuestionMarkRecord["marking_mode"]) ?? "numeric",
    awarded_mark: row.awarded_mark == null ? null : Number(row.awarded_mark),
    maximum_mark: Number(row.maximum_mark ?? 0),
    review_state: (row.review_state as QuestionMarkRecord["review_state"]) ?? null,
    marking_status:
      (row.marking_status as QuestionMarkRecord["marking_status"]) ?? "unmarked",
    question_feedback: (row.question_feedback as string | null) ?? null,
    teacher_only_note: (row.teacher_only_note as string | null) ?? null,
    automatic_mark:
      row.automatic_mark == null ? null : Number(row.automatic_mark),
    override_mark: row.override_mark == null ? null : Number(row.override_mark),
    override_reason: (row.override_reason as string | null) ?? null,
    flagged: Boolean(row.flagged),
    client_version: Number(row.client_version ?? 1),
  };
}

export async function validateSubmissionReadyToReleaseAction(
  submissionId: string,
  questionIds: string[],
  labelsByQuestion: Record<string, string>,
): Promise<
  ActionResult & {
    ready?: boolean;
    incomplete?: string[];
    totalAwarded?: number;
  }
> {
  const profile = await requireProfile(["teacher", "admin"]);
  const supabase = await createClient();
  const access = await assertCanMarkSubmission(supabase, profile, submissionId);
  if (!access) return { error: "Submission not found" };

  const { data: marks } = await supabase
    .from("question_marks")
    .select("*")
    .eq("submission_id", submissionId);

  const map = new Map(
    (marks ?? []).map((row) => {
      const m = mapMark(row as Record<string, unknown>);
      return [m.question_id, m] as const;
    }),
  );
  const labelMap = new Map(Object.entries(labelsByQuestion));
  const incomplete = listIncompleteQuestionLabels(questionIds, labelMap, map);
  const totalAwarded = [...map.values()]
    .filter(isQuestionMarkingComplete)
    .reduce((sum, row) => sum + Number(row.awarded_mark ?? 0), 0);

  return {
    ready: incomplete.length === 0 && questionIds.length > 0,
    incomplete:
      questionIds.length === 0
        ? ["No assessable questions found"]
        : incomplete,
    totalAwarded,
  };
}

async function performRelease(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profile: { id: string },
  submission: { id: string; student_id: string; assignment_id: string; status: string },
  assignment: {
    id: string;
    class_id: string;
    title: string;
  },
  totalAwarded: number,
) {
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("feedback")
    .select("id, release_version")
    .eq("submission_id", submission.id)
    .maybeSingle();

  const nextVersion = Number(existing?.release_version ?? 0) + 1;
  const payload = {
    submission_id: submission.id,
    teacher_id: profile.id,
    mark: totalAwarded,
    status: "released" as const,
    released_at: now,
    released_by: profile.id,
    release_version: nextVersion,
  };

  let { error } = await supabase
    .from("feedback")
    .upsert(payload, { onConflict: "submission_id" });

  if (error && /released_by|release_version/i.test(error.message)) {
    const fallback = await supabase.from("feedback").upsert(
      {
        submission_id: submission.id,
        teacher_id: profile.id,
        mark: totalAwarded,
        status: "released",
        released_at: now,
      },
      { onConflict: "submission_id" },
    );
    error = fallback.error;
  }
  if (error) return { error: error.message };

  await supabase
    .from("submissions")
    .update({
      status: "marked",
      marked_at: now,
      returned_at: now,
    })
    .eq("id", submission.id);

  await supabase.from("notifications").insert({
    user_id: submission.student_id,
    type: "feedback_released",
    title: "Feedback released",
    body: assignment.title,
    link_path: `/student/homework/${submission.assignment_id}`,
  });

  return {
    success: existing ? "Feedback re-released" : "Feedback released to student",
    releasedAt: now,
    releaseVersion: nextVersion,
  };
}

export async function releaseSubmissionFeedbackAction(
  submissionId: string,
  options?: {
    questionIds?: string[];
    labelsByQuestion?: Record<string, string>;
  },
): Promise<
  ActionResult & {
    releasedAt?: string;
    releaseVersion?: number;
    incomplete?: string[];
  }
> {
  const profile = await requireProfile(["teacher", "admin"]);
  const supabase = await createClient();
  const access = await assertCanMarkSubmission(supabase, profile, submissionId);
  if (!access) return { error: "Submission not found" };

  const { submission, assignment } = access;
  if (!["submitted", "late", "marked", "returned"].includes(submission.status)) {
    return { error: "Submission is not ready for release" };
  }

  const questionIds = options?.questionIds ?? [];
  if (questionIds.length) {
    const check = await validateSubmissionReadyToReleaseAction(
      submissionId,
      questionIds,
      options?.labelsByQuestion ?? {},
    );
    if (!check.ready) {
      return {
        error: "Marking is incomplete",
        incomplete: check.incomplete,
      };
    }
  } else {
    const { data: marks } = await supabase
      .from("question_marks")
      .select("marking_status, awarded_mark")
      .eq("submission_id", submissionId);
    if (
      !(marks ?? []).length ||
      (marks ?? []).some(
        (m) =>
          !isQuestionMarkingComplete({
            marking_status: m.marking_status,
          } as QuestionMarkRecord),
      )
    ) {
      return { error: "Marking is incomplete", incomplete: ["Unmarked questions remain"] };
    }
  }

  const { data: marks } = await supabase
    .from("question_marks")
    .select("awarded_mark, marking_status")
    .eq("submission_id", submissionId);
  const totalAwarded = (marks ?? [])
    .filter((row) =>
      isQuestionMarkingComplete({
        marking_status: row.marking_status,
      } as QuestionMarkRecord),
    )
    .reduce((sum, row) => sum + Number(row.awarded_mark ?? 0), 0);

  const result = await performRelease(
    supabase,
    profile,
    submission,
    assignment,
    totalAwarded,
  );
  if ("error" in result && result.error) return { error: result.error };

  revalidatePath("/teacher/marking");
  revalidatePath(`/teacher/marking/submissions/${submissionId}`);
  revalidatePath(
    `/teacher/marking/classes/${assignment.class_id}/assignments/${assignment.id}`,
  );
  revalidatePath(`/student/homework/assignments/${submission.assignment_id}`);

  return result;
}

export async function bulkReleaseFeedbackAction(
  assignmentId: string,
  submissionIds: string[],
): Promise<
  ActionResult & {
    results?: Array<{
      submissionId: string;
      ok: boolean;
      message: string;
    }>;
  }
> {
  const profile = await requireProfile(["teacher", "admin"]);
  const supabase = await createClient();
  const unique = [...new Set(submissionIds.filter(Boolean))];
  if (!unique.length) return { error: "Select at least one submission" };

  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, class_id, teacher_id, title")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment) return { error: "Assignment not found" };

  if (profile.role !== "admin" && assignment.teacher_id !== profile.id) {
    const { data: co } = await supabase
      .from("class_teachers")
      .select("id")
      .eq("class_id", assignment.class_id)
      .eq("teacher_id", profile.id)
      .eq("can_mark_submissions", true)
      .maybeSingle();
    if (!co) return { error: "Assignment not found" };
  }

  const results: Array<{ submissionId: string; ok: boolean; message: string }> =
    [];

  for (const submissionId of unique) {
    const released = await releaseSubmissionFeedbackAction(submissionId);
    results.push({
      submissionId,
      ok: !released.error,
      message: released.error ?? released.success ?? "Released",
    });
  }

  const okCount = results.filter((r) => r.ok).length;
  revalidatePath(
    `/teacher/marking/classes/${assignment.class_id}/assignments/${assignmentId}`,
  );
  return {
    success: `Released ${okCount} of ${results.length} submissions`,
    results,
  };
}
