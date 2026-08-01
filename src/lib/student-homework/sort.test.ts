import { describe, expect, it } from "vitest";
import {
  groupAssignmentsBySection,
  sortStudentAssignmentCards,
  sortSubjectSummaries,
  studentAssignmentSection,
} from "./sort";
import type { StudentAssignmentCard, StudentSubjectSummary } from "./types";

const now = Date.parse("2026-08-01T12:00:00Z");

describe("student homework subject ordering", () => {
  it("orders subjects by overdue then nearest deadline", () => {
    const items: StudentSubjectSummary[] = [
      {
        subjectId: "sci",
        subjectName: "Science",
        iconType: "built_in",
        iconValue: "flask",
        colour: null,
        dueCount: 1,
        overdueCount: 0,
        submittedCount: 0,
        nextDeadline: "2026-08-03T00:00:00Z",
        classIds: ["1"],
      },
      {
        subjectId: "eng",
        subjectName: "English",
        iconType: "built_in",
        iconValue: "book",
        colour: null,
        dueCount: 2,
        overdueCount: 1,
        submittedCount: 0,
        nextDeadline: "2026-08-10T00:00:00Z",
        classIds: ["2"],
      },
    ];
    expect(sortSubjectSummaries(items).map((s) => s.subjectId)).toEqual([
      "eng",
      "sci",
    ]);
  });

  it("groups overdue before due soon, submitted and returned separately", () => {
    const cards: StudentAssignmentCard[] = [
      {
        assignmentId: "1",
        title: "Essay",
        classId: "c",
        className: "10A",
        subjectId: "eng",
        dueAt: "2026-07-20T00:00:00Z",
        releaseAt: null,
        status: "published",
        submissionStatus: "draft",
        submittedAt: null,
        returnedAt: null,
        mark: null,
        feedbackReleased: false,
        section: "upcoming",
      },
      {
        assignmentId: "2",
        title: "Quiz",
        classId: "c",
        className: "10A",
        subjectId: "eng",
        dueAt: "2026-08-02T00:00:00Z",
        releaseAt: null,
        status: "published",
        submissionStatus: null,
        submittedAt: null,
        returnedAt: null,
        mark: null,
        feedbackReleased: false,
        section: "upcoming",
      },
      {
        assignmentId: "3",
        title: "Done",
        classId: "c",
        className: "10A",
        subjectId: "eng",
        dueAt: "2026-07-01T00:00:00Z",
        releaseAt: null,
        status: "published",
        submissionStatus: "submitted",
        submittedAt: "2026-06-30T00:00:00Z",
        returnedAt: null,
        mark: null,
        feedbackReleased: false,
        section: "upcoming",
      },
      {
        assignmentId: "4",
        title: "Returned",
        classId: "c",
        className: "10A",
        subjectId: "eng",
        dueAt: "2026-06-01T00:00:00Z",
        releaseAt: null,
        status: "published",
        submissionStatus: "returned",
        submittedAt: "2026-05-30T00:00:00Z",
        returnedAt: "2026-06-05T00:00:00Z",
        mark: 7,
        feedbackReleased: true,
        section: "upcoming",
      },
    ];
    expect(studentAssignmentSection(cards[0], now)).toBe("overdue");
    expect(studentAssignmentSection(cards[1], now)).toBe("due_soon");
    const ordered = sortStudentAssignmentCards(cards, now);
    expect(ordered.map((c) => c.assignmentId)).toEqual(["1", "2", "3", "4"]);
    const groups = groupAssignmentsBySection(ordered);
    expect(groups.overdue).toHaveLength(1);
    expect(groups.due_soon).toHaveLength(1);
    expect(groups.submitted).toHaveLength(1);
    expect(groups.returned).toHaveLength(1);
  });
});
