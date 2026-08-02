"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  formatMarksLabel,
  type QuestionMarkRecord,
  type QuestionReviewState,
} from "@/lib/marking/annotation-types";

export function QuestionMarkControls({
  questionId,
  questionIndex,
  questionLabel,
  maximumMark,
  mode,
  record,
  canGoPrev,
  canGoNext,
  onReview,
  onFeedback,
  onPrev,
  onNext,
}: {
  questionId: string;
  questionIndex: number;
  questionLabel: string;
  maximumMark: number;
  mode: QuestionMarkRecord["marking_mode"];
  record?: QuestionMarkRecord;
  canGoPrev: boolean;
  canGoNext: boolean;
  onReview: (state: QuestionReviewState) => void;
  onFeedback: (text: string) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const [feedbackOpen, setFeedbackOpen] = useState(true);
  const [localFeedback, setLocalFeedback] = useState(
    () => record?.question_feedback ?? "",
  );
  const questionIdRef = useRef(questionId);

  useEffect(() => {
    if (questionIdRef.current === questionId) return;
    questionIdRef.current = questionId;
    setLocalFeedback(record?.question_feedback ?? "");
    setFeedbackOpen(true);
  }, [questionId, record?.question_feedback]);

  const title =
    questionLabel.trim() &&
    !/^q(uestion)?\s*\d+/i.test(questionLabel.trim())
      ? questionLabel.trim()
      : "";

  return (
    <div className="space-y-3">
      <div>
        <p className="text-3xl font-bold leading-none text-slate-900">
          Q{questionIndex + 1}
        </p>
        {title ? (
          <p className="mt-1 truncate text-sm font-medium text-slate-800">
            {title}
          </p>
        ) : null}
        <p className="mt-0.5 text-xs text-slate-500">
          {mode === "numeric" || mode === "auto_mcq"
            ? `Maximum ${formatMarksLabel(maximumMark)}`
            : mode === "reviewed"
              ? "Review-only question"
              : "Comment-only question"}
        </p>
      </div>

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

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canGoPrev}
          onClick={onPrev}
          className="flex-1"
        >
          Previous Q
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canGoNext}
          onClick={onNext}
          className="flex-1"
        >
          Next Q
        </Button>
      </div>
    </div>
  );
}
