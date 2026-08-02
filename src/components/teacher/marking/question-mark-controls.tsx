"use client";

import { useEffect, useRef, useState } from "react";
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
  questionId,
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
  questionId: string;
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
  const [feedbackOpen, setFeedbackOpen] = useState(true);
  const [localFeedback, setLocalFeedback] = useState(
    () => record?.question_feedback ?? "",
  );
  const questionIdRef = useRef(questionId);

  // Sync draft only when the selected question changes — never on server save.
  useEffect(() => {
    if (questionIdRef.current === questionId) return;
    questionIdRef.current = questionId;
    setLocalFeedback(record?.question_feedback ?? "");
    setFeedbackOpen(true);
  }, [questionId, record?.question_feedback]);

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

      <div className="space-y-1">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left text-xs font-medium text-slate-600"
          onClick={() => setFeedbackOpen((v) => !v)}
        >
          <span>Question feedback</span>
          <span className="text-slate-400">{feedbackOpen ? "Hide" : "Show"}</span>
        </button>
        {feedbackOpen ? (
          <Textarea
            value={localFeedback}
            onChange={(e) => {
              const value = e.target.value;
              setLocalFeedback(value);
              onFeedback(value);
            }}
            placeholder="Feedback for this question"
            rows={3}
            className="min-h-[4.5rem]"
          />
        ) : localFeedback.trim() ? (
          <p className="line-clamp-2 text-xs text-slate-500">{localFeedback}</p>
        ) : null}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(record?.flagged)}
          onChange={(e) => onFlag(e.target.checked)}
        />
        Flag question
      </label>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onPrev}>
          Previous
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onNext}>
          Next
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onNextUnmarked}>
          Next unmarked
        </Button>
      </div>
    </div>
  );
}
