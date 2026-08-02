import type { MarkingStamp } from "@/lib/marking/annotation-types";

export type TeacherStampPreference = {
  stamp_id: string;
  display_order: number;
  is_pinned: boolean;
};

/** Apply teacher-specific order/pins without mutating the admin canonical order. */
export function orderStampsForTeacher(
  stamps: MarkingStamp[],
  preferences: TeacherStampPreference[],
): MarkingStamp[] {
  const prefById = new Map(preferences.map((p) => [p.stamp_id, p]));
  const withIndex = stamps.map((stamp, index) => {
    const pref = prefById.get(stamp.id);
    return {
      stamp,
      pinned: pref?.is_pinned ?? false,
      order:
        pref?.display_order ??
        1_000_000 + (Number.isFinite(stamp.sort_order) ? stamp.sort_order : index),
      fallback: index,
    };
  });
  withIndex.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.order !== b.order) return a.order - b.order;
    return a.fallback - b.fallback;
  });
  return withIndex.map((row) => row.stamp);
}

export function pinnedStampIds(
  preferences: TeacherStampPreference[],
): Set<string> {
  return new Set(
    preferences.filter((p) => p.is_pinned).map((p) => p.stamp_id),
  );
}

/** Frequently used / pinned stamps shown in the narrow dock (not a scroll strip). */
export function frequentToolbarStamps(
  ordered: MarkingStamp[],
  pinned: Set<string>,
  limit = 6,
): MarkingStamp[] {
  const pinnedList = ordered.filter((s) => pinned.has(s.id));
  if (pinnedList.length >= limit) return pinnedList.slice(0, limit);
  const rest = ordered.filter((s) => !pinned.has(s.id));
  return [...pinnedList, ...rest].slice(0, limit);
}
