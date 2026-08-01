import { z } from "zod";

export const feedbackFieldTypeSchema = z.enum([
  "rich_text",
  "plain_text",
  "numeric_score",
  "grade",
  "tick_box",
  "dropdown",
  "rubric",
  "comment_bank_selector",
  "teacher_only_note",
]);

export const feedbackFieldDefinitionSchema = z.object({
  id: z.string().uuid().optional(),
  field_key: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z][a-z0-9_]*$/, "Use snake_case keys starting with a letter"),
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  field_type: feedbackFieldTypeSchema,
  sort_order: z.coerce.number().int().min(0).max(10000).default(0),
  is_required: z.boolean().default(false),
  student_visible: z.boolean().default(true),
  teacher_only: z.boolean().default(false),
  max_length: z.coerce.number().int().positive().max(20000).optional().nullable(),
  tracks_completion: z.boolean().default(true),
  allow_comment_bank: z.boolean().default(true),
  config: z.record(z.string(), z.unknown()).default({}),
});

export const feedbackFieldDefinitionsSchema = z.array(
  feedbackFieldDefinitionSchema,
);

export const feedbackFieldValueSchema = z.object({
  field_id: z.string().uuid(),
  field_key: z.string().trim().min(1).max(80),
  text_value: z.string().max(20000).optional().nullable(),
  numeric_value: z
    .union([z.coerce.number(), z.literal(""), z.null()])
    .optional()
    .transform((v) =>
      v === "" || v === undefined || v === null ? null : Number(v),
    ),
  boolean_value: z.boolean().optional().nullable(),
  json_value: z.unknown().optional().nullable(),
});

export const flexibleFeedbackSaveSchema = z.object({
  mark: z
    .union([z.coerce.number(), z.literal(""), z.null()])
    .optional()
    .transform((v) =>
      v === "" || v === undefined || v === null ? null : Number(v),
    )
    .refine(
      (v) => v === null || (Number.isFinite(v) && v >= 0),
      "Invalid mark",
    ),
  field_values: z.array(feedbackFieldValueSchema).default([]),
  // Legacy fallbacks when no field defs exist yet.
  strengths: z.string().trim().max(5000).optional().nullable(),
  improvements: z.string().trim().max(5000).optional().nullable(),
  next_steps: z.string().trim().max(5000).optional().nullable(),
  private_notes: z.string().trim().max(5000).optional().nullable(),
});

export const commentBankScopeSchema = z.enum([
  "school",
  "department",
  "personal",
  "class",
  "assignment",
]);

export const commentToneSchema = z.enum([
  "positive",
  "corrective",
  "neutral",
]);

export const commentBankSchema = z.object({
  id: z.string().uuid().optional(),
  scope: commentBankScopeSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  department_name: z.string().trim().max(120).optional().nullable(),
  subject: z.string().trim().max(120).optional().nullable(),
  class_id: z.string().uuid().optional().nullable(),
  template_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().default(true),
  sort_order: z.coerce.number().int().min(0).max(10000).default(0),
});

export const commentBankItemSchema = z.object({
  id: z.string().uuid().optional(),
  bank_id: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  short_label: z.string().trim().min(1).max(80),
  full_text: z.string().trim().min(1).max(5000),
  category: z.string().trim().max(120).default(""),
  tags: z.array(z.string().trim().max(40)).max(20).default([]),
  year_group: z.string().trim().max(40).optional().nullable(),
  subject: z.string().trim().max(80).optional().nullable(),
  tone: commentToneSchema.default("neutral"),
  mark_range_min: z.coerce.number().min(0).max(1000).optional().nullable(),
  mark_range_max: z.coerce.number().min(0).max(1000).optional().nullable(),
  linked_question_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().default(true),
  sort_order: z.coerce.number().int().min(0).max(10000).default(0),
});

export const deterministicCommentCriteriaSchema = z.object({
  strengths: z.array(z.string().trim().max(200)).max(12).default([]),
  improvements: z.array(z.string().trim().max(200)).max(12).default([]),
  nextSteps: z.array(z.string().trim().max(200)).max(12).default([]),
  studentName: z.string().trim().max(120).optional(),
  assignmentTitle: z.string().trim().max(200).optional(),
});
