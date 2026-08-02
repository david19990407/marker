"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
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
  circularThreshold = 10,
  allowDecimals = false,
  canGoPrev,
  canGoNext,
  onAward,
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
  circularThreshold?: number;
  allowDecimals?: boolean;
  canGoPrev: boolean;
  canGoNext: boolean;
  onAward: (mark: number) => void;
  onReview: (state: QuestionReviewState) => void;
  onFeedback: (text: string) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  void circularThreshold;
  // Always use a single horizontal strip for whole-mark questions (including 30+).
  const useStrip =
    (mode === "numeric" || mode === "auto_mcq") &&
    !allowDecimals &&
    maximumMark >= 0 &&
    maximumMark <= 60;
  const awarded = record?.awarded_mark ?? null;
  const [feedbackOpen, setFeedbackOpen] = useState(true);
  const [localFeedback, setLocalFeedback] = useState(
    () => record?.question_feedback ?? "",
  );
  const [flash, setFlash] = useState<string | null>(null);
  const questionIdRef = useRef(questionId);
  const stripRef = useRef<HTMLDivElement>(null);
  const selectedBtnRef = useRef<HTMLButtonElement | null>(null);
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (questionIdRef.current === questionId) return;
    questionIdRef.current = questionId;
    setLocalFeedback(record?.question_feedback ?? "");
    setFeedbackOpen(true);
  }, [questionId, record?.question_feedback]);

  useEffect(() => {
    selectedBtnRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [awarded, questionId, reduceMotion]);

  function award(mark: number) {
    onAward(mark);
    const label = `${mark} / ${maximumMark}`;
    setFlash(label);
    window.setTimeout(() => setFlash(null), reduceMotion ? 400 : 700);
  }

  function onStripWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (!stripRef.current) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      stripRef.current.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }

  function onStripKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (mode !== "numeric" && mode !== "auto_mcq") return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const current = awarded ?? 0;
    const step = allowDecimals ? 0.5 : 1;
    const next =
      e.key === "ArrowRight"
        ? Math.min(maximumMark, current + step)
        : Math.max(0, current - step);
    award(next);
  }

  const title =
    questionLabel.trim() &&
    !/^q(uestion)?\s*\d+/i.test(questionLabel.trim())
      ? questionLabel.trim()
      : "";

  return (
    <div className="relative space-y-3">
      {flash ? (
        <div
          aria-live="polite"
          className="pointer-events-none absolute left-1/2 top-8 z-20 -translate-x-1/2 rounded-xl bg-slate-900/90 px-4 py-2 text-2xl font-semibold tabular-nums text-white shadow-lg transition-opacity duration-300"
          style={{ opacity: reduceMotion ? 1 : undefined }}
        >
          {flash}
        </div>
      ) : null}

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
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

        {useStrip ? (
          <div
            ref={stripRef}
            role="listbox"
            aria-label="Award mark"
            tabIndex={0}
            onWheel={onStripWheel}
            onKeyDown={onStripKeyDown}
            className="max-w-[55%] shrink-0 overflow-x-auto overscroll-x-contain pb-1"
            style={{ scrollbarWidth: "thin" }}
          >
            <div className="flex w-max flex-nowrap gap-1.5 pr-1">
              {Array.from(
                { length: Math.floor(maximumMark) + 1 },
                (_, n) => n,
              ).map((n) => {
                const selected = awarded === n;
                return (
                  <button
                    key={n}
                    ref={selected ? selectedBtnRef : undefined}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    aria-label={`Award ${n} out of ${maximumMark}`}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
                      selected
                        ? "border-slate-900 bg-slate-900 text-white ring-2 ring-slate-900 ring-offset-1"
                        : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                    }`}
                    onClick={() => award(n)}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {(mode === "numeric" || mode === "auto_mcq") && !useStrip ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Decrease mark"
            onClick={() =>
              award(Math.max(0, Number(awarded ?? 0) - (allowDecimals ? 0.5 : 1)))
            }
          >
            −
          </Button>
          <span className="min-w-12 text-center text-sm font-semibold tabular-nums">
            {awarded ?? "—"}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Increase mark"
            onClick={() =>
              award(
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
        <div className="flex flex-wrap justify-end gap-2">
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
