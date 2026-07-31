import { z } from "zod";

export const joinClassSchema = z.object({
  join_code: z
    .string()
    .trim()
    .min(4, "Enter a join code")
    .max(12)
    .transform((v) => v.toUpperCase()),
});

export const submissionDraftSchema = z.object({
  written_response: z.string().max(50000).optional().nullable(),
});
