import type { BuilderBlock, McqOption, McqOptionLabelStyle } from "@/lib/types";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ROMAN = [
  "i",
  "ii",
  "iii",
  "iv",
  "v",
  "vi",
  "vii",
  "viii",
  "ix",
  "x",
  "xi",
  "xii",
  "xiii",
  "xiv",
  "xv",
  "xvi",
  "xvii",
  "xviii",
  "xix",
  "xx",
] as const;

/** Canonical answer text for an option (never the A/B/C identifier). */
export function getMcqOptionText(option: Pick<McqOption, "text" | "label">): string {
  if (typeof option.text === "string") return option.text;
  if (typeof option.label === "string") return option.label;
  return "";
}

export function mcqOptionHasText(
  option: Pick<McqOption, "text" | "label">,
): boolean {
  return getMcqOptionText(option).trim().length > 0;
}

export function normalizeOptionLabelStyle(
  raw?: string | null,
): McqOptionLabelStyle {
  if (raw === "numbers" || raw === "roman" || raw === "letters") return raw;
  return "letters";
}

export function getBlockOptionLabelStyle(
  block: Pick<BuilderBlock, "option_label_style">,
): McqOptionLabelStyle {
  return normalizeOptionLabelStyle(block.option_label_style);
}

/** Display-only identifier — never stored as answer text. */
export function formatMcqOptionIdentifier(
  index: number,
  style: McqOptionLabelStyle = "letters",
): string {
  if (index < 0) return "";
  if (style === "numbers") return String(index + 1);
  if (style === "roman") {
    return ROMAN[index] ?? String(index + 1);
  }
  if (index < LETTERS.length) return LETTERS[index];
  return String(index + 1);
}

/** Default factory labels like "Option A" — not real answer text. */
export function looksLikeOptionPlaceholder(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  return /^Option\s+[A-Z0-9]+$/i.test(v);
}

/**
 * Normalise a raw option into the shared shape.
 * Heals the old confusing editor pattern where teachers typed the answer into
 * feedback and left label as "Option A".
 */
export function normalizeMcqOption(
  raw: Partial<McqOption> & { id?: string },
  index = 0,
  idFallback?: string,
): McqOption {
  const id =
    typeof raw.id === "string" && raw.id
      ? raw.id
      : idFallback || `opt-${index}`;

  // Prefer explicit text; fall back to legacy label.
  let text =
    typeof raw.text === "string"
      ? raw.text
      : typeof raw.label === "string"
        ? raw.label
        : "";
  let feedback = typeof raw.feedback === "string" ? raw.feedback : "";

  if (feedback.trim() && looksLikeOptionPlaceholder(text)) {
    text = feedback;
    feedback = "";
  }

  return {
    id,
    text,
    // Keep label mirrored for any legacy readers during transition.
    label: text,
    feedback,
    correct: !!raw.correct,
  };
}

export function normalizeMcqOptions(
  options: Array<Partial<McqOption>> | undefined | null,
): McqOption[] {
  if (!options?.length) return [];
  return options.map((option, index) => normalizeMcqOption(option, index));
}
