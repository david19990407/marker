import { z } from "zod";

export const structuredResponseSchema = z.object({
  question_id: z.string().uuid(),
  text_value: z.string().max(100000).nullable().optional(),
  numeric_value: z.number().finite().nullable().optional(),
  boolean_value: z.boolean().nullable().optional(),
  json_value: z.unknown().optional(),
  /** Autosave / client version; older writes must not overwrite newer answers. */
  client_version: z.number().int().nonnegative().optional(),
  cells: z
    .array(
      z.object({
        row_index: z.number().int().min(0).max(100),
        col_index: z.number().int().min(0).max(50),
        text_value: z.string().max(20000).nullable().optional(),
        numeric_value: z.number().finite().nullable().optional(),
        boolean_value: z.boolean().nullable().optional(),
      }),
    )
    .max(2000)
    .optional(),
});

export const structuredResponsesSchema = z
  .array(structuredResponseSchema)
  .max(500);
