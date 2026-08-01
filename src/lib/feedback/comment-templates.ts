import type { DeterministicCommentCriteria } from "./types";

/**
 * Deterministic comment generation from teacher-entered criteria.
 * No paid AI / LLM calls — templates only.
 */
export function generateDeterministicComment(
  criteria: DeterministicCommentCriteria,
): {
  strengths: string;
  improvements: string;
  next_steps: string;
  combined: string;
} {
  const name = criteria.studentName?.trim() || "You";
  const assignment =
    criteria.assignmentTitle?.trim() || "this homework";

  const strengths = joinBullets(
    criteria.strengths,
    `${name} completed ${assignment} with care.`,
    (item) => `${name} showed strength in ${item}.`,
  );

  const improvements = joinBullets(
    criteria.improvements,
    `There are clear opportunities to improve ${assignment}.`,
    (item) => `Focus next on ${item}.`,
  );

  const next_steps = joinBullets(
    criteria.nextSteps,
    `Review the feedback and resubmit improvements where allowed.`,
    (item) => `Next step: ${item}.`,
  );

  return {
    strengths,
    improvements,
    next_steps,
    combined: [strengths, improvements, next_steps].filter(Boolean).join("\n\n"),
  };
}

function joinBullets(
  items: string[] | undefined,
  fallback: string,
  mapItem: (item: string) => string,
): string {
  const cleaned = (items ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
  if (!cleaned.length) return fallback;
  return cleaned.map(mapItem).join(" ");
}

/** Prevent inserting the same comment text twice into a field. */
export function appendCommentWithoutDuplicate(
  current: string,
  incoming: string,
): { next: string; inserted: boolean } {
  const addition = incoming.trim();
  if (!addition) return { next: current, inserted: false };
  const existing = current.trim();
  if (!existing) return { next: addition, inserted: true };
  const normalisedExisting = existing.toLowerCase();
  const normalisedIncoming = addition.toLowerCase();
  if (
    normalisedExisting.includes(normalisedIncoming) ||
    normalisedExisting
      .split(/\n+/)
      .some((line) => line.trim().toLowerCase() === normalisedIncoming)
  ) {
    return { next: current, inserted: false };
  }
  return { next: `${existing}\n\n${addition}`, inserted: true };
}

export function filterCommentBankItems<
  T extends {
    title: string;
    short_label: string;
    full_text: string;
    category: string;
    tags: string[];
    tone: string;
    year_group?: string | null;
    subject?: string | null;
    mark_range_min?: number | null;
    mark_range_max?: number | null;
    is_active: boolean;
    bank_scope?: string;
    is_favourite?: boolean;
  },
>(
  items: T[],
  filters: {
    search?: string;
    tone?: string | null;
    category?: string | null;
    scope?: string | null;
    yearGroup?: string | null;
    subject?: string | null;
    favouritesOnly?: boolean;
    mark?: number | null;
  },
): T[] {
  const q = filters.search?.trim().toLowerCase() ?? "";
  return items.filter((item) => {
    if (!item.is_active) return false;
    if (filters.favouritesOnly && !item.is_favourite) return false;
    if (filters.tone && item.tone !== filters.tone) return false;
    if (filters.category && item.category !== filters.category) return false;
    if (filters.scope && item.bank_scope !== filters.scope) return false;
    if (
      filters.yearGroup &&
      item.year_group &&
      item.year_group !== filters.yearGroup
    ) {
      return false;
    }
    if (
      filters.subject &&
      item.subject &&
      item.subject.toLowerCase() !== filters.subject.toLowerCase()
    ) {
      return false;
    }
    if (filters.mark != null && Number.isFinite(filters.mark)) {
      if (
        item.mark_range_min != null &&
        filters.mark < Number(item.mark_range_min)
      ) {
        return false;
      }
      if (
        item.mark_range_max != null &&
        filters.mark > Number(item.mark_range_max)
      ) {
        return false;
      }
    }
    if (!q) return true;
    const hay = [
      item.title,
      item.short_label,
      item.full_text,
      item.category,
      ...(item.tags ?? []),
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}
