"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  formatMarksLabel,
  useCircularMarkButtons,
  type QuestionMarkRecord,
  type QuestionReviewState,
} from "@/lib/marking/annotation-types";

export function QuestionMarkControls({
  questionLabel,
  maximumMark,
  mode,
  record,
  circularThreshold = 10,
  allowDecimals = false,
  onAward,
  onReview,
  onFeedback,
  onFlag,
  onPrev,
  onNext,
  onNextUnmarked,
}: {
  questionLabel: string;
  maximumMark: number;
  mode: QuestionMarkRecord["marking_mode"];
  record?: QuestionMarkRecord;
  circularThreshold?: number;
  allowDecimals?: boolean;
  onAward: (mark: number) => void;
  onReview: (state: QuestionReviewState) => void;
  onFeedback: (text: string) => void;
  onFlag: (flagged: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  onNextUnmarked: () => void;
}) {
  const circular = useCircularMarkButtons(maximumMark, circularThreshold);
  const awarded = record?.awarded_mark ?? null;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-900">{questionLabel}</p>
        <p className="text-xs text-slate-500">
          {mode === "numeric" || mode === "auto_mcq"
            ? `Maximum ${formatMarksLabel(maximumMark)}`
            : mode === "reviewed"
              ? "Review-only question"
              : "Comment-only question"}
        </p>
      </div>

      {(mode === "numeric" || mode === "auto_mcq") && circular ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Award mark">
          {Array.from({ length: Math.floor(maximumMark) + 1 }, (_, n) => n).map(
            (n) => {
              const selected = awarded === n;
              return (
                <button
                  key={n}
                  type="button"
                  aria-label={`Award ${formatMarksLabel(n)}`}
                  aria-pressed={selected}
                  className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold ${
                    selected
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                  }`}
                  onClick={() => onAward(n)}
                >
                  {n}
                </button>
              );
            },
          )}
        </div>
      ) : null}

      {(mode === "numeric" || mode === "auto_mcq") && !circular ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            aria-label="Decrease mark"
            onClick={() =>
              onAward(Math.max(0, Number(awarded ?? 0) - (allowDecimals ? 0.5 : 1)))
            }
          >
            −
          </Button>
          <Input
            type="number"
            min={0}
            max={maximumMark}
            step={allowDecimals ? 0.5 : 1}
            value={awarded ?? ""}
            aria-label="Awarded mark"
            onChange={(e) => {
              const value = Number(e.target.value);
              if (!Number.isFinite(value)) return;
              onAward(Math.min(maximumMark, Math.max(0, value)));
            }}
          />
          <Button
            type="button"
            variant="outline"
            aria-label="Increase mark"
            onClick={() =>
              onAward(
                Math.min(
                  maximumMark,
                  Number(awarded ?? 0) + (allowDecimals ? 0.5 : 1),
                ),
              )
            }
          >
            +
          </Button>
        </div>
      ) : null}

      {mode === "reviewed" ? (
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["reviewed", "Reviewed"],
              ["not_reviewed", "Not reviewed"],
              ["flag_follow_up", "Flag for follow-up"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={record?.review_state === value ? "secondary" : "outline"}
              onClick={() => onReview(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      ) : null}

      {record?.automatic_mark != null ? (
        <p className="text-xs text-slate-500">
          Automatic mark: {record.automatic_mark}
          {record.override_mark != null
            ? ` · Override: ${record.override_mark}`
            : ""}
        </p>
      ) : null}

      <label className="block text-sm">
        <span className="mb-1 block text-slate-500">Question feedback</span>
        <Textarea
          value={record?.question_feedback ?? ""}
          onChange={(e) => onFeedback(e.target.value)}
          placeholder="Feedback for this question"
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(record?.flagged)}
          onChange={(e) => onFlag(e.target.checked)}
        />
        Flag question
      </label>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onPrev}>
          Previous question
        </Button>
        <Button type="button" variant="outline" onClick={onNext}>
          Next question
        </Button>
        <Button type="button" variant="secondary" onClick={onNextUnmarked}>
          Next unmarked
        </Button>
      </div>
    </div>
  );
}
