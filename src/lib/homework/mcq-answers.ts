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

/** Resolve selected option IDs from stored response (json preferred, labels fallback). */
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

  // Legacy: labels stored in text_value (single or newline-separated).
  const labels = (response.text_value ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (labels.length === 0) return [];

  const byLabel = new Map<string, McqOption>();
  for (const option of options) {
    if (!byLabel.has(option.label)) byLabel.set(option.label, option);
  }
  return labels
    .map((label) => byLabel.get(label)?.id)
    .filter((id): id is string => Boolean(id));
}

export function labelsForOptionIds(
  block: BuilderBlock,
  optionIds: string[],
): string[] {
  const options = resolveMcqOptions(block);
  const byId = new Map(options.map((o) => [o.id, o.label]));
  return optionIds.map((id) => byId.get(id)).filter((l): l is string => Boolean(l));
}

export function mcqTextValueFromIds(
  block: BuilderBlock,
  optionIds: string[],
): string | null {
  const labels = labelsForOptionIds(block, optionIds);
  if (labels.length === 0) return null;
  return labels.join("\n");
}
