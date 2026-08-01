import { isSubmissionStatusComplete } from "@/lib/homework/completion";

export type TeacherHomeworkBucket =
  | "draft"
  | "scheduled"
  | "active"
  | "closed"
  | "archived";

export type StudentHomeworkBucket =
  | "overdue"
  | "current"
  | "scheduled"
  | "completed";

export interface OrderableAssignment {
  id: string;
  status: string;
  due_at: string | null;
  release_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

export function teacherBucket(
  a: OrderableAssignment,
  nowMs: number,
): TeacherHomeworkBucket {
  if (a.status === "archived") return "archived";
  if (a.status === "draft") return "draft";
  if (
    a.status === "published" &&
    a.release_at &&
    new Date(a.release_at).getTime() > nowMs
  ) {
    return "scheduled";
  }
  if (
    a.status === "published" &&
    a.due_at &&
    new Date(a.due_at).getTime() < nowMs
  ) {
    return "closed";
  }
  if (a.status === "published") return "active";
  return "closed";
}

const TEACHER_BUCKET_ORDER: TeacherHomeworkBucket[] = [
  "draft",
  "scheduled",
  "active",
  "closed",
  "archived",
];

export function sortTeacherAssignments<T extends OrderableAssignment>(
  items: T[],
  nowMs: number,
): T[] {
  return [...items].sort((a, b) => {
    const ba = teacherBucket(a, nowMs);
    const bb = teacherBucket(b, nowMs);
    const bucketDiff =
      TEACHER_BUCKET_ORDER.indexOf(ba) - TEACHER_BUCKET_ORDER.indexOf(bb);
    if (bucketDiff !== 0) return bucketDiff;

    if (ba === "draft") {
      return (b.updated_at ?? b.created_at ?? "").localeCompare(
        a.updated_at ?? a.created_at ?? "",
      );
    }
    if (ba === "scheduled") {
      return (a.release_at ?? "").localeCompare(b.release_at ?? "");
    }
    if (ba === "active") {
      return (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999");
    }
    // closed / archived — most recent due date first
    return (b.due_at ?? "").localeCompare(a.due_at ?? "");
  });
}

export function studentBucket(
  a: OrderableAssignment & { submissionStatus?: string | null },
  nowMs: number,
): StudentHomeworkBucket {
  // Completed = submitted/late/marked. Returned stays incomplete for rework.
  if (isSubmissionStatusComplete(a.submissionStatus)) {
    return "completed";
  }
  if (
    a.release_at &&
    new Date(a.release_at).getTime() > nowMs
  ) {
    return "scheduled";
  }
  const incomplete =
    !a.submissionStatus ||
    ["draft", "returned"].includes(a.submissionStatus);
  if (
    incomplete &&
    a.due_at &&
    new Date(a.due_at).getTime() < nowMs
  ) {
    return "overdue";
  }
  if (incomplete) return "current";
  return "completed";
}

const STUDENT_BUCKET_ORDER: StudentHomeworkBucket[] = [
  "overdue",
  "current",
  "scheduled",
  "completed",
];

export function sortStudentAssignments<
  T extends OrderableAssignment & { submissionStatus?: string | null; updated_at?: string | null },
>(items: T[], nowMs: number): T[] {
  return [...items].sort((a, b) => {
    const ba = studentBucket(a, nowMs);
    const bb = studentBucket(b, nowMs);
    const bucketDiff =
      STUDENT_BUCKET_ORDER.indexOf(ba) - STUDENT_BUCKET_ORDER.indexOf(bb);
    if (bucketDiff !== 0) return bucketDiff;

    if (ba === "overdue" || ba === "current") {
      return (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999");
    }
    if (ba === "scheduled") {
      return (a.release_at ?? "").localeCompare(b.release_at ?? "");
    }
    return (b.updated_at ?? b.due_at ?? "").localeCompare(
      a.updated_at ?? a.due_at ?? "",
    );
  });
}
