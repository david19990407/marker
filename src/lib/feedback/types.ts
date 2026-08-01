export type FeedbackFieldType =
  | "rich_text"
  | "plain_text"
  | "numeric_score"
  | "grade"
  | "tick_box"
  | "dropdown"
  | "rubric"
  | "comment_bank_selector"
  | "teacher_only_note";

export type CommentBankScope =
  | "school"
  | "department"
  | "personal"
  | "class"
  | "assignment";

export type CommentTone = "positive" | "corrective" | "neutral";

export interface AssignmentFeedbackField {
  id: string;
  template_id: string;
  field_key: string;
  label: string;
  description: string | null;
  field_type: FeedbackFieldType;
  sort_order: number;
  is_required: boolean;
  student_visible: boolean;
  teacher_only: boolean;
  max_length: number | null;
  tracks_completion: boolean;
  allow_comment_bank: boolean;
  config: FeedbackFieldConfig;
  created_at?: string;
  updated_at?: string;
}

export type FeedbackFieldConfig = {
  options?: string[];
  grades?: string[];
  rubric_criteria?: Array<{ id: string; label: string; max_score?: number }>;
  min?: number;
  max?: number;
  placeholder?: string;
};

export type FeedbackFieldValue = {
  field_id: string;
  field_key: string;
  text_value?: string | null;
  numeric_value?: number | null;
  boolean_value?: boolean | null;
  json_value?: unknown;
};

export interface CommentBank {
  id: string;
  scope: CommentBankScope;
  name: string;
  description: string | null;
  owner_id: string | null;
  department_name: string | null;
  subject: string | null;
  year_group: string | null;
  teacher_restriction_ids: string[];
  class_id: string | null;
  template_id: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface CommentBankGroup {
  id: string;
  bank_id: string;
  name: string;
  short_code: string | null;
  description: string | null;
  sort_order: number;
  linked_question_id: string | null;
  mark_range_min: number | null;
  mark_range_max: number | null;
  category: string;
  tags: string[];
  is_active: boolean;
}

export interface CommentBankItem {
  id: string;
  bank_id: string;
  group_id?: string | null;
  title: string;
  short_label: string;
  full_text: string;
  category: string;
  tags: string[];
  year_group: string | null;
  subject: string | null;
  tone: CommentTone;
  mark_range_min: number | null;
  mark_range_max: number | null;
  linked_question_id: string | null;
  is_active: boolean;
  sort_order: number;
  bank_name?: string;
  bank_scope?: CommentBankScope;
  group_name?: string | null;
  is_favourite?: boolean;
  recent_used_at?: string | null;
}

export type DeterministicCommentCriteria = {
  strengths?: string[];
  improvements?: string[];
  nextSteps?: string[];
  studentName?: string;
  assignmentTitle?: string;
};

export const FEEDBACK_FIELD_TYPE_LABELS: Record<FeedbackFieldType, string> = {
  rich_text: "Rich text",
  plain_text: "Plain text",
  numeric_score: "Numeric score",
  grade: "Grade",
  tick_box: "Tick box",
  dropdown: "Dropdown",
  rubric: "Rubric",
  comment_bank_selector: "Comment-bank selector",
  teacher_only_note: "Teacher-only note",
};

export const COMMENT_BANK_SCOPE_LABELS: Record<CommentBankScope, string> = {
  school: "School-wide",
  department: "Department",
  personal: "Personal",
  class: "Class",
  assignment: "Assignment",
};

export const COMMENT_TONE_LABELS: Record<CommentTone, string> = {
  positive: "Positive",
  corrective: "Corrective",
  neutral: "Neutral",
};

export const DEFAULT_FEEDBACK_FIELD_SEEDS: Array<
  Omit<AssignmentFeedbackField, "id" | "template_id" | "created_at" | "updated_at">
> = [
  {
    field_key: "strengths",
    label: "Strengths",
    description: "What the student did well.",
    field_type: "rich_text",
    sort_order: 10,
    is_required: false,
    student_visible: true,
    teacher_only: false,
    max_length: 5000,
    tracks_completion: true,
    allow_comment_bank: true,
    config: {},
  },
  {
    field_key: "improvements",
    label: "Improvements",
    description: "Areas to develop.",
    field_type: "rich_text",
    sort_order: 20,
    is_required: false,
    student_visible: true,
    teacher_only: false,
    max_length: 5000,
    tracks_completion: true,
    allow_comment_bank: true,
    config: {},
  },
  {
    field_key: "next_steps",
    label: "Next steps",
    description: "Actions for the student.",
    field_type: "rich_text",
    sort_order: 30,
    is_required: false,
    student_visible: true,
    teacher_only: false,
    max_length: 5000,
    tracks_completion: true,
    allow_comment_bank: true,
    config: {},
  },
  {
    field_key: "private_notes",
    label: "Teacher notes",
    description: "Private notes not shown to the student.",
    field_type: "teacher_only_note",
    sort_order: 40,
    is_required: false,
    student_visible: false,
    teacher_only: true,
    max_length: 5000,
    tracks_completion: false,
    allow_comment_bank: false,
    config: {},
  },
];
