import { RESPONSE_BLOCK_TYPES, type BuilderSection } from "@/lib/types";

export type AssignmentMode = "legacy" | "structured";

/**
 * Detect whether an assignment should use the structured worksheet model
 * or the legacy written-response / file-upload model.
 */
export function detectAssignmentMode(
  sections: BuilderSection[] | null | undefined,
): AssignmentMode {
  if (!sections?.length) return "legacy";

  const allBlocks = sections.flatMap((s) => [
    ...s.blocks,
    ...s.subsections.flatMap((sub) => sub.blocks),
  ]);
  const studentBlocks = allBlocks.filter(
    (b) => !b.teacher_only && b.block_type !== "mark_scheme",
  );
  if (studentBlocks.length === 0) return "legacy";

  const hasResponseBlocks = studentBlocks.some((b) =>
    (RESPONSE_BLOCK_TYPES as readonly string[]).includes(b.block_type),
  );
  if (hasResponseBlocks) return "structured";

  // Multi-block content worksheets (passages, headings, etc.) are structured.
  if (studentBlocks.length > 1) return "structured";
  if (
    studentBlocks.length === 1 &&
    studentBlocks[0].block_type !== "instruction"
  ) {
    return "structured";
  }

  return "legacy";
}

export function isStructuredAssignment(
  sections: BuilderSection[] | null | undefined,
): boolean {
  return detectAssignmentMode(sections) === "structured";
}
