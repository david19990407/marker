"use client";

import type { PassageConfig } from "@/lib/types";

export function PassageView({
  text,
  config,
}: {
  text: string;
  config?: PassageConfig | null;
}) {
  const showLines = config?.show_line_numbers ?? false;
  const interval = Math.max(1, config?.line_number_interval ?? 5);
  const start = Math.max(1, config?.starting_line_number ?? 1);
  const paragraphs = text.replace(/\r\n/g, "\n").split("\n");

  let lineNo = start;
  const rows: Array<{ n: number | null; text: string }> = [];

  for (const para of paragraphs) {
    if (para === "" && rows.length > 0) {
      rows.push({ n: null, text: "" });
      continue;
    }
    // Wrap long paragraphs by approximate visual lines (~80 chars)
    const chunks = wrapLine(para, 80);
    for (const chunk of chunks) {
      const show = showLines && (lineNo - start) % interval === 0;
      rows.push({ n: show ? lineNo : showLines ? null : null, text: chunk });
      if (showLines) lineNo += 1;
    }
  }

  return (
    <figure className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {(config?.title || config?.source_reference) && (
        <figcaption className="border-b border-slate-100 px-4 py-3">
          {config?.title ? (
            <p className="text-sm font-semibold text-slate-800">{config.title}</p>
          ) : null}
          {config?.source_reference ? (
            <p className="text-xs text-slate-500">{config.source_reference}</p>
          ) : null}
        </figcaption>
      )}
      <div className="max-h-[28rem] overflow-auto px-2 py-3 font-mono text-sm leading-7 text-slate-800">
        {rows.map((row, i) => (
          <div key={i} className="flex gap-3 px-2">
            {showLines && (
              <span
                className="w-8 shrink-0 select-none text-right text-xs text-slate-400"
                aria-hidden
              >
                {row.n ?? ""}
              </span>
            )}
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
              {row.text || "\u00a0"}
            </span>
          </div>
        ))}
      </div>
    </figure>
  );
}

function wrapLine(text: string, width: number): string[] {
  if (!text) return [""];
  const words = text.split(/(\s+)/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + word).length > width && current.trim()) {
      lines.push(current);
      current = word.trimStart();
    } else {
      current += word;
    }
  }
  if (current || lines.length === 0) lines.push(current);
  return lines;
}
