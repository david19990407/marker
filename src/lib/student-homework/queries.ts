import type { SupabaseClient } from "@supabase/supabase-js";
import {
  groupAssignmentsBySection,
  sortStudentAssignmentCards,
  sortSubjectSummaries,
  studentAssignmentSection,
} from "@/lib/student-homework/sort";
import type {
  StudentAssignmentCard,
  StudentAssignmentSection,
  StudentSubjectSummary,
} from "@/lib/student-homework/types";
import { currentTimeMs } from "@/lib/utils/time";

type DbClient = SupabaseClient;

export async function loadStudentSubjectSummaries(
  supabase: DbClient,
  studentId: string,
): Promise<StudentSubjectSummary[]> {
  const nowMs = currentTimeMs();

  const { data: memberships } = await supabase
    .from("class_members")
    .select("class_id")
    .eq("student_id", studentId);
  const classIds = (memberships ?? []).map((m) => m.class_id);
  if (!classIds.length) return [];

  const { data: classes } = await supabase
    .from("classes")
    .select(
      "id, name, subject, subject_id, colour_hex, school_subjects(id, name, icon_type, icon_value, icon_key, icon_storage_path, colour)",
    )
    .in("id", classIds)
    .eq("archived", false);

  const { data: assignments } = await supabase
    .from("assignments")
    .select("id, title, due_at, release_at, class_id, status")
    .in("class_id", classIds)
    .eq("status", "published");

  const released = (assignments ?? []).filter(
    (a) => !a.release_at || new Date(a.release_at).getTime() <= nowMs,
  );
  const assignmentIds = released.map((a) => a.id);

  const { data: submissions } = assignmentIds.length
    ? await supabase
        .from("submissions")
        .select("assignment_id, status, submitted_at")
        .eq("student_id", studentId)
        .in("assignment_id", assignmentIds)
    : { data: [] as Array<{
        assignment_id: string;
        status: string;
        submitted_at: string | null;
      }> };

  const byAssignment = new Map(
    (submissions ?? []).map((s) => [s.assignment_id, s]),
  );

  const bySubject = new Map<string, StudentSubjectSummary>();

  for (const cls of classes ?? []) {
    const subjectRel = Array.isArray(cls.school_subjects)
      ? cls.school_subjects[0]
      : cls.school_subjects;
    const subjectId = cls.subject_id ?? `legacy:${cls.subject || cls.id}`;
    const subjectName = subjectRel?.name ?? cls.subject ?? "Subject";
    const existing = bySubject.get(subjectId) ?? {
      subjectId,
      subjectName,
      iconType: subjectRel?.icon_type ?? "built_in",
      iconValue:
        subjectRel?.icon_value ||
        subjectRel?.icon_storage_path ||
        subjectRel?.icon_key ||
        null,
      colour: subjectRel?.colour ?? cls.colour_hex ?? null,
      dueCount: 0,
      overdueCount: 0,
      submittedCount: 0,
      nextDeadline: null as string | null,
      classIds: [] as string[],
    };
    if (!existing.classIds.includes(cls.id)) existing.classIds.push(cls.id);

    const classAssignments = released.filter((a) => a.class_id === cls.id);
    for (const a of classAssignments) {
      const sub = byAssignment.get(a.id);
      const cardLike = {
        dueAt: a.due_at,
        submissionStatus: sub?.status ?? null,
        feedbackReleased: false,
        releaseAt: a.release_at,
      };
      const section = studentAssignmentSection(cardLike, nowMs);
      if (section === "overdue") existing.overdueCount += 1;
      if (section === "due_soon" || section === "upcoming" || section === "overdue") {
        existing.dueCount += 1;
        if (
          a.due_at &&
          (!existing.nextDeadline || a.due_at < existing.nextDeadline)
        ) {
          existing.nextDeadline = a.due_at;
        }
      }
      if (section === "submitted" || section === "returned") {
        existing.submittedCount += 1;
      }
    }

    bySubject.set(subjectId, existing);
  }

  return sortSubjectSummaries(Array.from(bySubject.values()));
}

export async function loadStudentSubjectAssignments(
  supabase: DbClient,
  studentId: string,
  subjectId: string,
): Promise<{
  subject: StudentSubjectSummary | null;
  sections: Record<StudentAssignmentSection, StudentAssignmentCard[]>;
  cards: StudentAssignmentCard[];
} | null> {
  const summaries = await loadStudentSubjectSummaries(supabase, studentId);
  const subject = summaries.find((s) => s.subjectId === subjectId) ?? null;
  if (!subject) return null;

  const nowMs = currentTimeMs();
  const classIds = subject.classIds;
  if (!classIds.length) {
    return { subject, sections: groupAssignmentsBySection([]), cards: [] };
  }

  const { data: classes } = await supabase
    .from("classes")
    .select("id, name")
    .in("id", classIds);

  const classNameById = new Map((classes ?? []).map((c) => [c.id, c.name]));

  const { data: assignments } = await supabase
    .from("assignments")
    .select("id, title, due_at, release_at, class_id, status")
    .in("class_id", classIds)
    .eq("status", "published");

  const released = (assignments ?? []).filter(
    (a) => !a.release_at || new Date(a.release_at).getTime() <= nowMs,
  );
  const assignmentIds = released.map((a) => a.id);

  const { data: submissions } = assignmentIds.length
    ? await supabase
        .from("submissions")
        .select(
          "assignment_id, status, submitted_at, returned_at, feedback(mark, status, released_at)",
        )
        .eq("student_id", studentId)
        .in("assignment_id", assignmentIds)
    : { data: [] as Array<{
        assignment_id: string;
        status: string;
        submitted_at: string | null;
        returned_at: string | null;
        feedback:
          | { mark: number | null; status: string; released_at: string | null }
          | { mark: number | null; status: string; released_at: string | null }[]
          | null;
      }> };

  const byAssignment = new Map(
    (submissions ?? []).map((s) => [s.assignment_id, s]),
  );

  const cards: StudentAssignmentCard[] = released.map((a) => {
    const sub = byAssignment.get(a.id);
    const feedback = sub
      ? Array.isArray(sub.feedback)
        ? sub.feedback[0]
        : sub.feedback
      : null;
    const feedbackReleased = Boolean(
      feedback &&
        feedback.status === "released" &&
        (a && ["marked", "returned"].includes(sub?.status ?? "")),
    );
    const base = {
      assignmentId: a.id,
      title: a.title,
      classId: a.class_id,
      className: classNameById.get(a.class_id) ?? "Class",
      subjectId,
      dueAt: a.due_at,
      releaseAt: a.release_at,
      status: a.status,
      submissionStatus: sub?.status ?? null,
      submittedAt: sub?.submitted_at ?? null,
      returnedAt: sub?.returned_at ?? feedback?.released_at ?? null,
      mark: feedbackReleased && feedback?.mark != null ? Number(feedback.mark) : null,
      feedbackReleased,
      section: "upcoming" as StudentAssignmentSection,
    };
    base.section = studentAssignmentSection(base, nowMs);
    return base;
  });

  const ordered = sortStudentAssignmentCards(cards, nowMs);
  return {
    subject,
    cards: ordered,
    sections: groupAssignmentsBySection(ordered),
  };
}
