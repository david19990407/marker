export type MarkingClassSort =
  | "oldest"
  | "name"
  | "unmarked"
  | "recent";

export type MarkingAssignmentFilter =
  | "unmarked"
  | "partial"
  | "completed"
  | "overdue"
  | "all";

export type MarkingSubmissionFilter =
  | "unmarked"
  | "marked"
  | "returned"
  | "late"
  | "not_submitted"
  | "all";

export type MarkingSubmissionSort =
  | "submitted_at"
  | "surname"
  | "status"
  | "late";

export type ClassMarkingSummary = {
  classId: string;
  className: string;
  subject: string;
  yearGroup: string | null;
  subjectId: string | null;
  subjectIconType: string | null;
  subjectIconValue: string | null;
  subjectColour: string | null;
  assignmentsWithUnmarked: number;
  unmarkedCount: number;
  oldestUnmarkedAt: string | null;
  newestSubmittedAt: string | null;
};

export type AssignmentMarkingSummary = {
  assignmentId: string;
  title: string;
  dueAt: string | null;
  classId: string;
  status: string;
  totalStudents: number;
  submittedCount: number;
  unmarkedCount: number;
  markedCount: number;
  returnedCount: number;
  notSubmittedCount: number;
  oldestUnmarkedAt: string | null;
  filterBucket: MarkingAssignmentFilter;
};

export type AssignmentSubmissionRow = {
  submissionId: string | null;
  studentId: string;
  studentName: string;
  status: string;
  submittedAt: string | null;
  isLate: boolean;
  mark: number | null;
  feedbackStatus: string | null;
  releasedAt: string | null;
  /** True when every known question_mark row is marked/flagged. */
  markingReady: boolean;
  updatedSinceRelease: boolean;
  displayStatus: string;
};

export type AssignmentProgress = {
  totalStudents: number;
  submitted: number;
  unmarked: number;
  marked: number;
  returned: number;
  notSubmitted: number;
};

export type SubmissionNavItem = {
  submissionId: string;
  studentId: string;
  studentName: string;
  status: string;
  submittedAt: string | null;
};
