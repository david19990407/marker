"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  applyMcqOptions,
  newId,
  resolveMcqOptions,
} from "@/lib/homework/structure";
import type { BuilderBlock, McqOption } from "@/lib/types";

export function McqEditor({
  block,
  onChange,
}: {
  block: BuilderBlock;
  onChange: (updater: (prev: BuilderBlock) => BuilderBlock) => void;
}) {
  const multi = block.block_type === "multiple_select";
  const options = resolveMcqOptions(block);

  function commit(mapOptions: (current: McqOption[]) => McqOption[]) {
    onChange((prev) => applyMcqOptions(prev, mapOptions(resolveMcqOptions(prev))));
  }

  function update(idx: number, patch: Partial<McqOption>) {
    commit((current) =>
      current.map((o, i) => {
        if (i !== idx) {
          if (!multi && patch.correct) return { ...o, correct: false };
          return o;
        }
        return { ...o, ...patch };
      }),
    );
  }

  function move(idx: number, dir: -1 | 1) {
    commit((current) => {
      const target = idx + dir;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        Answer options
      </p>
      {options.map((opt, i) => (
        <div
          key={opt.id}
          className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3"
        >
          <div className="flex items-start gap-2">
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
              <input
                type={multi ? "checkbox" : "radio"}
                name={`correct-${block._id}`}
                checked={!!opt.correct}
                onChange={(e) => update(i, { correct: e.target.checked })}
              />
              Correct
            </label>
            <Input
              value={opt.label}
              onChange={(e) => update(i, { label: e.target.value })}
              placeholder={`Option ${i + 1}`}
              aria-label={`Option ${i + 1}`}
            />
            <Button size="sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0}>
              ↑
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => move(i, 1)}
              disabled={i === options.length - 1}
            >
              ↓
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => commit((current) => current.filter((_, j) => j !== i))}
              disabled={options.length <= 2}
            >
              ✕
            </Button>
          </div>
          <Input
            value={opt.feedback ?? ""}
            onChange={(e) => update(i, { feedback: e.target.value })}
            placeholder="Optional feedback for this option"
            className="text-xs"
          />
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          commit((current) => [
            ...current,
            {
              id: newId(),
              label: `Option ${String.fromCharCode(65 + current.length)}`,
              correct: false,
              feedback: "",
            },
          ])
        }
      >
        + Add option
      </Button>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={block.shuffle_options ?? false}
          onChange={(e) =>
            onChange((prev) => ({ ...prev, shuffle_options: e.target.checked }))
          }
        />
        Shuffle options for students
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-xs text-slate-500">Marking</span>
        <select
          className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
          value={block.marking_mode ?? "automatic"}
          onChange={(e) =>
            onChange((prev) => ({
              ...prev,
              marking_mode: e.target.value as "automatic" | "teacher_reviewed",
            }))
          }
        >
          <option value="automatic">Automatic (reference answers stored)</option>
          <option value="teacher_reviewed">Teacher reviewed</option>
        </select>
      </label>

      {options.length < 2 && (
        <p className="text-xs text-rose-600">Add at least two options before publishing.</p>
      )}
      {block.marking_mode === "automatic" &&
        !options.some((o) => o.correct) && (
          <p className="text-xs text-rose-600">
            Mark at least one correct option for automatic marking.
          </p>
        )}

      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3">
        <p className="mb-2 text-xs font-medium text-slate-500">Student preview</p>
        <p className="mb-2 text-sm font-medium text-slate-800">
          {block.content || block.prompt || "Question"}
        </p>
        <div className="space-y-1">
          {options.map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input type={multi ? "checkbox" : "radio"} disabled />
              {o.label.trim() ? o.label : (
                <span className="italic text-slate-400">(empty option)</span>
              )}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
