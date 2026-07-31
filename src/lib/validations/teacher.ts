import { z } from "zod";
import { YEAR_GROUPS } from "@/lib/types";

const yearGroupField = z
  .union([z.enum(YEAR_GROUPS), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

const dateTimeField = z
  .string()
  .optional()
  .transform((v) => (v ? new Date(v).toISOString() : null));

export const teacherClassSchema = z.object({
  name: z.string().trim().min(1, "Class name is required").max(120),
  subject: z.string().trim().min(1).max(80).default("English"),
  year_group: yearGroupField,
});

/** Used when creating new assignments (multi-class deployment via RPC). */
export const createAssignmentSchema = z.object({
  class_ids: z
    .array(z.string().uuid())
    .min(1, "Select at least one class"),
  title: z.string().trim().min(1, "Title is required").max(200),
  instructions: z.string().trim().max(20000).default(""),
  due_at: dateTimeField,
  release_at: dateTimeField,
  maximum_mark: z.coerce.number().positive().max(1000).default(30),
  allow_text_submission: z.boolean(),
  allow_file_submission: z.boolean(),
  status: z.enum(["draft", "published"]).default("draft"),
});

/** Used when editing an existing single-class deployment. */
export const assignmentSchema = z.object({
  class_id: z.string().uuid("Select a class"),
  title: z.string().trim().min(1, "Title is required").max(200),
  instructions: z.string().trim().max(20000).default(""),
  due_at: dateTimeField,
  release_at: dateTimeField,
  maximum_mark: z.coerce.number().positive().max(1000).default(30),
  allow_text_submission: z.boolean(),
  allow_file_submission: z.boolean(),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  update_template: z
    .union([z.boolean(), z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === true || v === "true"),
});

export const feedbackSchema = z.object({
  mark: z
    .union([z.coerce.number(), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === undefined || v === null ? null : Number(v)))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0), "Invalid mark"),
  strengths: z.string().trim().max(5000).optional().nullable(),
  improvements: z.string().trim().max(5000).optional().nullable(),
  next_steps: z.string().trim().max(5000).optional().nullable(),
  private_notes: z.string().trim().max(5000).optional().nullable(),
});
