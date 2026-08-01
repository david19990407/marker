import type {
  AssignmentMarkingSummary,
  AssignmentSubmissionRow,
  ClassMarkingSummary,
  MarkingAssignmentFilter,
  MarkingClassSort,
  MarkingSubmissionFilter,
  MarkingSubmissionSort,
  SubmissionNavItem,
} from "@/lib/marking/types";

export function isUnmarkedStatus(status: string): boolean {
  return status === "submitted" || status === "late";
}

export function isMarkedStatus(status: string): boolean {
  return status === "marked" || status === "returned";
}

export function sortClassSummaries(
  items: ClassMarkingSummary[],
  sort: MarkingClassSort = "oldest",
): ClassMarkingSummary[] {
  return [...items].sort((a, b) => {
    switch (sort) {
      case "name":
        return a.className.localeCompare(b.className, "en-GB");
      case "unmarked":
        return b.unmarkedCount - a.unmarkedCount || a.className.localeCompare(b.className);
      case "recent": {
        const an = a.newestSubmittedAt ?? "";
        const bn = b.newestSubmittedAt ?? "";
        return bn.localeCompare(an) || a.className.localeCompare(b.className);
      }
      case "oldest":
      default: {
        // Classes with unmarked work first, oldest waiting first.
        if (a.unmarkedCount === 0 && b.unmarkedCount > 0) return 1;
        if (b.unmarkedCount === 0 && a.unmarkedCount > 0) return -1;
        const ao = a.oldestUnmarkedAt ?? "9999";
        const bo = b.oldestUnmarkedAt ?? "9999";
        return ao.localeCompare(bo) || a.className.localeCompare(b.className);
      }
    }
  });
}

export function assignmentFilterBucket(
  summary: Pick<
    AssignmentMarkingSummary,
    "unmarkedCount" | "markedCount" | "returnedCount" | "submittedCount" | "dueAt"
  >,
  nowMs: number,
): MarkingAssignmentFilter {
  if (summary.unmarkedCount > 0 && summary.markedCount + summary.returnedCount > 0) {
    return "partial";
  }
  if (summary.unmarkedCount > 0) return "unmarked";
  if (
    summary.submittedCount > 0 &&
    summary.unmarkedCount === 0 &&
    summary.markedCount + summary.returnedCount >= summary.submittedCount
  ) {
    return "completed";
  }
  if (
    summary.dueAt &&
    new Date(summary.dueAt).getTime() < nowMs &&
    summary.unmarkedCount > 0
  ) {
    return "overdue";
  }
  if (summary.unmarkedCount === 0) return "completed";
  return "unmarked";
}

export function filterAssignmentSummaries(
  items: AssignmentMarkingSummary[],
  filter: MarkingAssignmentFilter,
  nowMs: number,
): AssignmentMarkingSummary[] {
  if (filter === "all") return items;
  return items.filter((item) => {
    if (filter === "overdue") {
      return (
        Boolean(item.dueAt) &&
        new Date(item.dueAt!).getTime() < nowMs &&
        item.unmarkedCount > 0
      );
    }
    if (filter === "partial") {
      return item.unmarkedCount > 0 && item.markedCount + item.returnedCount > 0;
    }
    if (filter === "unmarked") return item.unmarkedCount > 0;
    if (filter === "completed") {
      return item.unmarkedCount === 0 && item.submittedCount > 0;
    }
    return true;
  });
}

export function sortAssignmentSummaries(
  items: AssignmentMarkingSummary[],
): AssignmentMarkingSummary[] {
  return [...items].sort((a, b) => {
    // Unmarked work first.
    if (a.unmarkedCount > 0 && b.unmarkedCount === 0) return -1;
    if (b.unmarkedCount > 0 && a.unmarkedCount === 0) return 1;
    const ao = a.oldestUnmarkedAt ?? "9999";
    const bo = b.oldestUnmarkedAt ?? "9999";
    if (ao !== bo) return ao.localeCompare(bo);
    return (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999");
  });
}

export function filterSubmissionRows(
  rows: AssignmentSubmissionRow[],
  filter: MarkingSubmissionFilter,
): AssignmentSubmissionRow[] {
  if (filter === "all") return rows;
  return rows.filter((row) => {
    switch (filter) {
      case "unmarked":
        return isUnmarkedStatus(row.status);
      case "marked":
        return row.status === "marked";
      case "returned":
        return row.status === "returned";
      case "late":
        return row.isLate || row.status === "late";
      case "not_submitted":
        return !row.submissionId || row.status === "draft";
      default:
        return true;
    }
  });
}

function surnameKey(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1] ?? name).toLowerCase();
}

export function sortSubmissionRows(
  rows: AssignmentSubmissionRow[],
  sort: MarkingSubmissionSort = "submitted_at",
): AssignmentSubmissionRow[] {
  return [...rows].sort((a, b) => {
    // Default: unmarked before marked, then earliest submitted.
    const aUnmarked = isUnmarkedStatus(a.status) ? 0 : 1;
    const bUnmarked = isUnmarkedStatus(b.status) ? 0 : 1;
    if (sort === "submitted_at" && aUnmarked !== bUnmarked) {
      return aUnmarked - bUnmarked;
    }

    switch (sort) {
      case "surname":
        return (
          surnameKey(a.studentName).localeCompare(surnameKey(b.studentName)) ||
          a.studentName.localeCompare(b.studentName)
        );
      case "status":
        return a.status.localeCompare(b.status) || surnameKey(a.studentName).localeCompare(surnameKey(b.studentName));
      case "late": {
        const al = a.isLate || a.status === "late" ? 0 : 1;
        const bl = b.isLate || b.status === "late" ? 0 : 1;
        return al - bl || (a.submittedAt ?? "").localeCompare(b.submittedAt ?? "");
      }
      case "submitted_at":
      default:
        return (
          (a.submittedAt ?? "9999").localeCompare(b.submittedAt ?? "9999") ||
          surnameKey(a.studentName).localeCompare(surnameKey(b.studentName))
        );
    }
  });
}

/** Ordered list for prev/next: earliest submitted unmarked first by default. */
export function sortNavItems(
  items: SubmissionNavItem[],
  unmarkedOnly = false,
): SubmissionNavItem[] {
  const filtered = unmarkedOnly
    ? items.filter((i) => isUnmarkedStatus(i.status))
    : items;
  return [...filtered].sort((a, b) => {
    const aUnmarked = isUnmarkedStatus(a.status) ? 0 : 1;
    const bUnmarked = isUnmarkedStatus(b.status) ? 0 : 1;
    if (aUnmarked !== bUnmarked) return aUnmarked - bUnmarked;
    return (
      (a.submittedAt ?? "9999").localeCompare(b.submittedAt ?? "9999") ||
      a.studentName.localeCompare(b.studentName)
    );
  });
}

export function adjacentSubmissionIds(
  ordered: SubmissionNavItem[],
  currentId: string,
): { previousId: string | null; nextId: string | null; index: number; total: number } {
  const index = ordered.findIndex((i) => i.submissionId === currentId);
  if (index < 0) {
    return { previousId: null, nextId: null, index: -1, total: ordered.length };
  }
  return {
    previousId: ordered[index - 1]?.submissionId ?? null,
    nextId: ordered[index + 1]?.submissionId ?? null,
    index,
    total: ordered.length,
  };
}
