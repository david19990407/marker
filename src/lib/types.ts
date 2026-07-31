export type UserRole = "admin" | "teacher" | "student";

export type AssignmentStatus = "draft" | "published" | "archived";
export type SubmissionStatus =
  | "draft"
  | "submitted"
  | "late"
  | "marked"
  | "returned";
export type FeedbackStatus = "draft" | "released";
export type ClassTeacherRole =
  | "lead_teacher"
  | "teacher"
  | "teaching_assistant"
  | "cover_teacher";

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
  colour_hex?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClassMember {
  id: string;
  class_id: string;
  student_id: string;
  joined_at: string;
}

export interface ClassTeacher {
  id: string;
  class_id: string;
  teacher_id: string;
  membership_role: ClassTeacherRole;
  can_create_assignments: boolean;
  can_mark_submissions: boolean;
  can_manage_members: boolean;
  joined_at: string;
}

export interface Assignment {
  id: string;
  class_id: string;
  teacher_id: string;
  template_id?: string | null;
  title: string;
  instructions: string;
  due_at: string | null;
  release_at?: string | null;
  maximum_mark: number;
  status: AssignmentStatus;
  allow_text_submission: boolean;
  allow_file_submission: boolean;
  sync_content_from_template?: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssignmentTemplate {
  id: string;
  created_by: string;
  title: string;
  instructions: string;
  allow_text_submission: boolean;
  allow_file_submission: boolean;
  default_maximum_mark: number;
  academic_year: string | null;
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

export interface SchoolSettings {
  id: string;
  school_name: string;
  platform_display_name: string;
  max_upload_bytes: number;
  permitted_mime_types: string[];
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SchoolSubject {
  id: string;
  name: string;
  code: string | null;
  icon_key: string;
  icon_type?: "built_in" | "upload";
  icon_value?: string;
  colour?: string;
  sort_order: number;
  is_active: boolean;
  archived_at?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface SchoolYearGroup {
  id: string;
  label: string;
  name?: string;
  code?: string | null;
  sort_order: number;
  is_active: boolean;
  archived_at?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface SchoolClassColour {
  id: string;
  name: string;
  hex: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

// ── Phase 5: Structured homework builder ───────────────────────────────────

export type AssignmentBlockType =
  | "heading"
  | "subheading"
  | "instruction"
  | "rich_text"
  | "numbered_question"
  | "short_text"
  | "extended_writing"
  | "numeric"
  | "multiple_choice"
  | "tick_box"
  | "teacher_review"
  | "file_upload"
  | "image"
  | "downloadable_resource"
  | "table"
  | "vocabulary_table"
  | "mark_scheme"
  | "page_break";

/** Block types that generate a student_responses row */
export const RESPONSE_BLOCK_TYPES: AssignmentBlockType[] = [
  "numbered_question",
  "short_text",
  "extended_writing",
  "numeric",
  "multiple_choice",
  "tick_box",
  "teacher_review",
  "file_upload",
  "table",
  "vocabulary_table",
];

export const BLOCK_TYPE_LABELS: Record<AssignmentBlockType, string> = {
  heading: "Heading",
  subheading: "Subheading",
  instruction: "Instruction",
  rich_text: "Rich text",
  numbered_question: "Numbered question",
  short_text: "Short answer",
  extended_writing: "Extended writing",
  numeric: "Numeric answer",
  multiple_choice: "Multiple choice",
  tick_box: "Tick box",
  teacher_review: "Teacher review",
  file_upload: "File upload",
  image: "Image",
  downloadable_resource: "Downloadable resource",
  table: "Table",
  vocabulary_table: "Vocabulary table",
  mark_scheme: "Mark scheme",
  page_break: "Page break",
};

export type TableCellType =
  | "student_text"
  | "student_numeric"
  | "tick"
  | "teacher_review"
  | "readonly";

export interface TableCellDef {
  row_index: number;
  col_index: number;
  cell_type: TableCellType;
  label?: string | null;
  marks?: number | null;
  read_only: boolean;
}

export interface TableConfig {
  rows: number;
  cols: number;
  header_row: boolean;
  col_labels: string[];
}

/** Client-side mutable builder block */
export interface BuilderBlock {
  _id: string;
  block_type: AssignmentBlockType;
  content: string;
  teacher_only: boolean;
  /** For response blocks */
  prompt?: string;
  max_marks?: number | null;
  required?: boolean;
  choices?: string[];
  /** For table/vocabulary_table */
  tableConfig?: TableConfig;
  cells?: TableCellDef[];
}

/** Client-side mutable builder section */
export interface BuilderSection {
  _id: string;
  title: string;
  blocks: BuilderBlock[];
  subsections: BuilderSection[];
}

// ── DB row types ─────────────────────────────────────────────────────────────

export interface AssignmentSection {
  id: string;
  template_id: string;
  parent_section_id: string | null;
  title: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AssignmentBlock {
  id: string;
  section_id: string;
  block_type: AssignmentBlockType;
  sort_order: number;
  content: string;
  config: Record<string, unknown>;
  teacher_only: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssignmentQuestion {
  id: string;
  block_id: string;
  prompt: string;
  max_marks: number | null;
  required: boolean;
  response_type: string;
  choices: string[];
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface StudentResponse {
  id: string;
  submission_id: string;
  question_id: string;
  text_value: string | null;
  numeric_value: number | null;
  boolean_value: boolean | null;
  json_value: unknown | null;
  file_name: string | null;
  storage_path: string | null;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────

export const YEAR_GROUPS = [
  "Year 7",
  "Year 8",
  "Year 9",
  "Year 10",
  "Year 11",
  "Year 12",
  "Year 13",
] as const;

export const DASHBOARD_PATH: Record<UserRole, string> = {
  admin: "/admin/dashboard",
  teacher: "/teacher/dashboard",
  student: "/student/dashboard",
};
