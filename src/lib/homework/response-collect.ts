import {
  buildMcqAnswerJson,
  mcqTextValueFromIds,
} from "@/lib/homework/mcq-answers";
import {
  flattenStudentBlocks,
  isResponseType,
  responseKey,
} from "@/lib/homework/structure";
import type { BuilderBlock, BuilderSection } from "@/lib/types";
import type { ResponseSnapshot } from "@/lib/homework/completion";

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
  client_version?: number;
  cells?: Array<{
    row_index: number;
    col_index: number;
    text_value?: string | null;
    numeric_value?: number | null;
    boolean_value?: boolean | null;
  }>;
};

function valueToFields(
  block: BuilderBlock,
  value: CollectedResponseValue,
): Omit<CollectedStructuredResponse, "question_id"> {
  if (value.type === "mcq") {
    return {
      text_value: mcqTextValueFromIds(block, value.optionIds),
      json_value: buildMcqAnswerJson(value.optionIds),
    };
  }
  if (value.type === "text") {
    return { text_value: value.text || null };
  }
  if (value.type === "numeric") {
    return { numeric_value: value.numeric };
  }
  if (value.type === "bool") {
    return { boolean_value: value.bool };
  }
  return {
    cells: value.cells.map((c) => ({
      row_index: c.row_index,
      col_index: c.col_index,
      text_value: c.text || null,
    })),
  };
}

/**
 * Collect responses that can be persisted.
 * Only includes blocks with a real assignment_questions.id (UUID FK).
 */
export function collectResponses(
  values: Record<string, CollectedResponseValue>,
  sections: BuilderSection[],
  clientVersion?: number,
): CollectedStructuredResponse[] {
  const blocks = flattenStudentBlocks(sections).filter(
    (b) => isResponseType(b.block_type) && b.question_id,
  );
  const out: CollectedStructuredResponse[] = [];
  const skipped: string[] = [];

  for (const block of blocks) {
    const qid = block.question_id!;
    const value = values[responseKey(block)] ?? values[qid];
    if (!value) continue;
    out.push({
      question_id: qid,
      ...valueToFields(block, value),
      ...(typeof clientVersion === "number"
        ? { client_version: clientVersion }
        : {}),
    });
  }

  for (const block of flattenStudentBlocks(sections)) {
    if (!isResponseType(block.block_type) || block.question_id) continue;
    const value = values[responseKey(block)];
    if (value) skipped.push(block.content || block.prompt || block._id);
  }
  if (skipped.length && process.env.NODE_ENV !== "production") {
    console.warn(
      "[structured-homework] Answers exist for blocks without question_id; they cannot be saved:",
      skipped.slice(0, 5),
    );
  }

  return out;
}

/**
 * Build completion snapshots from local UI values.
 * Uses responseKey so live completion works even before persistence.
 */
export function valuesToCompletionSnapshots(
  values: Record<string, CollectedResponseValue>,
  sections: BuilderSection[],
): ResponseSnapshot[] {
  const blocks = flattenStudentBlocks(sections).filter((b) =>
    isResponseType(b.block_type),
  );
  const out: ResponseSnapshot[] = [];

  for (const block of blocks) {
    const key = responseKey(block);
    const value = values[key] ?? (block.question_id ? values[block.question_id] : undefined);
    if (!value) continue;
    const fields = valueToFields(block, value);
    out.push({
      question_id: block.question_id || key,
      text_value: fields.text_value ?? null,
      numeric_value: fields.numeric_value ?? null,
      boolean_value: fields.boolean_value ?? null,
      json_value: fields.json_value ?? null,
      cells: fields.cells,
    });
  }

  return out;
}

/** Blocks that have local answers but no durable question_id. */
export function collectUnpersistableAnswerLabels(
  values: Record<string, CollectedResponseValue>,
  sections: BuilderSection[],
): string[] {
  const labels: string[] = [];
  for (const block of flattenStudentBlocks(sections)) {
    if (!isResponseType(block.block_type)) continue;
    if (block.question_id) continue;
    const value = values[responseKey(block)];
    if (!value) continue;
    if (value.type === "text" && !value.text.trim()) continue;
    if (value.type === "mcq" && value.optionIds.length === 0) continue;
    if (value.type === "numeric" && value.numeric == null) continue;
    if (value.type === "table" && value.cells.every((c) => !c.text.trim())) {
      continue;
    }
    labels.push(block.content || block.prompt || "Untitled question");
  }
  return labels;
}
