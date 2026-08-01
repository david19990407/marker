import { describe, expect, it } from "vitest";
import {
  sortStudentAssignments,
  sortTeacherAssignments,
  studentBucket,
  teacherBucket,
} from "./ordering";

const now = Date.parse("2026-08-01T12:00:00Z");

describe("teacher homework ordering", () => {
  it("orders drafts, scheduled, active, then closed", () => {
    const items = [
      {
        id: "1",
        status: "published",
        due_at: "2026-07-01T00:00:00Z",
        release_at: null,
        updated_at: "2026-07-02T00:00:00Z",
      },
      {
        id: "2",
        status: "draft",
        due_at: null,
        release_at: null,
        updated_at: "2026-08-01T10:00:00Z",
      },
      {
        id: "3",
        status: "published",
        due_at: "2026-08-10T00:00:00Z",
        release_at: "2026-08-05T00:00:00Z",
        updated_at: "2026-07-20T00:00:00Z",
      },
      {
        id: "4",
        status: "published",
        due_at: "2026-08-03T00:00:00Z",
        release_at: null,
        updated_at: "2026-07-21T00:00:00Z",
      },
    ];
    expect(teacherBucket(items[2], now)).toBe("scheduled");
    expect(teacherBucket(items[3], now)).toBe("active");
    expect(sortTeacherAssignments(items, now).map((i) => i.id)).toEqual([
      "2",
      "3",
      "4",
      "1",
    ]);
  });
});

describe("student homework ordering", () => {
  it("puts overdue incomplete first, then current by due date", () => {
    const items = [
      {
        id: "a",
        status: "published",
        due_at: "2026-08-10T00:00:00Z",
        release_at: null,
        submissionStatus: "draft",
      },
      {
        id: "b",
        status: "published",
        due_at: "2026-07-20T00:00:00Z",
        release_at: null,
        submissionStatus: null,
      },
      {
        id: "c",
        status: "published",
        due_at: "2026-08-02T00:00:00Z",
        release_at: null,
        submissionStatus: "submitted",
        updated_at: "2026-07-30T00:00:00Z",
      },
    ];
    expect(studentBucket(items[1], now)).toBe("overdue");
    expect(sortStudentAssignments(items, now).map((i) => i.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });
});
