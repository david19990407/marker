import type { BuilderBlock, BuilderSection } from "@/lib/types";
import { isResponseType } from "@/lib/homework/structure";

/** Sum assessable marks from the builder structure (client-side). */
export function calculateTotalMarks(sections: BuilderSection[]): number {
  let total = 0;

  function visitBlock(block: BuilderBlock) {
    if (!isResponseType(block.block_type)) return;
    if (block.teacher_only) return;
    if (block.review_only) return;
    if (block.marks_apply === false) return;

    if (block.block_type === "table" || block.block_type === "vocabulary_table") {
      const mode = block.table_marks_mode ?? "none";
      if (mode === "total") {
        total += Math.max(0, Number(block.table_total_marks ?? block.max_marks ?? 0));
        return;
      }
      if (mode === "per_row" || mode === "per_cell") {
        for (const cell of block.cells ?? []) {
          if (cell.cell_type === "teacher_review") continue;
          total += Math.max(0, Number(cell.marks ?? 0));
        }
        return;
      }
      // none / fallback: use max_marks if set
      total += Math.max(0, Number(block.max_marks ?? 0));
      return;
    }

    total += Math.max(0, Number(block.max_marks ?? 0));
  }

  function visitSection(section: BuilderSection) {
    for (const block of section.blocks) visitBlock(block);
    for (const sub of section.subsections) visitSection(sub);
  }

  for (const section of sections) visitSection(section);
  return roundMarks(total);
}

export function roundMarks(value: number, allowDecimals = true): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (!allowDecimals) return Math.round(value);
  return Math.round(value * 100) / 100;
}

export function formatMarks(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}
