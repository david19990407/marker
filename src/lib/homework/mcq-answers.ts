import {
  getMcqOptionText,
  mcqOptionHasText,
} from "@/lib/homework/mcq-options";
import { resolveMcqOptions } from "@/lib/homework/structure";
import type { BuilderBlock, McqOption } from "@/lib/types";

export type McqAnswerJson = {
  kind: "mcq";
  option_ids: string[];
};

export function isMcqAnswerJson(value: unknown): value is McqAnswerJson {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    obj.kind === "mcq" &&
    Array.isArray(obj.option_ids) &&
    obj.option_ids.every((id) => typeof id === "string")
  );
}

export function buildMcqAnswerJson(optionIds: string[]): McqAnswerJson {
  return {
    kind: "mcq",
    option_ids: [...new Set(optionIds.filter(Boolean))],
  };
}

/** Resolve selected option IDs from stored response (json preferred, text fallback). */
export function selectedMcqOptionIds(
  block: BuilderBlock,
  response?: {
    text_value?: string | null;
    json_value?: unknown;
  } | null,
): string[] {
  const options = resolveMcqOptions(block);
  if (!response) return [];

  if (isMcqAnswerJson(response.json_value)) {
    const allowed = new Set(options.map((o) => o.id));
    return response.json_value.option_ids.filter((id) => allowed.has(id));
  }

  // Legacy: answer texts stored in text_value (single or newline-separated).
  const texts = (response.text_value ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (texts.length === 0) return [];

  const byText = new Map<string, McqOption>();
  for (const option of options) {
    const text = getMcqOptionText(option).trim();
    if (text && !byText.has(text)) byText.set(text, option);
  }
  return texts
    .map((text) => byText.get(text)?.id)
    .filter((id): id is string => Boolean(id));
}

export function labelsForOptionIds(
  block: BuilderBlock,
  optionIds: string[],
): string[] {
  const options = resolveMcqOptions(block);
  const byId = new Map(options.map((o) => [o.id, getMcqOptionText(o)]));
  return optionIds
    .map((id) => byId.get(id))
    .filter((text): text is string => Boolean(text && text.trim()));
}

export function mcqTextValueFromIds(
  block: BuilderBlock,
  optionIds: string[],
): string | null {
  const texts = labelsForOptionIds(block, optionIds);
  if (texts.length === 0) return null;
  return texts.join("\n");
}

/** Options with answer text — empty placeholder rows are omitted for students. */
export function studentVisibleMcqOptions(block: BuilderBlock): McqOption[] {
  return resolveMcqOptions(block).filter((o) => mcqOptionHasText(o));
}
