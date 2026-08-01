"use client";

import type { PassageConfig } from "@/lib/types";
import { buildPassageRows } from "@/lib/homework/passage-numbering";

const PASSAGE_FONT =
  "var(--font-plus-jakarta), ui-sans-serif, system-ui, sans-serif";

export function PassageView({
  text,
  config,
  startLineNumber,
  className = "",
}: {
  text: string;
  config?: PassageConfig | null;
  /** Deprecated — labels come only from stored row.label values. */
  startLineNumber?: number;
  className?: string;
}) {
  void startLineNumber;
  const { rows, showGutter } = buildPassageRows(text, config);
  const gutterDigits = Math.min(
    4,
    Math.max(1, ...rows.map((r) => (r.label ? String(r.label).length : 0)), 1),
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
        style={{ fontFamily: PASSAGE_FONT }}
      >
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400">No passage text yet.</p>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="flex items-baseline gap-2 sm:gap-2.5">
              {showGutter ? (
                <span
                  className="shrink-0 select-text text-right font-normal tabular-nums text-slate-600"
                  style={{
                    fontFamily: PASSAGE_FONT,
                    fontSize: "inherit",
                    fontWeight: "inherit",
                    lineHeight: "inherit",
                    width: `${gutterDigits + 0.5}ch`,
                  }}
                  aria-label={row.label ? `Line ${row.label}` : undefined}
                >
                  {row.label ?? ""}
                </span>
              ) : null}
              <span
                className="min-w-0 flex-1 whitespace-pre-wrap break-words font-normal"
                style={{
                  fontFamily: PASSAGE_FONT,
                  fontSize: "inherit",
                  fontWeight: "inherit",
                  lineHeight: "inherit",
                }}
              >
                {row.text || "\u00a0"}
              </span>
            </div>
          ))
        )}
      </div>
    </figure>
  );
}
