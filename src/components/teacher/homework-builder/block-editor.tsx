"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableEditor } from "./table-editor";
import { BLOCK_TYPE_LABELS } from "@/lib/types";
import type { BuilderBlock } from "@/lib/types";

interface Props {
  block: BuilderBlock;
  index: number;
  total: number;
  previewMode: boolean;
  onChange: (block: BuilderBlock) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
}

export function BlockEditor({
  block,
  index,
  total,
  previewMode,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  onDuplicate,
}: Props) {
  const [expanded, setExpanded] = useState(true);

  const isTeacherOnly = block.teacher_only || block.block_type === "mark_scheme";

  if (previewMode) {
    return <BlockPreview block={block} />;
  }

  return (
    <div
      className={`rounded-2xl border p-4 ${
        isTeacherOnly
          ? "border-amber-200 bg-amber-50"
          : "border-slate-200 bg-white"
      }`}
    >
      {/* Block header */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="flex-1 text-left"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <span className="text-sm font-medium text-slate-700">
            {BLOCK_TYPE_LABELS[block.block_type]}
          </span>
          {block.content && (
            <span className="ml-2 truncate text-xs text-slate-400">
              {block.content.slice(0, 60)}
            </span>
          )}
        </button>
        <div className="flex flex-wrap gap-1">
          {isTeacherOnly && (
            <Badge tone="warning" className="text-xs">
              Teacher only
            </Badge>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={onMoveUp}
            disabled={index === 0}
            aria-label="Move block up"
          >
            ↑
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onMoveDown}
            disabled={index === total - 1}
            aria-label="Move block down"
          >
            ↓
          </Button>
          <Button size="sm" variant="ghost" onClick={onDuplicate}>
            Dup
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              if (confirm("Delete this block?")) onDelete();
            }}
          >
            ✕
          </Button>
        </div>
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div className="space-y-3">
          <BlockFields block={block} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

// ── Field editors per block type ─────────────────────────────────────────────

function BlockFields({
  block,
  onChange,
}: {
  block: BuilderBlock;
  onChange: (b: BuilderBlock) => void;
}) {
  const set = <K extends keyof BuilderBlock>(key: K, value: BuilderBlock[K]) =>
    onChange({ ...block, [key]: value });

  const isResponse = [
    "numbered_question",
    "short_text",
    "extended_writing",
    "numeric",
    "multiple_choice",
    "tick_box",
    "teacher_review",
    "file_upload",
    "table",
    "vocabulary_table",
  ].includes(block.block_type);

  return (
    <>
      {/* Content (for non-response layout blocks) */}
      {[
        "heading",
        "subheading",
        "instruction",
        "rich_text",
        "mark_scheme",
        "image",
        "downloadable_resource",
      ].includes(block.block_type) && (
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-500">Content</span>
          {block.block_type === "heading" || block.block_type === "subheading" ? (
            <Input
              value={block.content}
              onChange={(e) => set("content", e.target.value)}
              placeholder={
                block.block_type === "heading" ? "Heading text" : "Subheading text"
              }
            />
          ) : (
            <Textarea
              value={block.content}
              onChange={(e) => set("content", e.target.value)}
              placeholder="Content…"
              className="min-h-24"
            />
          )}
        </label>
      )}

      {/* Response blocks: prompt */}
      {isResponse && block.block_type !== "table" && block.block_type !== "vocabulary_table" && (
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-500">Question prompt</span>
          <Textarea
            value={block.prompt ?? ""}
            onChange={(e) => set("prompt", e.target.value)}
            placeholder="Enter question prompt…"
            className="min-h-20"
          />
        </label>
      )}

      {/* Max marks */}
      {isResponse && (
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-500">Max marks (leave blank for none)</span>
          <Input
            type="number"
            min={0}
            step={0.5}
            value={block.max_marks ?? ""}
            onChange={(e) =>
              set("max_marks", e.target.value ? Number(e.target.value) : null)
            }
            placeholder="—"
            className="w-32"
          />
        </label>
      )}

      {/* Required checkbox */}
      {isResponse && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={block.required ?? false}
            onChange={(e) => set("required", e.target.checked)}
            className="rounded"
          />
          Required
        </label>
      )}

      {/* Teacher only toggle */}
      {block.block_type !== "mark_scheme" && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={block.teacher_only}
            onChange={(e) => set("teacher_only", e.target.checked)}
            className="rounded"
          />
          Teacher only (hidden from students)
        </label>
      )}

      {/* MCQ choices */}
      {block.block_type === "multiple_choice" && (
        <ChoicesEditor
          choices={block.choices ?? []}
          onChange={(choices) => set("choices", choices)}
        />
      )}

      {/* Table / vocab table */}
      {(block.block_type === "table" || block.block_type === "vocabulary_table") && (
        <TableEditor block={block} onChange={onChange} />
      )}

      {/* Page break has no content */}
      {block.block_type === "page_break" && (
        <p className="text-xs text-slate-400">— Page break —</p>
      )}
    </>
  );
}

// ── MCQ choices editor ────────────────────────────────────────────────────────

function ChoicesEditor({
  choices,
  onChange,
}: {
  choices: string[];
  onChange: (c: string[]) => void;
}) {
  function update(idx: number, val: string) {
    const next = [...choices];
    next[idx] = val;
    onChange(next);
  }
  function remove(idx: number) {
    onChange(choices.filter((_, i) => i !== idx));
  }
  function add() {
    onChange([...choices, `Option ${String.fromCharCode(65 + choices.length)}`]);
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">Choices</p>
      {choices.map((c, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={c}
            onChange={(e) => update(i, e.target.value)}
            placeholder={`Option ${i + 1}`}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => remove(i)}
            aria-label={`Remove option ${i + 1}`}
          >
            ✕
          </Button>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={add}>
        + Add option
      </Button>
    </div>
  );
}

// ── Student-facing preview ────────────────────────────────────────────────────

function BlockPreview({ block }: { block: BuilderBlock }) {
  switch (block.block_type) {
    case "heading":
      return (
        <h2 className="text-xl font-bold text-slate-900">{block.content}</h2>
      );
    case "subheading":
      return (
        <h3 className="text-base font-semibold text-slate-800">{block.content}</h3>
      );
    case "instruction":
    case "rich_text":
      return (
        <p className="whitespace-pre-wrap text-sm text-slate-700">{block.content}</p>
      );
    case "numbered_question":
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm font-medium text-slate-800">{block.prompt}</p>
          <Textarea
            disabled
            placeholder="Student writes here…"
            className="min-h-20 opacity-60"
          />
          {block.max_marks != null && (
            <p className="mt-1 text-xs text-slate-400">[{block.max_marks} marks]</p>
          )}
        </div>
      );
    case "short_text":
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm font-medium text-slate-800">{block.prompt}</p>
          <Input disabled placeholder="Short answer…" className="opacity-60" />
        </div>
      );
    case "extended_writing":
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm font-medium text-slate-800">{block.prompt}</p>
          <Textarea disabled placeholder="Extended response…" className="min-h-40 opacity-60" />
          {block.max_marks != null && (
            <p className="mt-1 text-xs text-slate-400">[{block.max_marks} marks]</p>
          )}
        </div>
      );
    case "numeric":
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm font-medium text-slate-800">{block.prompt}</p>
          <Input disabled type="number" placeholder="Numeric answer…" className="w-40 opacity-60" />
        </div>
      );
    case "multiple_choice":
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm font-medium text-slate-800">{block.prompt}</p>
          <div className="space-y-1">
            {(block.choices ?? []).map((c, i) => (
              <label key={i} className="flex items-center gap-2 text-sm">
                <input type="radio" disabled name={`preview-${block._id}`} />
                {c}
              </label>
            ))}
          </div>
        </div>
      );
    case "tick_box":
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" disabled />
            <span>{block.prompt || block.content}</span>
          </label>
        </div>
      );
    case "page_break":
      return (
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 border-t border-dashed border-slate-300" />
          <span className="text-xs text-slate-400">Page break</span>
          <div className="h-px flex-1 border-t border-dashed border-slate-300" />
        </div>
      );
    default:
      return (
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-500">
          [{BLOCK_TYPE_LABELS[block.block_type]}] {block.content || block.prompt || ""}
        </div>
      );
  }
}
