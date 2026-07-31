import { z } from "zod";
import { YEAR_GROUPS } from "@/lib/types";

const yearGroupField = z
  .union([z.enum(YEAR_GROUPS), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

export const createUserSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(80),
  last_name: z.string().trim().min(1, "Last name is required").max(80),
  email: z.string().trim().email("Invalid email address"),
  role: z.enum(["admin", "teacher", "student"]),
  year_group: yearGroupField,
  class_ids: z.array(z.string().uuid()).optional().default([]),
  send_invite: z
    .union([z.boolean(), z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v !== false && v !== "false"),
});

export const updateUserSchema = z.object({
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  role: z.enum(["admin", "teacher", "student"]),
  year_group: yearGroupField,
  is_active: z.boolean(),
  class_ids: z.array(z.string().uuid()).optional().default([]),
});

export const createClassSchema = z.object({
  name: z.string().trim().min(1, "Class name is required").max(120),
  subject: z.string().trim().min(1).max(80).default("English"),
  year_group: yearGroupField,
  teacher_id: z.string().uuid("Select a teacher"),
});

export const csvImportRowSchema = z.object({
  first_name: z.string().trim().min(1),
  last_name: z.string().trim().min(1),
  email: z.string().trim().email(),
  role: z.enum(["admin", "teacher", "student"]),
  year_group: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine(
      (v) => v === null || (YEAR_GROUPS as readonly string[]).includes(v),
      "Invalid year group",
    ),
  class_name: z.string().trim().optional().nullable(),
});

export type CsvImportRow = z.infer<typeof csvImportRowSchema>;
