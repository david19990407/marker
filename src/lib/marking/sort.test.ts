import { describe, expect, it } from "vitest";
import {
  adjacentSubmissionIds,
  filterSubmissionRows,
  sortAssignmentSummaries,
  sortClassSummaries,
  sortNavItems,
  sortSubmissionRows,
} from "./sort";
import type {
  AssignmentMarkingSummary,
  AssignmentSubmissionRow,
  ClassMarkingSummary,
  SubmissionNavItem,
} from "./types";

describe("marking queue sorting", () => {
  it("orders classes by oldest unmarked first", () => {
    const items: ClassMarkingSummary[] = [
      {
        classId: "b",
        className: "B",
        subject: "English",
        yearGroup: "Y10",
        subjectId: null,
        subjectIconType: null,
        subjectIconValue: null,
        subjectColour: null,
        assignmentsWithUnmarked: 1,
        unmarkedCount: 2,
        oldestUnmarkedAt: "2026-08-02T10:00:00Z",
        newestSubmittedAt: "2026-08-02T10:00:00Z",
      },
      {
        classId: "a",
        className: "A",
        subject: "Maths",
        yearGroup: "Y9",
        subjectId: null,
        subjectIconType: null,
        subjectIconValue: null,
        subjectColour: null,
        assignmentsWithUnmarked: 1,
        unmarkedCount: 1,
        oldestUnmarkedAt: "2026-08-01T09:00:00Z",
        newestSubmittedAt: "2026-08-01T09:00:00Z",
      },
      {
        classId: "c",
        className: "C",
        subject: "Science",
        yearGroup: null,
        subjectId: null,
        subjectIconType: null,
        subjectIconValue: null,
        subjectColour: null,
        assignmentsWithUnmarked: 0,
        unmarkedCount: 0,
        oldestUnmarkedAt: null,
        newestSubmittedAt: "2026-08-03T10:00:00Z",
      },
    ];
    expect(sortClassSummaries(items, "oldest").map((c) => c.classId)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("orders assignments with unmarked work first, then oldest waiting", () => {
    const items: AssignmentMarkingSummary[] = [
      {
        assignmentId: "2",
        title: "Later",
        dueAt: "2026-08-10T00:00:00Z",
        classId: "c",
        status: "published",
        totalStudents: 10,
        submittedCount: 2,
        unmarkedCount: 2,
        markedCount: 0,
        returnedCount: 0,
        notSubmittedCount: 8,
        oldestUnmarkedAt: "2026-08-02T12:00:00Z",
        filterBucket: "unmarked",
      },
      {
        assignmentId: "1",
        title: "Earlier",
        dueAt: "2026-08-05T00:00:00Z",
        classId: "c",
        status: "published",
        totalStudents: 10,
        submittedCount: 3,
        unmarkedCount: 1,
        markedCount: 2,
        returnedCount: 0,
        notSubmittedCount: 7,
        oldestUnmarkedAt: "2026-08-01T08:00:00Z",
        filterBucket: "partial",
      },
      {
        assignmentId: "3",
        title: "Done",
        dueAt: "2026-07-01T00:00:00Z",
        classId: "c",
        status: "published",
        totalStudents: 10,
        submittedCount: 10,
        unmarkedCount: 0,
        markedCount: 10,
        returnedCount: 0,
        notSubmittedCount: 0,
        oldestUnmarkedAt: null,
        filterBucket: "completed",
      },
    ];
    expect(sortAssignmentSummaries(items).map((a) => a.assignmentId)).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  it("orders students by earliest unmarked submission", () => {
    const rows: AssignmentSubmissionRow[] = [
      {
        submissionId: "s2",
        studentId: "2",
        studentName: "Zoe Adams",
        status: "submitted",
        submittedAt: "2026-08-02T10:00:00Z",
        isLate: false,
        mark: null,
        feedbackStatus: null,
      },
      {
        submissionId: "s1",
        studentId: "1",
        studentName: "Ann Brown",
        status: "submitted",
        submittedAt: "2026-08-01T10:00:00Z",
        isLate: false,
        mark: null,
        feedbackStatus: null,
      },
      {
        submissionId: "s3",
        studentId: "3",
        studentName: "Cal Cole",
        status: "marked",
        submittedAt: "2026-07-30T10:00:00Z",
        isLate: false,
        mark: 8,
        feedbackStatus: "draft",
      },
    ];
    expect(
      sortSubmissionRows(rows, "submitted_at").map((r) => r.submissionId),
    ).toEqual(["s1", "s2", "s3"]);
  });

  it("supports prev/next navigation over unmarked-only filter", () => {
    const items: SubmissionNavItem[] = [
      {
        submissionId: "a",
        studentId: "1",
        studentName: "A",
        status: "submitted",
        submittedAt: "2026-08-01T10:00:00Z",
      },
      {
        submissionId: "b",
        studentId: "2",
        studentName: "B",
        status: "marked",
        submittedAt: "2026-08-01T11:00:00Z",
      },
      {
        submissionId: "c",
        studentId: "3",
        studentName: "C",
        status: "late",
        submittedAt: "2026-08-01T12:00:00Z",
      },
    ];
    const ordered = sortNavItems(items, true);
    expect(ordered.map((i) => i.submissionId)).toEqual(["a", "c"]);
    expect(adjacentSubmissionIds(ordered, "a").nextId).toBe("c");
    expect(adjacentSubmissionIds(ordered, "c").previousId).toBe("a");
  });

  it("filters not-submitted rows", () => {
    const rows: AssignmentSubmissionRow[] = [
      {
        submissionId: null,
        studentId: "1",
        studentName: "A",
        status: "draft",
        submittedAt: null,
        isLate: false,
        mark: null,
        feedbackStatus: null,
      },
      {
        submissionId: "s",
        studentId: "2",
        studentName: "B",
        status: "submitted",
        submittedAt: "2026-08-01T10:00:00Z",
        isLate: false,
        mark: null,
        feedbackStatus: null,
      },
    ];
    expect(filterSubmissionRows(rows, "not_submitted")).toHaveLength(1);
  });
});
