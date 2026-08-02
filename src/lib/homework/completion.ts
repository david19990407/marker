import { selectedMcqOptionIds } from "@/lib/homework/mcq-answers";
import {
  flattenStudentBlocks,
  isResponseType,
  responseKey,
} from "@/lib/homework/structure";
import type { BuilderBlock, BuilderSection } from "@/lib/types";

/** Snapshot of a stored or in-flight structured response. */
export type ResponseSnapshot = {
  question_id: string;
  text_value?: string | null;
  numeric_value?: number | null;
  boolean_value?: boolean | null;
  json_value?: unknown;
  file_name?: string | null;
  storage_path?: string | null;
  cells?: Array<{
    row_index: number;
    col_index: number;
    text_value?: string | null;
    numeric_value?: number | null;
    boolean_value?: boolean | string | null;
  }>;
};

/** Per-question completion classification for UI and marking. */
export type QuestionAnswerState =
  | "answered"
  | "unanswered"
  | "not_applicable"
  | "review_only";

export type QuestionCompletion = {
  block: BuilderBlock;
  questionId: string;
  label: string;
  required: boolean;
  answered: boolean;
  assessable: boolean;
  state: QuestionAnswerState;
};

export type CompletionResult = {
  questions: QuestionCompletion[];
  requiredCount: number;
  answeredRequiredCount: number;
  answeredAssessableCount: number;
  assessableCount: number;
  missingRequired: QuestionCompletion[];
  isComplete: boolean;
  /** Sum of max_marks for assessable questions. */
  totalMarks: number;
  /** Sum of max_marks for answered assessable questions. */
  answeredMarks: number;
};

const SUBMITTED_STATUSES = new Set([
  "submitted",
  "late",
  "marked",
]);

/** Statuses that mean the student still owes work (or rework). */
const INCOMPLETE_STATUSES = new Set(["draft", "returned"]);

export function isSubmissionStatusComplete(
  status: string | null | undefined,
): boolean {
  if (!status) return false;
  return SUBMITTED_STATUSES.has(status);
}

export function isSubmissionStatusEditable(
  status: string | null | undefined,
): boolean {
  if (!status) return true;
  return INCOMPLETE_STATUSES.has(status);
}

/** Blocks students must answer (excludes content + teacher-review-only). */
export function isAssessableStudentBlock(block: BuilderBlock): boolean {
  if (!isResponseType(block.block_type)) return false;
  if (block.teacher_only || block.student_visible === false) return false;
  if (block.block_type === "teacher_review") return false;
  if (block.review_only) return false;
  return true;
}

export function minSelectionsForBlock(block: BuilderBlock): number {
  if (block.block_type !== "multiple_select") return 0;
  if (block.min_selections != null && Number.isFinite(block.min_selections)) {
    return Math.max(0, Math.floor(block.min_selections));
  }
  return block.required ? 1 : 0;
}

function nonEmptyText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function studentEditableTableCells(block: BuilderBlock) {
  const cfg = block.tableConfig;
  const cells = block.cells ?? [];
  if (!cfg) return [];
  const startRow = cfg.header_row ? 1 : 0;
  const out: typeof cells = [];
  for (let r = startRow; r < cfg.rows; r++) {
    for (let c = 0; c < cfg.cols; c++) {
      const def = cells.find((cell) => cell.row_index === r && cell.col_index === c);
      if (!def) {
        out.push({
          row_index: r,
          col_index: c,
          cell_type: "student_text",
          label: null,
          marks: null,
          read_only: false,
        });
        continue;
      }
      if (
        def.read_only ||
        def.cell_type === "readonly" ||
        def.cell_type === "teacher_review"
      ) {
        continue;
      }
      out.push(def);
    }
  }
  return out;
}

function cellHasValue(
  cell:
    | {
        text_value?: string | null;
        numeric_value?: number | null;
        boolean_value?: boolean | string | null;
      }
    | undefined,
): boolean {
  if (!cell) return false;
  if (nonEmptyText(cell.text_value ?? null)) return true;
  if (cell.numeric_value != null && !Number.isNaN(Number(cell.numeric_value))) {
    return true;
  }
  if (cell.boolean_value != null && cell.boolean_value !== "") return true;
  return false;
}

export function isStructuredResponseAnswered(
  block: BuilderBlock,
  response?: ResponseSnapshot | null,
): boolean {
  if (!isAssessableStudentBlock(block)) return true;
  if (!response) return false;

  switch (block.block_type) {
    case "multiple_choice": {
      return selectedMcqOptionIds(block, response).length === 1;
    }
    case "multiple_select": {
      const selected = selectedMcqOptionIds(block, response);
      return selected.length >= minSelectionsForBlock(block);
    }
    case "numeric":
      return (
        response.numeric_value != null &&
        !Number.isNaN(Number(response.numeric_value))
      );
    case "tick_box":
      return response.boolean_value === true;
    case "file_upload":
    case "scanned_homework_upload": {
      const json = response.json_value as { file_count?: number } | null;
      if (json && Number(json.file_count) > 0) return true;
      return Boolean(
        response.storage_path ||
          response.file_name ||
          nonEmptyText(response.text_value),
      );
    }
    case "table":
    case "vocabulary_table": {
      const editable = studentEditableTableCells(block);
      if (editable.length === 0) return true;
      const byKey = new Map(
        (response.cells ?? []).map((c) => [`${c.row_index}:${c.col_index}`, c]),
      );
      // Required tables need every student cell; optional need at least one.
      if (block.required) {
        return editable.every((cell) =>
          cellHasValue(byKey.get(`${cell.row_index}:${cell.col_index}`)),
        );
      }
      return editable.some((cell) =>
        cellHasValue(byKey.get(`${cell.row_index}:${cell.col_index}`)),
      );
    }
    case "short_text":
    case "extended_writing":
    case "numbered_question":
    default:
      return nonEmptyText(response.text_value);
  }
}

function classifyQuestionState(
  block: BuilderBlock,
  answered: boolean,
): QuestionAnswerState {
  if (!isResponseType(block.block_type)) return "not_applicable";
  if (block.teacher_only || block.student_visible === false) {
    return "not_applicable";
  }
  if (block.block_type === "teacher_review" || block.review_only) {
    return "review_only";
  }
  return answered ? "answered" : "unanswered";
}

/**
 * Shared completion service for student UI, submit validation, and marking.
 * Counts assessable student-answerable questions only for completion totals.
 */
export function evaluateStructuredCompletion(
  sections: BuilderSection[],
  responses: ResponseSnapshot[] | Record<string, ResponseSnapshot | undefined>,
): CompletionResult {
  const byQuestion = Array.isArray(responses)
    ? new Map(responses.map((r) => [r.question_id, r]))
    : new Map(
        Object.entries(responses).map(([key, value]) => [
          value?.question_id ?? key,
          value,
        ]),
      );

  const allBlocks = flattenStudentBlocks(sections);
  const classified: QuestionCompletion[] = allBlocks.map((block, index) => {
    const questionId = block.question_id || responseKey(block);
    const response =
      byQuestion.get(questionId) ??
      byQuestion.get(responseKey(block)) ??
      null;
    const assessable = isAssessableStudentBlock(block);
    const answered = assessable
      ? isStructuredResponseAnswered(block, response)
      : false;
    return {
      block,
      questionId,
      label: block.content || block.prompt || `Question ${index + 1}`,
      required: Boolean(block.required) && assessable,
      answered,
      assessable,
      state: classifyQuestionState(block, answered),
    };
  });

  // Completion totals use assessable student-answerable questions only.
  const questions = classified.filter((q) => q.assessable);
  const required = questions.filter((q) => q.required);
  const missingRequired = required.filter((q) => !q.answered);
  const answeredRequiredCount = required.length - missingRequired.length;
  const answeredAssessableCount = questions.filter((q) => q.answered).length;
  const totalMarks = questions.reduce(
    (sum, q) => sum + Math.max(0, Number(q.block.max_marks ?? 0)),
    0,
  );
  const answeredMarks = questions
    .filter((q) => q.answered)
    .reduce((sum, q) => sum + Math.max(0, Number(q.block.max_marks ?? 0)), 0);

  return {
    questions,
    requiredCount: required.length,
    answeredRequiredCount,
    answeredAssessableCount,
    assessableCount: questions.length,
    missingRequired,
    isComplete: missingRequired.length === 0,
    totalMarks,
    answeredMarks,
  };
}

/** Legacy assignments: text and/or file depending on assignment flags. */
export function evaluateLegacyCompletion(input: {
  allowText: boolean;
  allowFile: boolean;
  writtenResponse?: string | null;
  storagePath?: string | null;
  /** Structured answers may still satisfy a mixed assignment. */
  hasStructuredAnswers?: boolean;
}): { isComplete: boolean; reason?: string } {
  const hasText = nonEmptyText(input.writtenResponse);
  const hasFile = Boolean(input.storagePath);
  const hasStructured = Boolean(input.hasStructuredAnswers);

  if (hasStructured) return { isComplete: true };

  if (input.allowText && !input.allowFile) {
    return hasText
      ? { isComplete: true }
      : { isComplete: false, reason: "Write your response before submitting" };
  }
  if (input.allowFile && !input.allowText) {
    return hasFile
      ? { isComplete: true }
      : { isComplete: false, reason: "Upload a file before submitting" };
  }
  if (hasText || hasFile) return { isComplete: true };
  return {
    isComplete: false,
    reason: "Add a written response or a file before submitting",
  };
}
