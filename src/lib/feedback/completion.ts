import type { AssignmentFeedbackField, FeedbackFieldValue } from "./types";

export function isFeedbackFieldFilled(
  field: AssignmentFeedbackField,
  value: FeedbackFieldValue | undefined,
): boolean {
  if (!value) return false;
  switch (field.field_type) {
    case "tick_box":
      return value.boolean_value != null;
    case "numeric_score":
      return value.numeric_value != null && Number.isFinite(value.numeric_value);
    case "grade":
    case "dropdown":
    case "comment_bank_selector":
    case "plain_text":
    case "rich_text":
    case "teacher_only_note":
      return Boolean(String(value.text_value ?? "").trim());
    case "rubric": {
      if (value.json_value && typeof value.json_value === "object") {
        return Object.keys(value.json_value as object).length > 0;
      }
      return Boolean(String(value.text_value ?? "").trim());
    }
    default:
      return false;
  }
}

export function evaluateFeedbackCompletion(
  fields: AssignmentFeedbackField[],
  values: FeedbackFieldValue[],
): {
  requiredCount: number;
  completedRequiredCount: number;
  trackedCount: number;
  completedTrackedCount: number;
  isComplete: boolean;
  missingLabels: string[];
} {
  const byKey = new Map(values.map((v) => [v.field_key, v]));
  const byId = new Map(values.map((v) => [v.field_id, v]));
  const required = fields.filter((f) => f.is_required && f.tracks_completion);
  const tracked = fields.filter((f) => f.tracks_completion);
  const missingLabels: string[] = [];

  let completedRequiredCount = 0;
  for (const field of required) {
    const value = byId.get(field.id) ?? byKey.get(field.field_key);
    if (isFeedbackFieldFilled(field, value)) completedRequiredCount += 1;
    else missingLabels.push(field.label);
  }

  let completedTrackedCount = 0;
  for (const field of tracked) {
    const value = byId.get(field.id) ?? byKey.get(field.field_key);
    if (isFeedbackFieldFilled(field, value)) completedTrackedCount += 1;
  }

  return {
    requiredCount: required.length,
    completedRequiredCount,
    trackedCount: tracked.length,
    completedTrackedCount,
    isComplete: missingLabels.length === 0,
    missingLabels,
  };
}

export function legacyFeedbackToFieldValues(input: {
  strengths?: string | null;
  improvements?: string | null;
  next_steps?: string | null;
  private_notes?: string | null;
  fields: AssignmentFeedbackField[];
}): FeedbackFieldValue[] {
  const map: Record<string, string | null | undefined> = {
    strengths: input.strengths,
    improvements: input.improvements,
    next_steps: input.next_steps,
    private_notes: input.private_notes,
  };
  return input.fields.map((field) => {
    const legacy = map[field.field_key];
    return {
      field_id: field.id,
      field_key: field.field_key,
      text_value: legacy ?? null,
      numeric_value: null,
      boolean_value: null,
      json_value: null,
    };
  });
}
