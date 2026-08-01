"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { newId } from "@/lib/homework/structure";
import type { BuilderBlock, McqOption } from "@/lib/types";

export function McqEditor({
  block,
  onChange,
}: {
  block: BuilderBlock;
  onChange: (b: BuilderBlock) => void;
}) {
  const multi = block.block_type === "multiple_select";
  const options: McqOption[] =
    block.mcq_options?.length
      ? block.mcq_options
      : (block.choices ?? []).map((label, i) => ({
          id: `legacy-${i}`,
          label,
          correct: (block.correct_option_indexes ?? []).includes(i),
          feedback: block.option_feedback?.[i] ?? "",
        }));

  function commit(nextOptions: McqOption[]) {
    onChange({
      ...block,
      mcq_options: nextOptions,
      choices: nextOptions.map((o) => o.label),
      option_feedback: nextOptions.map((o) => o.feedback ?? ""),
      correct_option_indexes: nextOptions
        .map((o, i) => (o.correct ? i : -1))
        .filter((i) => i >= 0),
      correct_answer: multi
        ? null
        : (nextOptions.find((o) => o.correct)?.label ?? null),
    });
  }

  function update(idx: number, patch: Partial<McqOption>) {
    const next = options.map((o, i) => {
      if (i !== idx) {
        if (!multi && patch.correct) return { ...o, correct: false };
        return o;
      }
      return { ...o, ...patch };
    });
    commit(next);
  }

  function move(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= options.length) return;
    const next = [...options];
    [next[idx], next[target]] = [next[target], next[idx]];
    commit(next);
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
              onClick={() => commit(options.filter((_, j) => j !== i))}
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
          commit([
            ...options,
            {
              id: newId(),
              label: `Option ${String.fromCharCode(65 + options.length)}`,
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
          onChange={(e) => onChange({ ...block, shuffle_options: e.target.checked })}
        />
        Shuffle options for students
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-xs text-slate-500">Marking</span>
        <select
          className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
          value={block.marking_mode ?? "automatic"}
          onChange={(e) =>
            onChange({
              ...block,
              marking_mode: e.target.value as "automatic" | "teacher_reviewed",
            })
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
              {o.label || "Option"}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
