"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BLOCK_TYPE_LABELS } from "@/lib/types";
import type { AssignmentBlockType } from "@/lib/types";

const PALETTE_GROUPS: { label: string; types: AssignmentBlockType[] }[] = [
  {
    label: "Content",
    types: [
      "heading",
      "subheading",
      "instruction",
      "rich_text",
      "passage",
      "image",
      "embedded_video",
      "downloadable_resource",
      "divider",
      "page_break",
    ],
  },
  {
    label: "Questions",
    types: [
      "numbered_question",
      "short_text",
      "extended_writing",
      "numeric",
      "multiple_choice",
      "multiple_select",
      "tick_box",
      "file_upload",
      "scanned_homework_upload",
      "table",
      "vocabulary_table",
    ],
  },
  {
    label: "Teacher only",
    types: [
      "teacher_instruction",
      "teacher_review",
      "mark_scheme",
      "moderation_note",
      "staff_resource",
    ],
  },
];

interface Props {
  onAdd: (type: AssignmentBlockType) => void;
}

export function BlockPalette({ onAdd }: Props) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        + Add block
      </Button>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">Choose a block type</p>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          ✕
        </Button>
      </div>
      <div className="space-y-3">
        {PALETTE_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
              {group.label}
            </p>
            <div className="flex flex-wrap gap-2">
              {group.types.map((type) => (
                <Button
                  key={type}
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    onAdd(type);
                    setOpen(false);
                  }}
                >
                  {BLOCK_TYPE_LABELS[type]}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
