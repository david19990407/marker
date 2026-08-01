import {
  buildMcqAnswerJson,
  mcqTextValueFromIds,
} from "@/lib/homework/mcq-answers";
import {
  flattenStudentBlocks,
  isResponseType,
  responseKey,
} from "@/lib/homework/structure";
import type { BuilderSection } from "@/lib/types";

export type CollectedResponseValue =
  | { type: "text"; text: string }
  | { type: "numeric"; numeric: number | null }
  | { type: "bool"; bool: boolean }
  | { type: "mcq"; optionIds: string[] }
  | {
      type: "table";
      cells: Array<{ row_index: number; col_index: number; text: string }>;
    };

export type CollectedStructuredResponse = {
  question_id: string;
  text_value?: string | null;
  numeric_value?: number | null;
  boolean_value?: boolean | null;
  json_value?: unknown;
  cells?: Array<{
    row_index: number;
    col_index: number;
    text_value?: string | null;
    numeric_value?: number | null;
    boolean_value?: boolean | null;
  }>;
};

export function collectResponses(
  values: Record<string, CollectedResponseValue>,
  sections: BuilderSection[],
): CollectedStructuredResponse[] {
  const blocks = flattenStudentBlocks(sections).filter(
    (b) => isResponseType(b.block_type) && b.question_id,
  );
  const out: CollectedStructuredResponse[] = [];

  for (const block of blocks) {
    const qid = block.question_id!;
    const value = values[responseKey(block)];
    if (!value) continue;

    if (value.type === "mcq") {
      out.push({
        question_id: qid,
        text_value: mcqTextValueFromIds(block, value.optionIds),
        json_value: buildMcqAnswerJson(value.optionIds),
      });
    } else if (value.type === "text") {
      out.push({ question_id: qid, text_value: value.text || null });
    } else if (value.type === "numeric") {
      out.push({ question_id: qid, numeric_value: value.numeric });
    } else if (value.type === "bool") {
      out.push({ question_id: qid, boolean_value: value.bool });
    } else {
      out.push({
        question_id: qid,
        cells: value.cells.map((c) => ({
          row_index: c.row_index,
          col_index: c.col_index,
          text_value: c.text || null,
        })),
      });
    }
  }

  return out;
}
