"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableEditor } from "./table-editor";
import { BLOCK_TYPE_LABELS, RESPONSE_BLOCK_TYPES } from "@/lib/types";
import type { AssignmentBlockType, BuilderBlock } from "@/lib/types";

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
        isTeacherOnly ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className="cursor-grab select-none px-1 text-slate-400"
          title="Drag to reorder"
          aria-hidden
        >
          ⋮⋮
        </span>
        <button
          type="button"
          className="flex-1 text-left"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <span className="text-sm font-medium text-slate-700">
            {BLOCK_TYPE_LABELS[block.block_type]}
          </span>
          {(block.prompt || block.content) && (
            <span className="ml-2 truncate text-xs text-slate-400">
              {(block.prompt || block.content).slice(0, 60)}
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

      {expanded && (
        <div className="space-y-3">
          <BlockFields block={block} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

function BlockFields({
  block,
  onChange,
}: {
  block: BuilderBlock;
  onChange: (b: BuilderBlock) => void;
}) {
  const set = <K extends keyof BuilderBlock>(key: K, value: BuilderBlock[K]) =>
    onChange({ ...block, [key]: value });

  const isResponse = (RESPONSE_BLOCK_TYPES as readonly AssignmentBlockType[]).includes(
    block.block_type,
  );
  const textLike = ["short_text", "extended_writing", "numbered_question"].includes(
    block.block_type,
  );

  return (
    <>
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
          <span className="mb-1 block text-xs text-slate-500">
            {block.block_type === "image"
              ? "Image URL or description"
              : block.block_type === "downloadable_resource"
                ? "Resource label / URL"
                : "Content"}
          </span>
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

      {isResponse &&
        block.block_type !== "table" &&
        block.block_type !== "vocabulary_table" && (
          <>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-slate-500">Question title</span>
              <Input
                value={block.content}
                onChange={(e) => set("content", e.target.value)}
                placeholder="Optional short title"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-slate-500">Question instructions</span>
              <Textarea
                value={block.prompt ?? ""}
                onChange={(e) => set("prompt", e.target.value)}
                placeholder="Enter question prompt…"
                className="min-h-20"
              />
            </label>
            <p className="text-xs text-slate-500">
              Response type: <strong>{BLOCK_TYPE_LABELS[block.block_type]}</strong>
            </p>
          </>
        )}

      {(block.block_type === "table" || block.block_type === "vocabulary_table") && (
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-500">Table title / instructions</span>
          <Input
            value={block.prompt ?? ""}
            onChange={(e) => set("prompt", e.target.value)}
            placeholder="Instructions for students"
          />
        </label>
      )}

      {isResponse && (
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-500">Maximum mark</span>
          <Input
            type="number"
            min={0}
            step={0.5}
            value={block.max_marks ?? ""}
            onChange={(e) =>
              set("max_marks", e.target.value ? Number(e.target.value) : null)
            }
            placeholder="—"
          />
        </label>
      )}

      {isResponse && (
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={block.required ?? false}
              onChange={(e) => set("required", e.target.checked)}
              className="rounded"
            />
            Required
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!(block.teacher_only || block.student_visible === false)}
              onChange={(e) => {
                const visible = e.target.checked;
                onChange({
                  ...block,
                  student_visible: visible,
                  teacher_only: !visible,
                });
              }}
              className="rounded"
            />
            Visible to students
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={block.review_only ?? block.block_type === "teacher_review"}
              onChange={(e) => set("review_only", e.target.checked)}
              className="rounded"
            />
            Review-only (no student answer field)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={block.allow_attachments ?? false}
              onChange={(e) => set("allow_attachments", e.target.checked)}
              className="rounded"
            />
            Allow attachments
          </label>
        </div>
      )}

      {block.block_type !== "mark_scheme" && !isResponse && (
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

      {isResponse && (
        <>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">Teacher-only note</span>
            <Textarea
              value={block.teacher_note ?? ""}
              onChange={(e) => set("teacher_note", e.target.value || null)}
              placeholder="Not shown to students"
              className="min-h-16"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">Mark-scheme note</span>
            <Textarea
              value={block.mark_scheme_note ?? ""}
              onChange={(e) => set("mark_scheme_note", e.target.value || null)}
              placeholder="Teacher marking guidance — hidden from students"
              className="min-h-16"
            />
          </label>
        </>
      )}

      {textLike && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">Word limit</span>
            <Input
              type="number"
              min={0}
              value={block.word_limit ?? ""}
              onChange={(e) =>
                set("word_limit", e.target.value ? Number(e.target.value) : null)
              }
              placeholder="—"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">Character limit</span>
            <Input
              type="number"
              min={0}
              value={block.char_limit ?? ""}
              onChange={(e) =>
                set("char_limit", e.target.value ? Number(e.target.value) : null)
              }
              placeholder="—"
            />
          </label>
        </div>
      )}

      {block.block_type === "numeric" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">Min value</span>
            <Input
              type="number"
              value={block.min_value ?? ""}
              onChange={(e) =>
                set("min_value", e.target.value !== "" ? Number(e.target.value) : null)
              }
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">Max value</span>
            <Input
              type="number"
              value={block.max_value ?? ""}
              onChange={(e) =>
                set("max_value", e.target.value !== "" ? Number(e.target.value) : null)
              }
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">
              Expected answer (reference only)
            </span>
            <Input
              value={block.correct_answer ?? ""}
              onChange={(e) => set("correct_answer", e.target.value || null)}
              placeholder="Not auto-marked"
            />
          </label>
        </div>
      )}

      {block.block_type === "multiple_choice" && (
        <>
          <ChoicesEditor
            choices={block.choices ?? []}
            onChange={(choices) => set("choices", choices)}
          />
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">
              Correct option (reference only — no auto-marking)
            </span>
            <Input
              value={block.correct_answer ?? ""}
              onChange={(e) => set("correct_answer", e.target.value || null)}
              placeholder="Exact option text"
            />
          </label>
        </>
      )}

      {(block.block_type === "table" || block.block_type === "vocabulary_table") && (
        <TableEditor
          block={block}
          onChange={(updater) => onChange(updater(block))}
        />
      )}

      {(block.block_type === "page_break" || block.block_type === "divider") && (
        <p className="text-xs text-slate-400">
          — {block.block_type === "divider" ? "Divider" : "Page break"} —
        </p>
      )}
    </>
  );
}

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

function BlockPreview({ block }: { block: BuilderBlock }) {
  if (block.teacher_only || block.block_type === "mark_scheme") return null;

  switch (block.block_type) {
    case "heading":
      return <h2 className="text-xl font-bold text-slate-900">{block.content}</h2>;
    case "subheading":
      return <h3 className="text-base font-semibold text-slate-800">{block.content}</h3>;
    case "instruction":
    case "rich_text":
      return (
        <p className="whitespace-pre-wrap text-sm text-slate-700">{block.content}</p>
      );
    case "divider":
      return <hr className="border-slate-200" />;
    case "page_break":
      return (
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 border-t border-dashed border-slate-300" />
          <span className="text-xs text-slate-400">Page break</span>
          <div className="h-px flex-1 border-t border-dashed border-slate-300" />
        </div>
      );
    case "image":
      return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          [Image] {block.content || "Image placeholder"}
        </div>
      );
    case "downloadable_resource":
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-brand-700">
          Download: {block.content || "Resource"}
        </div>
      );
    case "short_text":
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm font-medium text-slate-800">
            {block.content || block.prompt}
            {block.required && <span className="ml-1 text-rose-500">*</span>}
          </p>
          {block.prompt && block.content && (
            <p className="mb-2 text-xs text-slate-500">{block.prompt}</p>
          )}
          <Input disabled placeholder="Short answer…" className="opacity-60" />
        </div>
      );
    case "extended_writing":
    case "numbered_question":
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm font-medium text-slate-800">
            {block.content || block.prompt}
            {block.required && <span className="ml-1 text-rose-500">*</span>}
          </p>
          {block.prompt && (
            <p className="mb-2 whitespace-pre-wrap text-xs text-slate-500">{block.prompt}</p>
          )}
          <Textarea
            disabled
            placeholder="Student writes here…"
            className="min-h-28 opacity-60"
          />
          {block.max_marks != null && (
            <p className="mt-1 text-xs text-slate-400">[{block.max_marks} marks]</p>
          )}
        </div>
      );
    case "numeric":
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm font-medium text-slate-800">
            {block.content || block.prompt}
            {block.required && <span className="ml-1 text-rose-500">*</span>}
          </p>
          <Input disabled type="number" placeholder="Numeric answer…" className="w-40 opacity-60" />
        </div>
      );
    case "multiple_choice":
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm font-medium text-slate-800">
            {block.content || block.prompt}
            {block.required && <span className="ml-1 text-rose-500">*</span>}
          </p>
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
    case "file_upload":
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          {block.content || block.prompt || "Upload a file"}
          <div className="mt-2">
            <Input disabled type="file" className="opacity-60" />
          </div>
        </div>
      );
    case "table":
    case "vocabulary_table":
      return (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 p-3">
          <p className="mb-2 text-sm font-medium text-slate-800">
            {block.prompt || block.content || BLOCK_TYPE_LABELS[block.block_type]}
          </p>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                {(block.tableConfig?.col_labels ?? []).map((label, i) => (
                  <th key={i} className="px-3 py-2 text-left text-xs font-semibold text-slate-600">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({
                length: Math.max(0, (block.tableConfig?.rows ?? 1) - (block.tableConfig?.header_row ? 1 : 0)),
              }).map((_, ri) => (
                <tr key={ri} className="border-t border-slate-100">
                  {Array.from({ length: block.tableConfig?.cols ?? 0 }).map((__, ci) => (
                    <td key={ci} className="px-3 py-2 text-xs text-slate-400">
                      —
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
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
