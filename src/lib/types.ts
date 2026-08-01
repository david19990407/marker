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
  /** Calculated total; may be 0 when no marked questions exist yet. */
  default_maximum_mark: number;
  calculated_maximum_mark?: number | null;
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
  primary_colour?: string;
  secondary_colour?: string;
  accent_colour?: string;
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
  | "passage"
  | "numbered_question"
  | "short_text"
  | "extended_writing"
  | "numeric"
  | "multiple_choice"
  | "multiple_select"
  | "tick_box"
  | "teacher_review"
  | "file_upload"
  | "image"
  | "embedded_video"
  | "downloadable_resource"
  | "table"
  | "vocabulary_table"
  | "mark_scheme"
  | "teacher_instruction"
  | "moderation_note"
  | "staff_resource"
  | "page_break"
  | "divider";

/** Block types that generate a student_responses row */
export const RESPONSE_BLOCK_TYPES: AssignmentBlockType[] = [
  "numbered_question",
  "short_text",
  "extended_writing",
  "numeric",
  "multiple_choice",
  "multiple_select",
  "tick_box",
  "teacher_review",
  "file_upload",
  "table",
  "vocabulary_table",
];

export const BLOCK_TYPE_LABELS: Record<AssignmentBlockType, string> = {
  heading: "Heading",
  subheading: "Subheading",
  instruction: "Instructions",
  rich_text: "Rich text",
  passage: "Passage / source text",
  numbered_question: "Numbered question",
  short_text: "Short answer",
  extended_writing: "Extended writing",
  numeric: "Numeric response",
  multiple_choice: "Multiple choice",
  multiple_select: "Multiple select",
  tick_box: "Tick box",
  teacher_review: "Teacher review only",
  file_upload: "File upload",
  image: "Image",
  embedded_video: "Embedded video",
  downloadable_resource: "Downloadable resource",
  table: "Table response",
  vocabulary_table: "Vocabulary table",
  mark_scheme: "Mark-scheme note",
  teacher_instruction: "Teacher instruction",
  moderation_note: "Moderation note",
  staff_resource: "Staff-only resource",
  page_break: "Page break",
  divider: "Divider",
};

/** How option identifiers (A/B/C vs 1/2/3) are displayed — never the answer text. */
export type McqOptionLabelStyle = "letters" | "numbers" | "roman";

export type McqOption = {
  id: string;
  /** Canonical answer text shown to students. */
  text: string;
  /**
   * @deprecated Mirrored from `text` for legacy payloads. Do not treat as the
   * option identifier (A/B/C) — identifiers are display-only from label style.
   */
  label?: string;
  feedback?: string;
  correct?: boolean;
};

export type PassageLineNumberMode =
  | "none"
  | "every_line"
  | "every_5"
  | "every_10"
  | "custom_interval"
  | "manual";

export type PassageNumberingContinuation =
  | "restart"
  | "continue"
  | "custom_start";

/** Stable logical passage row — labels are typed by the teacher, never browser wrap. */
export type PassageLine = {
  id: string;
  order: number;
  text: string;
  /** Exact gutter label; blank/null means no number beside this row. */
  label?: string | null;
};

export type PassageConfig = {
  title?: string;
  source_reference?: string;
  /** Derived/compat flag — prefer line_number_mode */
  show_line_numbers: boolean;
  line_number_mode?: PassageLineNumberMode;
  line_number_interval: number;
  starting_line_number: number;
  numbering_continuation?: PassageNumberingContinuation;
  /** Authoritative logical rows with optional teacher-typed labels. */
  lines?: PassageLine[];
  /** @deprecated Legacy display set — migrated into lines[].label */
  manual_line_numbers?: number[];
  /** @deprecated Prefer lines[].label */
  numbered_line_indexes?: number[];
  /** @deprecated Prefer lines[].label */
  manual_line_labels?: Record<string, number | string>;
};

export type MediaAlignment = "left" | "center" | "right";
export type MediaDisplaySize = "small" | "medium" | "large" | "full";

/** Shared config for image / video / downloadable_resource blocks */
export type MediaConfig = {
  storage_path?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  external_url?: string | null;
  alt_text?: string | null;
  caption?: string | null;
  title?: string | null;
  description?: string | null;
  transcript?: string | null;
  alignment?: MediaAlignment;
  display_size?: MediaDisplaySize;
  allow_download?: boolean;
  resource_id?: string | null;
};

export type NumericConfig = {
  allow_decimals: boolean;
  decimal_places: number | null;
  unit: string | null;
  /** Inclusive accepted range for automatic marking */
  correct_min?: number | null;
  correct_max?: number | null;
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
  /** Persisted assignment_questions.id — generated client-side and kept stable */
  question_id?: string | null;
  block_type: AssignmentBlockType;
  /** Student-facing title */
  content: string;
  teacher_only: boolean;
  /** Student-facing instructions / prompt */
  prompt?: string;
  max_marks?: number | null;
  marks_apply?: boolean;
  required?: boolean;
  /** Legacy string choices — prefer mcq_options */
  choices?: string[];
  mcq_options?: McqOption[];
  option_feedback?: string[];
  correct_option_indexes?: number[];
  shuffle_options?: boolean;
  /** Display style for option identifiers (A/B/C, 1/2/3, i/ii/iii). */
  option_label_style?: McqOptionLabelStyle;
  /** Minimum selected options for multiple_select (default 1 when required). */
  min_selections?: number | null;
  marking_mode?: "teacher_reviewed" | "automatic";
  student_visible?: boolean;
  review_only?: boolean;
  allow_attachments?: boolean;
  teacher_note?: string | null;
  mark_scheme_note?: string | null;
  word_limit?: number | null;
  char_limit?: number | null;
  suggested_minutes?: number | null;
  min_value?: number | null;
  max_value?: number | null;
  correct_answer?: string | null;
  numericConfig?: NumericConfig;
  /** Linked passage block ids */
  passage_block_ids?: string[];
  linked_comment_bank_ids?: string[];
  passageConfig?: PassageConfig;
  mediaConfig?: MediaConfig;
  /** Video / resource URL stored in content or here */
  external_url?: string | null;
  captions_text?: string | null;
  allow_download?: boolean;
  table_marks_mode?: "none" | "per_row" | "per_cell" | "total";
  table_total_marks?: number | null;
  /** For table/vocabulary_table */
  tableConfig?: TableConfig;
  cells?: TableCellDef[];
}

export type BuilderStage =
  | "details"
  | "classes"
  | "content"
  | "resources"
  | "feedback"
  | "preview"
  | "publish";

export interface AssignmentCommentDraft {
  _id: string;
  short_label: string;
  full_comment: string;
  category: string;
  /** Primary question link (legacy column). */
  linked_question_id?: string | null;
  /** Multi-question links (preferred). */
  linked_question_ids?: string[];
  linked_section_id?: string | null;
  mark_range_min?: number | null;
  mark_range_max?: number | null;
  is_active: boolean;
  sort_order: number;
  available_for_drag_drop: boolean;
  available_for_overall: boolean;
  available_for_question: boolean;
  available_for_annotation?: boolean;
  /** Optional free-text assessment objective tag (subject-agnostic). */
  assessment_objective?: string | null;
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
  teacher_note?: string | null;
  mark_scheme_note?: string | null;
  word_limit?: number | null;
  char_limit?: number | null;
  allow_attachments?: boolean;
  min_value?: number | null;
  max_value?: number | null;
  correct_answer?: unknown | null;
  comment_bank_key?: string | null;
  review_only?: boolean;
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
  /** Client autosave version used to reject stale overwrites. */
  client_version?: number | null;
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
