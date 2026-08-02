import type { SupabaseClient } from "@supabase/supabase-js";

export type DraftSubmissionRow = {
  id: string;
  assignment_id: string;
  student_id: string;
  status: string;
  submitted_at?: string | null;
  written_response?: string | null;
  file_name?: string | null;
  storage_path?: string | null;
};

/**
 * Find the student's submission for an assignment, or create a draft if
 * the assignment is open and none exists. Idempotent under the unique
 * (assignment_id, student_id) constraint.
 */
export async function ensureDraftSubmission(
  supabase: SupabaseClient,
  assignmentId: string,
  studentId: string,
): Promise<{ submission: DraftSubmissionRow | null; error?: string }> {
  const { data: existing, error: loadError } = await supabase
    .from("submissions")
    .select("*")
    .eq("assignment_id", assignmentId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (loadError) {
    return { submission: null, error: loadError.message };
  }
  if (existing) {
    return { submission: existing as DraftSubmissionRow };
  }

  const { data: created, error: createError } = await supabase
    .from("submissions")
    .insert({
      assignment_id: assignmentId,
      student_id: studentId,
      status: "draft",
    })
    .select("*")
    .single();

  if (!createError && created) {
    return { submission: created as DraftSubmissionRow };
  }

  // Concurrent create: unique constraint race — re-read.
  if (createError && /duplicate|unique/i.test(createError.message)) {
    const { data: raced, error: raceError } = await supabase
      .from("submissions")
      .select("*")
      .eq("assignment_id", assignmentId)
      .eq("student_id", studentId)
      .maybeSingle();
    if (raceError) return { submission: null, error: raceError.message };
    if (raced) return { submission: raced as DraftSubmissionRow };
  }

  return {
    submission: null,
    error: createError?.message ?? "Could not create draft submission",
  };
}
