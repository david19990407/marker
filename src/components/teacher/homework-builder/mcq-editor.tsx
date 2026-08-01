"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  formatMcqOptionIdentifier,
  getBlockOptionLabelStyle,
  getMcqOptionText,
  mcqOptionHasText,
  normalizeMcqOption,
} from "@/lib/homework/mcq-options";
import {
  applyMcqOptions,
  newId,
  resolveMcqOptions,
} from "@/lib/homework/structure";
import type {
  BuilderBlock,
  McqOption,
  McqOptionLabelStyle,
} from "@/lib/types";

const LABEL_STYLES: Array<{
  value: McqOptionLabelStyle;
  label: string;
  sample: string;
}> = [
  { value: "letters", label: "A B C D", sample: "A B C D" },
  { value: "numbers", label: "1 2 3 4", sample: "1 2 3 4" },
  { value: "roman", label: "i ii iii iv", sample: "i ii iii iv" },
];

export function McqEditor({
  block,
  onChange,
}: {
  block: BuilderBlock;
  onChange: (updater: (prev: BuilderBlock) => BuilderBlock) => void;
}) {
  const multi = block.block_type === "multiple_select";
  const options = resolveMcqOptions(block);
  const labelStyle = getBlockOptionLabelStyle(block);
  const filledCount = options.filter((o) => mcqOptionHasText(o)).length;

  function commit(mapOptions: (current: McqOption[]) => McqOption[]) {
    onChange((prev) =>
      applyMcqOptions(prev, mapOptions(resolveMcqOptions(prev))),
    );
  }

  function update(idx: number, patch: Partial<McqOption>) {
    commit((current) =>
      current.map((o, i) => {
        if (i !== idx) {
          if (!multi && patch.correct) return { ...o, correct: false };
          return o;
        }
        return normalizeMcqOption({ ...o, ...patch }, i, o.id);
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

  function setLabelStyle(style: McqOptionLabelStyle) {
    onChange((prev) => ({
      ...applyMcqOptions(prev, resolveMcqOptions(prev)),
      option_label_style: style,
    }));
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Option labels
        </p>
        <p className="mt-0.5 text-[11px] text-slate-400">
          Identifiers are display-only. They never change the answer text.
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          {LABEL_STYLES.map((style) => (
            <label
              key={style.value}
              className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"
            >
              <input
                type="radio"
                name={`option-label-style-${block._id}`}
                checked={labelStyle === style.value}
                onChange={() => setLabelStyle(style.value)}
              />
              <span className="font-medium tabular-nums">{style.sample}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Answer options
        </p>
        {options.map((opt, i) => {
          const identifier = formatMcqOptionIdentifier(i, labelStyle);
          const text = getMcqOptionText(opt);
          return (
            <div
              key={opt.id}
              className="rounded-2xl border border-slate-200 bg-white p-3"
            >
              <div className="flex items-start gap-3">
                <label className="mt-1 flex shrink-0 items-center gap-2 text-xs text-slate-600">
                  <input
                    type={multi ? "checkbox" : "radio"}
                    name={`correct-${block._id}`}
                    checked={!!opt.correct}
                    onChange={(e) => update(i, { correct: e.target.checked })}
                    aria-label={`Mark option ${identifier} as correct`}
                  />
                  <span className="sr-only">Correct</span>
                  <span
                    className="inline-flex min-w-[1.75rem] items-center justify-center rounded-md bg-slate-100 px-2 py-1 text-sm font-semibold tabular-nums text-slate-800"
                    aria-hidden
                  >
                    {identifier}
                  </span>
                </label>

                <div className="min-w-0 flex-1 space-y-1">
                  <Textarea
                    value={text}
                    onChange={(e) => update(i, { text: e.target.value })}
                    placeholder="Type the full answer option here…"
                    aria-label={`Answer text for option ${identifier}`}
                    className="min-h-[4.5rem] resize-y text-[0.95rem] leading-6"
                  />
                  <input
                    value={opt.feedback ?? ""}
                    onChange={(e) => update(i, { feedback: e.target.value })}
                    placeholder="Optional feedback for this option"
                    className="w-full rounded-xl border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 outline-none focus:border-brand-200"
                  />
                </div>

                <div className="flex shrink-0 flex-col gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="Move option up"
                  >
                    ↑
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => move(i, 1)}
                    disabled={i === options.length - 1}
                    aria-label="Move option down"
                  >
                    ↓
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() =>
                      commit((current) => current.filter((_, j) => j !== i))
                    }
                    disabled={options.length <= 2}
                    aria-label="Delete option"
                  >
                    ✕
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          commit((current) => [
            ...current,
            normalizeMcqOption(
              {
                id: newId(),
                text: "",
                correct: false,
                feedback: "",
              },
              current.length,
            ),
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

      {filledCount < 2 && (
        <p className="text-xs text-rose-600">
          Add at least two non-empty answer options before publishing.
        </p>
      )}
      {block.marking_mode === "automatic" &&
        !options.some((o) => o.correct && mcqOptionHasText(o)) && (
          <p className="text-xs text-rose-600">
            Mark at least one correct option for automatic marking.
          </p>
        )}

      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3">
        <p className="mb-2 text-xs font-medium text-slate-500">
          Student preview
        </p>
        <p className="mb-3 text-sm font-medium text-slate-800">
          {block.content || block.prompt || "Question"}
        </p>
        <div className="space-y-2">
          {options.filter((o) => mcqOptionHasText(o)).length === 0 ? (
            <p className="text-xs italic text-slate-400">
              Answer options will appear here once you type them.
            </p>
          ) : (
            options.map((o, i) => {
              if (!mcqOptionHasText(o)) return null;
              const identifier = formatMcqOptionIdentifier(i, labelStyle);
              return (
                <label
                  key={o.id}
                  className="flex items-start gap-3 text-sm text-slate-800"
                >
                  <input
                    type={multi ? "checkbox" : "radio"}
                    disabled
                    className="mt-1"
                  />
                  <span className="min-w-[1.25rem] font-semibold tabular-nums text-slate-700">
                    {identifier}
                  </span>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap">
                    {getMcqOptionText(o)}
                  </span>
                </label>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
