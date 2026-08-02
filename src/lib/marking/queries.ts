import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adjacentSubmissionIds,
  assignmentFilterBucket,
  filterAssignmentSummaries,
  filterSubmissionRows,
  isUnmarkedStatus,
  sortAssignmentSummaries,
  sortClassSummaries,
  sortNavItems,
  sortSubmissionRows,
} from "@/lib/marking/sort";
import type {
  AssignmentMarkingSummary,
  AssignmentProgress,
  AssignmentSubmissionRow,
  ClassMarkingSummary,
  MarkingAssignmentFilter,
  MarkingClassSort,
  MarkingSubmissionFilter,
  MarkingSubmissionSort,
  SubmissionNavItem,
} from "@/lib/marking/types";
import { currentTimeMs } from "@/lib/utils/time";

type DbClient = SupabaseClient;

async function accessibleClassIds(
  supabase: DbClient,
  profile: { id: string; role: string },
): Promise<string[]> {
  if (profile.role === "admin") {
    const { data } = await supabase
      .from("classes")
      .select("id")
      .eq("archived", false);
    return (data ?? []).map((c) => c.id);
  }

  const [{ data: owned }, { data: co }] = await Promise.all([
    supabase
      .from("classes")
      .select("id")
      .eq("teacher_id", profile.id)
      .eq("archived", false),
    supabase
      .from("class_teachers")
      .select("class_id")
      .eq("teacher_id", profile.id)
      .eq("can_mark_submissions", true),
  ]);

  return Array.from(
    new Set([
      ...(owned ?? []).map((c) => c.id),
      ...(co ?? []).map((c) => c.class_id),
    ]),
  );
}

export async function assertTeacherCanMarkClass(
  supabase: DbClient,
  profile: { id: string; role: string },
  classId: string,
): Promise<boolean> {
  if (profile.role === "admin") return true;
  const ids = await accessibleClassIds(supabase, profile);
  return ids.includes(classId);
}

/** Teacher marking dashboard: class summaries only. */
export async function loadMarkingDashboard(
  supabase: DbClient,
  profile: { id: string; role: string },
  sort: MarkingClassSort = "oldest",
): Promise<ClassMarkingSummary[]> {
  const classIds = await accessibleClassIds(supabase, profile);
  if (!classIds.length) return [];

  const { data: classes } = await supabase
    .from("classes")
    .select(
      "id, name, subject, year_group, subject_id, colour_hex, school_subjects(id, name, icon_type, icon_value, icon_key, icon_storage_path, colour)",
    )
    .in("id", classIds)
    .eq("archived", false);

  const { data: assignments } = await supabase
    .from("assignments")
    .select("id, class_id")
    .in("class_id", classIds)
    .neq("status", "archived");

  const assignmentIds = (assignments ?? []).map((a) => a.id);
  const byClassAssignments = new Map<string, string[]>();
  for (const a of assignments ?? []) {
    const list = byClassAssignments.get(a.class_id) ?? [];
    list.push(a.id);
    byClassAssignments.set(a.class_id, list);
  }

  const { data: submissions } = assignmentIds.length
    ? await supabase
        .from("submissions")
        .select("id, assignment_id, status, submitted_at")
        .in("assignment_id", assignmentIds)
        .in("status", ["submitted", "late", "marked", "returned"])
    : { data: [] as Array<{
        id: string;
        assignment_id: string;
        status: string;
        submitted_at: string | null;
      }> };

  const summaries = (classes ?? []).map((cls) => {
    const subjectRel = Array.isArray(cls.school_subjects)
      ? cls.school_subjects[0]
      : cls.school_subjects;
    const classAssignmentIds = new Set(byClassAssignments.get(cls.id) ?? []);
    const classSubs = (submissions ?? []).filter((s) =>
      classAssignmentIds.has(s.assignment_id),
    );
    const unmarked = classSubs.filter((s) => isUnmarkedStatus(s.status));
    const assignmentsWithUnmarked = new Set(
      unmarked.map((s) => s.assignment_id),
    ).size;
    const oldestUnmarkedAt = unmarked
      .map((s) => s.submitted_at)
      .filter(Boolean)
      .sort()[0] ?? null;
    const newestSubmittedAt = classSubs
      .map((s) => s.submitted_at)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

    return {
      classId: cls.id,
      className: cls.name,
      subject: subjectRel?.name ?? cls.subject ?? "Subject",
      yearGroup: cls.year_group,
      subjectId: cls.subject_id,
      subjectIconType: subjectRel?.icon_type ?? null,
      subjectIconValue:
        subjectRel?.icon_value ||
        subjectRel?.icon_storage_path ||
        subjectRel?.icon_key ||
        null,
      subjectColour: subjectRel?.colour ?? cls.colour_hex ?? null,
      assignmentsWithUnmarked,
      unmarkedCount: unmarked.length,
      oldestUnmarkedAt,
      newestSubmittedAt,
    } satisfies ClassMarkingSummary;
  });

  return sortClassSummaries(summaries, sort);
}

/** Assignments for one class with marking counts. */
export async function loadClassMarkingAssignments(
  supabase: DbClient,
  profile: { id: string; role: string },
  classId: string,
  filter: MarkingAssignmentFilter = "all",
): Promise<{
  className: string;
  assignments: AssignmentMarkingSummary[];
} | null> {
  const allowed = await assertTeacherCanMarkClass(supabase, profile, classId);
  if (!allowed) return null;

  const { data: cls } = await supabase
    .from("classes")
    .select("id, name")
    .eq("id", classId)
    .maybeSingle();
  if (!cls) return null;

  const [{ data: assignments }, { data: members }] = await Promise.all([
    supabase
      .from("assignments")
      .select("id, title, due_at, status, class_id")
      .eq("class_id", classId)
      .neq("status", "archived")
      .order("due_at", { ascending: true }),
    supabase
      .from("class_members")
      .select("student_id")
      .eq("class_id", classId),
  ]);

  const totalStudents = (members ?? []).length;
  const assignmentIds = (assignments ?? []).map((a) => a.id);

  const { data: submissions } = assignmentIds.length
    ? await supabase
        .from("submissions")
        .select("id, assignment_id, status, submitted_at, student_id")
        .in("assignment_id", assignmentIds)
    : { data: [] as Array<{
        id: string;
        assignment_id: string;
        status: string;
        submitted_at: string | null;
        student_id: string;
      }> };

  const nowMs = currentTimeMs();
  const rows: AssignmentMarkingSummary[] = (assignments ?? []).map((a) => {
    const subs = (submissions ?? []).filter((s) => s.assignment_id === a.id);
    const unmarked = subs.filter((s) => isUnmarkedStatus(s.status));
    const marked = subs.filter((s) => s.status === "marked");
    const returned = subs.filter((s) => s.status === "returned");
    const submitted = subs.filter((s) =>
      ["submitted", "late", "marked", "returned"].includes(s.status),
    );
    const submittedStudentIds = new Set(submitted.map((s) => s.student_id));
    const summary = {
      assignmentId: a.id,
      title: a.title,
      dueAt: a.due_at,
      classId: a.class_id,
      status: a.status,
      totalStudents,
      submittedCount: submitted.length,
      unmarkedCount: unmarked.length,
      markedCount: marked.length,
      returnedCount: returned.length,
      notSubmittedCount: Math.max(0, totalStudents - submittedStudentIds.size),
      oldestUnmarkedAt:
        unmarked
          .map((s) => s.submitted_at)
          .filter(Boolean)
          .sort()[0] ?? null,
      filterBucket: "all" as MarkingAssignmentFilter,
    };
    summary.filterBucket = assignmentFilterBucket(summary, nowMs);
    return summary;
  });

  const filtered = filterAssignmentSummaries(rows, filter, nowMs);
  return {
    className: cls.name,
    assignments: sortAssignmentSummaries(filtered),
  };
}

export async function loadAssignmentSubmissionList(
  supabase: DbClient,
  profile: { id: string; role: string },
  assignmentId: string,
  options?: {
    filter?: MarkingSubmissionFilter;
    sort?: MarkingSubmissionSort;
  },
): Promise<{
  assignment: {
    id: string;
    title: string;
    dueAt: string | null;
    classId: string;
    className: string;
  };
  progress: AssignmentProgress;
  rows: AssignmentSubmissionRow[];
} | null> {
  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, title, due_at, class_id, classes(name)")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment) return null;

  const allowed = await assertTeacherCanMarkClass(
    supabase,
    profile,
    assignment.class_id,
  );
  if (!allowed) return null;

  const classRel = assignment.classes as
    | { name: string }
    | { name: string }[]
    | null;
  const className = Array.isArray(classRel)
    ? classRel[0]?.name
    : classRel?.name;

  const [{ data: members }, { data: submissions }] = await Promise.all([
    supabase
      .from("class_members")
      .select("student_id, student:profiles!class_members_student_id_fkey(id, display_name)")
      .eq("class_id", assignment.class_id),
    supabase
      .from("submissions")
      .select(
        "id, student_id, status, submitted_at, marked_at, updated_at, feedback(mark, status, released_at)",
      )
      .eq("assignment_id", assignmentId),
  ]);

  const byStudent = new Map(
    (submissions ?? []).map((s) => [s.student_id, s]),
  );
  const submissionIds = (submissions ?? []).map((s) => s.id);
  const { data: markRows } = submissionIds.length
    ? await supabase
        .from("question_marks")
        .select("submission_id, marking_status")
        .in("submission_id", submissionIds)
    : { data: [] as Array<{ submission_id: string; marking_status: string }> };

  const marksBySubmission = new Map<string, string[]>();
  for (const row of markRows ?? []) {
    const list = marksBySubmission.get(row.submission_id) ?? [];
    list.push(String(row.marking_status));
    marksBySubmission.set(row.submission_id, list);
  }

  const rows: AssignmentSubmissionRow[] = (members ?? []).map((m) => {
    const student = Array.isArray(m.student) ? m.student[0] : m.student;
    const sub = byStudent.get(m.student_id);
    const feedback = sub
      ? Array.isArray(sub.feedback)
        ? sub.feedback[0]
        : sub.feedback
      : null;
    const status = sub?.status ?? "draft";
    const statuses = sub ? marksBySubmission.get(sub.id) ?? [] : [];
    const markingReady =
      statuses.length > 0 &&
      statuses.every((s) => s === "marked" || s === "flagged");
    const releasedAt =
      feedback && "released_at" in (feedback as object)
        ? ((feedback as { released_at?: string | null }).released_at ?? null)
        : null;
    const feedbackStatus = feedback?.status ?? null;
    const updatedSinceRelease = Boolean(
      releasedAt &&
        sub?.updated_at &&
        new Date(sub.updated_at).getTime() > new Date(releasedAt).getTime(),
    );
    let displayStatus = "Not submitted";
    if (!sub?.id || status === "draft") displayStatus = "Not submitted";
    else if (feedbackStatus === "released" && updatedSinceRelease) {
      displayStatus = "Updated since release";
    } else if (feedbackStatus === "released") displayStatus = "Released";
    else if (markingReady) displayStatus = "Ready to release";
    else if (status === "submitted" || status === "late") displayStatus = "Marking";
    else if (status === "marked" || status === "returned") displayStatus = "Marking";
    else displayStatus = "Submitted";

    return {
      submissionId: sub?.id ?? null,
      studentId: m.student_id,
      studentName: student?.display_name ?? "Student",
      status,
      submittedAt: sub?.submitted_at ?? null,
      isLate: status === "late",
      mark: feedback?.mark != null ? Number(feedback.mark) : null,
      feedbackStatus,
      releasedAt,
      markingReady,
      updatedSinceRelease,
      displayStatus,
    };
  });

  const filter = options?.filter ?? "all";
  const sort = options?.sort ?? "submitted_at";
  const filtered = filterSubmissionRows(rows, filter);
  const ordered = sortSubmissionRows(filtered, sort);

  const progress: AssignmentProgress = {
    totalStudents: rows.length,
    submitted: rows.filter((r) =>
      ["submitted", "late", "marked", "returned"].includes(r.status),
    ).length,
    unmarked: rows.filter((r) => isUnmarkedStatus(r.status)).length,
    marked: rows.filter((r) => r.status === "marked").length,
    returned: rows.filter((r) => r.status === "returned").length,
    notSubmitted: rows.filter((r) => !r.submissionId || r.status === "draft")
      .length,
  };

  return {
    assignment: {
      id: assignment.id,
      title: assignment.title,
      dueAt: assignment.due_at,
      classId: assignment.class_id,
      className: className ?? "Class",
    },
    progress,
    rows: ordered,
  };
}

export async function loadSubmissionNavigation(
  supabase: DbClient,
  profile: { id: string; role: string },
  assignmentId: string,
  currentSubmissionId: string,
  unmarkedOnly = false,
): Promise<{
  previousId: string | null;
  nextId: string | null;
  index: number;
  total: number;
  items: SubmissionNavItem[];
} | null> {
  const list = await loadAssignmentSubmissionList(supabase, profile, assignmentId, {
    filter: "all",
    sort: "submitted_at",
  });
  if (!list) return null;

  const items: SubmissionNavItem[] = list.rows
    .filter((r) => r.submissionId)
    .map((r) => ({
      submissionId: r.submissionId!,
      studentId: r.studentId,
      studentName: r.studentName,
      status: r.status,
      submittedAt: r.submittedAt,
    }));

  const ordered = sortNavItems(items, unmarkedOnly);
  const adj = adjacentSubmissionIds(ordered, currentSubmissionId);
  return { ...adj, items: ordered };
}
