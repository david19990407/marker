"use client";

import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { formatMarksLabel } from "@/lib/marking/annotation-types";

export function VerticalMarkStrip({
  maximumMark,
  awarded,
  allowDecimals = false,
  onAward,
}: {
  maximumMark: number;
  awarded: number | null;
  allowDecimals?: boolean;
  onAward: (mark: number) => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement | null>(null);
  const marks = allowDecimals
    ? Array.from(
        { length: Math.floor(maximumMark * 2) + 1 },
        (_, i) => i * 0.5,
      ).reverse()
    : Array.from(
        { length: Math.floor(maximumMark) + 1 },
        (_, i) => Math.floor(maximumMark) - i,
      );

  useEffect(() => {
    selectedRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [awarded, maximumMark]);

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown" && e.key !== "Enter") {
      return;
    }
    e.preventDefault();
    const step = allowDecimals ? 0.5 : 1;
    const current = awarded ?? 0;
    if (e.key === "Enter") {
      onAward(current);
      return;
    }
    const next =
      e.key === "ArrowUp"
        ? Math.min(maximumMark, current + step)
        : Math.max(0, current - step);
    onAward(next);
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
          {marks.map((n) => {
            const selected = awarded === n;
            return (
              <button
                key={n}
                ref={selected ? selectedRef : undefined}
                type="button"
                aria-pressed={selected}
                aria-label={`Award ${n} out of ${maximumMark}`}
                title={`Award ${formatMarksLabel(n)}`}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
                  selected
                    ? "border-slate-900 bg-slate-900 text-white ring-2 ring-slate-900 ring-offset-1"
                    : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                }`}
                onClick={() => onAward(n)}
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
