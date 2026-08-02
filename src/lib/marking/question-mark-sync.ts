/** Pure helpers for question-mark autosave / stale-response protection. */

import type { QuestionMarkRecord } from "./annotation-types";

/**
 * Apply a server mark row only when it is not older than the local draft.
 * Prevents out-of-order save responses from deleting newer typed feedback.
 */
export function mergeServerMarkIfFresh(
  local: QuestionMarkRecord | undefined,
  server: QuestionMarkRecord,
  latestMutationId: number,
  responseMutationId: number,
): QuestionMarkRecord {
  if (responseMutationId !== latestMutationId) {
    // A newer local edit is already in flight / applied — keep local.
    return local ?? server;
  }
  if (local && local.client_version > server.client_version) {
    return local;
  }
  if (
    local &&
    local.client_version === server.client_version &&
    (local.question_feedback ?? "") !== (server.question_feedback ?? "")
  ) {
    // Same version but local text differs (in-progress typing before version bump landed).
    return {
      ...server,
      question_feedback: local.question_feedback,
      teacher_only_note: local.teacher_only_note,
      flagged: local.flagged,
      awarded_mark: local.awarded_mark,
      review_state: local.review_state,
      marking_status: local.marking_status,
    };
  }
  return server;
}

export function appendFeedbackText(
  existing: string | null | undefined,
  text: string,
): string {
  return [existing?.trim(), text.trim()].filter(Boolean).join("\n\n");
}

export const QUESTION_FEEDBACK_DEBOUNCE_MS = 450;
