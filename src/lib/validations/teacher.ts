import { z } from "zod";
import { YEAR_GROUPS } from "@/lib/types";

const yearGroupField = z
  .union([z.enum(YEAR_GROUPS), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

export const teacherClassSchema = z.object({
  name: z.string().trim().min(1, "Class name is required").max(120),
  subject: z.string().trim().min(1).max(80).default("English"),
  year_group: yearGroupField,
});

export const assignmentSchema = z.object({
  class_id: z.string().uuid("Select a class"),
  title: z.string().trim().min(1, "Title is required").max(200),
  instructions: z.string().trim().max(20000).default(""),
  due_at: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v).toISOString() : null)),
  maximum_mark: z.coerce.number().positive().max(1000).default(30),
  allow_text_submission: z.boolean(),
  allow_file_submission: z.boolean(),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
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
