export type UserRole = "admin" | "teacher" | "student";

export type AssignmentStatus = "draft" | "published" | "archived";
export type SubmissionStatus =
  | "draft"
  | "submitted"
  | "late"
  | "marked"
  | "returned";
export type FeedbackStatus = "draft" | "released";

export interface Profile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string;
  role: UserRole;
  year_group: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClassRecord {
  id: string;
  name: string;
  subject: string;
  year_group: string | null;
  teacher_id: string;
  join_code: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClassMember {
  id: string;
  class_id: string;
  student_id: string;
  joined_at: string;
}

export interface Assignment {
  id: string;
  class_id: string;
  teacher_id: string;
  title: string;
  instructions: string;
  due_at: string | null;
  maximum_mark: number;
  status: AssignmentStatus;
  allow_text_submission: boolean;
  allow_file_submission: boolean;
  created_at: string;
  updated_at: string;
}

export interface Submission {
  id: string;
  assignment_id: string;
  student_id: string;
  written_response: string | null;
  file_name: string | null;
  storage_path: string | null;
  status: SubmissionStatus;
  submitted_at: string | null;
  marked_at: string | null;
  returned_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Feedback {
  id: string;
  submission_id: string;
  teacher_id: string;
  mark: number | null;
  strengths: string | null;
  improvements: string | null;
  next_steps: string | null;
  private_notes: string | null;
  status: FeedbackStatus;
  released_at: string | null;
  created_at: string;
  updated_at: string;
}

export const YEAR_GROUPS = [
  "Year 7",
  "Year 8",
  "Year 9",
  "Year 10",
  "Year 11",
] as const;

export const DASHBOARD_PATH: Record<UserRole, string> = {
  admin: "/admin/dashboard",
  teacher: "/teacher/dashboard",
  student: "/student/dashboard",
};
