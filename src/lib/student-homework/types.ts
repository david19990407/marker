export type StudentSubjectSummary = {
  subjectId: string;
  subjectName: string;
  iconType: string | null;
  iconValue: string | null;
  colour: string | null;
  dueCount: number;
  overdueCount: number;
  submittedCount: number;
  nextDeadline: string | null;
  classIds: string[];
};

export type StudentAssignmentSection =
  | "due_soon"
  | "upcoming"
  | "overdue"
  | "submitted"
  | "returned";

export type StudentAssignmentCard = {
  assignmentId: string;
  title: string;
  classId: string;
  className: string;
  subjectId: string;
  dueAt: string | null;
  releaseAt: string | null;
  status: string;
  submissionStatus: string | null;
  submittedAt: string | null;
  returnedAt: string | null;
  mark: number | null;
  feedbackReleased: boolean;
  section: StudentAssignmentSection;
};
