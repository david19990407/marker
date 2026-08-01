import { isSubmissionStatusComplete } from "@/lib/homework/completion";
import type {
  StudentAssignmentCard,
  StudentAssignmentSection,
  StudentSubjectSummary,
} from "@/lib/student-homework/types";

const DUE_SOON_MS = 7 * 24 * 60 * 60 * 1000;

export function studentAssignmentSection(
  card: Pick<
    StudentAssignmentCard,
    "dueAt" | "submissionStatus" | "feedbackReleased" | "releaseAt"
  >,
  nowMs: number,
): StudentAssignmentSection {
  if (
    card.feedbackReleased &&
    (card.submissionStatus === "marked" || card.submissionStatus === "returned")
  ) {
    return "returned";
  }
  if (isSubmissionStatusComplete(card.submissionStatus)) {
    return "submitted";
  }
  const incomplete =
    !card.submissionStatus ||
    ["draft", "returned"].includes(card.submissionStatus);
  if (
    incomplete &&
    card.dueAt &&
    new Date(card.dueAt).getTime() < nowMs
  ) {
    return "overdue";
  }
  if (
    incomplete &&
    card.dueAt &&
    new Date(card.dueAt).getTime() - nowMs <= DUE_SOON_MS
  ) {
    return "due_soon";
  }
  return "upcoming";
}

const SECTION_ORDER: StudentAssignmentSection[] = [
  "overdue",
  "due_soon",
  "upcoming",
  "submitted",
  "returned",
];

export function sortStudentAssignmentCards(
  items: StudentAssignmentCard[],
  nowMs: number,
): StudentAssignmentCard[] {
  return [...items]
    .map((item) => ({
      ...item,
      section: studentAssignmentSection(item, nowMs),
    }))
    .sort((a, b) => {
      const sectionDiff =
        SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section);
      if (sectionDiff !== 0) return sectionDiff;

      if (a.section === "overdue" || a.section === "due_soon" || a.section === "upcoming") {
        return (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999");
      }
      if (a.section === "submitted") {
        return (b.submittedAt ?? "").localeCompare(a.submittedAt ?? "");
      }
      return (b.returnedAt ?? b.submittedAt ?? "").localeCompare(
        a.returnedAt ?? a.submittedAt ?? "",
      );
    });
}

export function sortSubjectSummaries(
  items: StudentSubjectSummary[],
): StudentSubjectSummary[] {
  return [...items].sort((a, b) => {
    // Subjects with overdue work first, then nearest deadline.
    if (a.overdueCount > 0 && b.overdueCount === 0) return -1;
    if (b.overdueCount > 0 && a.overdueCount === 0) return 1;
    const an = a.nextDeadline ?? "9999";
    const bn = b.nextDeadline ?? "9999";
    if (an !== bn) return an.localeCompare(bn);
    return a.subjectName.localeCompare(b.subjectName);
  });
}

export function groupAssignmentsBySection(
  items: StudentAssignmentCard[],
): Record<StudentAssignmentSection, StudentAssignmentCard[]> {
  const groups: Record<StudentAssignmentSection, StudentAssignmentCard[]> = {
    overdue: [],
    due_soon: [],
    upcoming: [],
    submitted: [],
    returned: [],
  };
  for (const item of items) {
    groups[item.section].push(item);
  }
  return groups;
}
