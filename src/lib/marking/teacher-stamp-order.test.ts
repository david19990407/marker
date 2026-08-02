import { describe, expect, it } from "vitest";
import {
  frequentToolbarStamps,
  orderStampsForTeacher,
  pinnedStampIds,
} from "@/lib/marking/teacher-stamp-order";
import type { MarkingStamp } from "@/lib/marking/annotation-types";

function stamp(partial: Partial<MarkingStamp> & { id: string; name: string }): MarkingStamp {
  return {
    symbol_key: partial.id,
    description: null,
    category: "general",
    accessible_label: partial.name,
    storage_path: `${partial.id}.png`,
    mime_type: "image/png",
    default_size_pct: 8,
    default_width_px: 48,
    default_height_px: 48,
    subject_restriction: null,
    teacher_restriction_ids: [],
    assignment_restriction_ids: [],
    is_active: true,
    is_palette_visible: true,
    is_internal: false,
    sort_order: 0,
    archived_at: null,
    asset_version: 1,
    current_asset_id: null,
    default_opacity: 1,
    ...partial,
  };
}

describe("orderStampsForTeacher", () => {
  it("uses teacher display_order without changing admin sort_order values", () => {
    const stamps = [
      stamp({ id: "a", name: "A", sort_order: 1 }),
      stamp({ id: "b", name: "B", sort_order: 2 }),
      stamp({ id: "c", name: "C", sort_order: 3 }),
    ];
    const ordered = orderStampsForTeacher(stamps, [
      { stamp_id: "c", display_order: 0, is_pinned: false },
      { stamp_id: "a", display_order: 1, is_pinned: false },
    ]);
    expect(ordered.map((s) => s.id)).toEqual(["c", "a", "b"]);
    expect(stamps.map((s) => s.sort_order)).toEqual([1, 2, 3]);
  });

  it("pins stamps to the top", () => {
    const stamps = [
      stamp({ id: "a", name: "A", sort_order: 1 }),
      stamp({ id: "b", name: "B", sort_order: 2 }),
    ];
    const ordered = orderStampsForTeacher(stamps, [
      { stamp_id: "b", display_order: 5, is_pinned: true },
      { stamp_id: "a", display_order: 0, is_pinned: false },
    ]);
    expect(ordered.map((s) => s.id)).toEqual(["b", "a"]);
    expect([...pinnedStampIds([{ stamp_id: "b", display_order: 5, is_pinned: true }])]).toEqual([
      "b",
    ]);
  });

  it("limits frequent toolbar stamps", () => {
    const stamps = [
      stamp({ id: "a", name: "A" }),
      stamp({ id: "b", name: "B" }),
      stamp({ id: "c", name: "C" }),
      stamp({ id: "d", name: "D" }),
    ];
    const frequent = frequentToolbarStamps(stamps, new Set(["c"]), 2);
    expect(frequent.map((s) => s.id)).toEqual(["c", "a"]);
  });
});
