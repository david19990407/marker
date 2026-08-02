import type { BuilderBlock, BuilderSection } from "@/lib/types";
import { flattenStudentBlocks } from "@/lib/homework/structure";
import { isAssessableStudentBlock } from "@/lib/homework/completion";

/**
 * Expand scanned-homework Mode B subquestions into assessable marking targets.
 * Mode A (no subquestions) keeps the parent upload block as the single target.
 */
export function expandAssessableBlocks(
  sections: BuilderSection[],
): BuilderBlock[] {
  const flat = flattenStudentBlocks(sections).filter(isAssessableStudentBlock);
  const out: BuilderBlock[] = [];

  for (const block of flat) {
    const subs = block.scannedUploadConfig?.subquestions ?? [];
    if (block.block_type === "scanned_homework_upload" && subs.length > 0) {
      const ordered = [...subs].sort(
        (a, b) => a.display_order - b.display_order,
      );
      for (const sub of ordered) {
        out.push({
          ...block,
          _id: `${block._id}:${sub.id}`,
          question_id: sub.id,
          content: sub.title || sub.question_label || block.content,
          prompt: sub.description || block.prompt,
          max_marks: sub.maximum_mark,
          required: sub.is_required,
          marks_apply: sub.include_in_total,
          mark_scheme_note: sub.marking_guidance || block.mark_scheme_note,
          scannedUploadConfig: {
            ...(block.scannedUploadConfig ?? {
              maximum_files: 5,
              maximum_file_size_bytes: 15 * 1024 * 1024,
              allowed_mime_types: [],
              combine_images_to_pdf: true,
              allow_images: true,
              allow_pdf: true,
              allow_docx: false,
              allow_replacement: true,
              subquestions: [],
            }),
            parent_block_id: block._id,
          },
        });
      }
      continue;
    }
    out.push(block);
  }

  return out;
}

export function parentScannedUploadBlockId(
  block: BuilderBlock | null | undefined,
): string | null {
  if (!block || block.block_type !== "scanned_homework_upload") return null;
  return block.scannedUploadConfig?.parent_block_id ?? block._id;
}
