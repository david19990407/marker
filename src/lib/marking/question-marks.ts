import type { BuilderBlock } from "@/lib/types";
import type {
  QuestionMarkRecord,
  QuestionMarkingMode,
  QuestionMarkingStatus,
} from "./annotation-types";

export function inferMarkingMode(block: BuilderBlock): QuestionMarkingMode {
  if (block.review_only) return "reviewed";
  if (
    block.block_type === "multiple_choice" ||
    block.block_type === "multiple_select"
  ) {
    return "auto_mcq";
  }
  if (block.max_marks == null || Number(block.max_marks) <= 0) {
    return "comment_only";
  }
  return "numeric";
}

export function deriveMarkingStatus(input: {
  mode: QuestionMarkingMode;
  awardedMark: number | null;
  reviewState: QuestionMarkRecord["review_state"];
  feedback: string | null;
  flagged: boolean;
}): QuestionMarkingStatus {
  if (input.flagged) return "flagged";
  if (input.mode === "not_applicable") return "not_applicable";
  if (input.mode === "numeric" || input.mode === "auto_mcq") {
    return input.awardedMark == null ? "unmarked" : "marked";
  }
  if (input.mode === "reviewed") {
    return input.reviewState && input.reviewState !== "not_reviewed"
      ? "marked"
      : "unmarked";
  }
  if (input.mode === "comment_only") {
    return String(input.feedback ?? "").trim() ? "marked" : "unmarked";
  }
  return "unmarked";
}

/** True only when the teacher has completed marking (not merely awarded 0). */
export function isQuestionMarkingComplete(
  record: QuestionMarkRecord | undefined,
): boolean {
  if (!record) return false;
  return (
    record.marking_status === "marked" || record.marking_status === "flagged"
  );
}

/** Display like `3/4`, `0/1`, or `-/4` when unmarked. */
export function formatQuestionMarkProgress(
  record: QuestionMarkRecord | undefined,
  maximumMark: number,
): string {
  const max = Number(maximumMark ?? 0);
  if (!isQuestionMarkingComplete(record)) return `-/${max}`;
  const awarded = Number(record?.awarded_mark ?? record?.override_mark ?? 0);
  return `${awarded}/${max}`;
}

export function sumAwardedMarks(
  records: QuestionMarkRecord[],
): { awarded: number; maximumCompleted: number; markedCount: number } {
  let awarded = 0;
  let maximumCompleted = 0;
  let markedCount = 0;
  for (const row of records) {
    if (!isQuestionMarkingComplete(row)) continue;
    markedCount += 1;
    awarded += Number(row.awarded_mark ?? row.override_mark ?? 0);
    maximumCompleted += Number(row.maximum_mark ?? 0);
  }
  return { awarded, maximumCompleted, markedCount };
}

export function nextUnmarkedQuestionId(
  questionIds: string[],
  recordsByQuestion: Map<string, QuestionMarkRecord>,
  currentId: string | null,
): string | null {
  const start = currentId ? questionIds.indexOf(currentId) + 1 : 0;
  for (let i = 0; i < questionIds.length; i += 1) {
    const idx = (start + i) % questionIds.length;
    const id = questionIds[idx]!;
    const record = recordsByQuestion.get(id);
    if (!isQuestionMarkingComplete(record)) return id;
  }
  return null;
}

export function listIncompleteQuestionLabels(
  questionIds: string[],
  labelsByQuestion: Map<string, string>,
  recordsByQuestion: Map<string, QuestionMarkRecord>,
): string[] {
  return questionIds
    .filter((id) => !isQuestionMarkingComplete(recordsByQuestion.get(id)))
    .map((id, index) => labelsByQuestion.get(id) ?? `Question ${index + 1}`);
}
