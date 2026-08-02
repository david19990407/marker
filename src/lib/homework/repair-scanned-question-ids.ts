import type { SupabaseClient } from "@supabase/supabase-js";
import type { BuilderSection } from "@/lib/types";
import { flattenStudentBlocks } from "@/lib/homework/structure";

/**
 * Ensure every scanned_homework_upload block has an assignment_questions row.
 * Writes stable IDs back onto the in-memory structure when repairs are made.
 * Idempotent — never invents IDs during student rendering of already-linked rows.
 */
export async function repairScannedHomeworkQuestionIds(
  supabase: SupabaseClient,
  sections: BuilderSection[],
): Promise<{ sections: BuilderSection[]; repaired: number }> {
  const blocks = flattenStudentBlocks(sections).filter(
    (b) => b.block_type === "scanned_homework_upload" && !b.question_id,
  );
  if (!blocks.length) {
    return { sections, repaired: 0 };
  }

  let repaired = 0;
  const idByBlock = new Map<string, string>();

  for (const block of blocks) {
    const { data: existing } = await supabase
      .from("assignment_questions")
      .select("id")
      .eq("block_id", block._id)
      .maybeSingle();

    if (existing?.id) {
      idByBlock.set(block._id, String(existing.id));
      repaired += 1;
      continue;
    }

    const maxMarks = Number(block.max_marks ?? 0);
    const insertId = crypto.randomUUID();
    const { data: created, error } = await supabase
      .from("assignment_questions")
      .insert({
        id: insertId,
        block_id: block._id,
        prompt: block.prompt || block.content || "Scanned homework upload",
        max_marks: maxMarks,
        required: Boolean(block.required),
        response_type: "scanned_homework_upload",
        choices: [],
        sort_order: 0,
        review_only: false,
        marks_apply: block.marks_apply !== false,
        marking_mode: "teacher_reviewed",
      })
      .select("id")
      .single();

    if (error) {
      // Unique on block_id — re-read.
      const { data: raced } = await supabase
        .from("assignment_questions")
        .select("id")
        .eq("block_id", block._id)
        .maybeSingle();
      if (raced?.id) {
        idByBlock.set(block._id, String(raced.id));
        repaired += 1;
      }
      continue;
    }
    if (created?.id) {
      idByBlock.set(block._id, String(created.id));
      repaired += 1;
    }
  }

  if (!idByBlock.size) {
    return { sections, repaired: 0 };
  }

  function mapBlocks(
    list: BuilderSection[],
  ): BuilderSection[] {
    return list.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) => {
        const id = idByBlock.get(block._id);
        if (!id) return block;
        return { ...block, question_id: id };
      }),
      subsections: mapBlocks(section.subsections ?? []),
    }));
  }

  return { sections: mapBlocks(sections), repaired };
}
