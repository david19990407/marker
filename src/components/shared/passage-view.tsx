"use client";

import type { PassageConfig } from "@/lib/types";
import { buildPassageRows } from "@/lib/homework/passage-numbering";

export function PassageView({
  text,
  config,
  startLineNumber,
  className = "",
}: {
  text: string;
  config?: PassageConfig | null;
  /** Kept for API compatibility; labels come from row.label. */
  startLineNumber?: number;
  className?: string;
}) {
  const { rows, showGutter } = buildPassageRows(text, config, startLineNumber);
  const gutterDigits = Math.max(
    2,
    ...rows.map((r) => (r.label ? String(r.label).length : 0)),
    2,
  );

  return (
    <figure
      className={`overflow-hidden border border-slate-200 bg-[linear-gradient(180deg,#fffdf8_0%,#ffffff_48%,#f8fafc_100%)] ${className}`}
    >
      {(config?.title || config?.source_reference) && (
        <figcaption className="border-b border-slate-200/80 px-4 py-3 sm:px-5">
          {config?.title ? (
            <p className="font-[family-name:var(--font-outfit)] text-base font-semibold tracking-tight text-slate-900">
              {config.title}
            </p>
          ) : null}
          {config?.source_reference ? (
            <p className="mt-0.5 text-xs italic text-slate-500">
              {config.source_reference}
            </p>
          ) : null}
        </figcaption>
      )}
      <div
        className="max-h-[32rem] overflow-auto px-3 py-4 text-[1.05rem] leading-8 text-slate-800 sm:px-5 sm:text-[1.1rem] sm:leading-9"
        style={{
          fontFamily:
            "var(--font-plus-jakarta), ui-sans-serif, system-ui, sans-serif",
        }}
      >
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400">No passage text yet.</p>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className="flex items-start gap-3 sm:gap-4"
            >
              {showGutter && (
                <span
                  className="shrink-0 select-text pt-[0.15em] text-right text-[0.85em] tabular-nums leading-[inherit] text-slate-400"
                  style={{ width: `${gutterDigits + 0.9}ch` }}
                  title={row.showNumber ? `Line ${row.label}` : undefined}
                >
                  {row.showNumber ? row.label : ""}
                </span>
              )}
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                {row.text || "\u00a0"}
              </span>
            </div>
          ))
        )}
      </div>
    </figure>
  );
}
