"use client";

import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { formatMarksLabel } from "@/lib/marking/annotation-types";

export type MarkStripValue = number | "NA";

export function VerticalMarkStrip({
  maximumMark,
  awarded,
  notAttempted = false,
  allowDecimals = false,
  onAward,
  onNotAttempted,
}: {
  maximumMark: number;
  awarded: number | null;
  notAttempted?: boolean;
  allowDecimals?: boolean;
  onAward: (mark: number) => void;
  onNotAttempted: () => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement | null>(null);
  const numericMarks = allowDecimals
    ? Array.from(
        { length: Math.floor(maximumMark * 2) + 1 },
        (_, i) => i * 0.5,
      ).reverse()
    : Array.from(
        { length: Math.floor(maximumMark) + 1 },
        (_, i) => Math.floor(maximumMark) - i,
      );
  const values: MarkStripValue[] = [...numericMarks, "NA"];

  useEffect(() => {
    selectedRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [awarded, maximumMark, notAttempted]);

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown" && e.key !== "Enter") {
      return;
    }
    e.preventDefault();
    const currentIndex = notAttempted
      ? values.length - 1
      : values.findIndex((v) => v !== "NA" && v === (awarded ?? 0));
    const idx = currentIndex < 0 ? values.length - 1 : currentIndex;
    if (e.key === "Enter") {
      const current = values[idx];
      if (current === "NA") onNotAttempted();
      else if (typeof current === "number") onAward(current);
      return;
    }
    const nextIndex =
      e.key === "ArrowUp"
        ? Math.max(0, idx - 1)
        : Math.min(values.length - 1, idx + 1);
    const next = values[nextIndex];
    if (next === "NA") onNotAttempted();
    else if (typeof next === "number") onAward(next);
  }

  return (
    <aside
      className="flex h-full w-14 shrink-0 flex-col border-l border-slate-200 bg-slate-50"
      aria-label="Mark selector"
    >
      <div className="shrink-0 border-b border-slate-200 px-1 py-2 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Max
        </p>
        <p className="text-sm font-bold tabular-nums text-slate-900">
          {maximumMark}
        </p>
      </div>
      <div
        ref={stripRef}
        role="group"
        aria-label={`Award mark out of ${maximumMark}`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 py-2"
        style={{ scrollbarWidth: "thin" }}
      >
        <div className="flex flex-col items-center gap-1.5">
          {values.map((n) => {
            const selected =
              n === "NA" ? notAttempted : !notAttempted && awarded === n;
            const label =
              n === "NA"
                ? "Mark as not attempted"
                : n === 0
                  ? `Award zero out of ${maximumMark}`
                  : `Award ${n} out of ${maximumMark}`;
            return (
              <button
                key={String(n)}
                ref={selected ? selectedRef : undefined}
                type="button"
                aria-pressed={selected}
                aria-label={label}
                title={
                  n === "NA"
                    ? "Not attempted"
                    : `Award ${formatMarksLabel(n)}`
                }
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
                  selected
                    ? "border-slate-900 bg-slate-900 text-white ring-2 ring-slate-900 ring-offset-1"
                    : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                }`}
                onClick={() => {
                  if (n === "NA") onNotAttempted();
                  else onAward(n);
                }}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
