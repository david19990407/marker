"use client";

import { Button } from "@/components/ui/button";
import { StampImage } from "@/components/shared/stamp-image";
import type { AnnotationTool } from "@/lib/marking/annotation-types";
import type { MarkingStamp } from "@/lib/marking/annotation-types";

const TOOLS: Array<{
  id: AnnotationTool;
  label: string;
  tip: string;
}> = [
  { id: "select", label: "Select", tip: "Select and move annotations" },
  { id: "text_highlight", label: "Highlight", tip: "Text highlighter" },
  { id: "freehand", label: "Pen", tip: "Freehand highlighter" },
  { id: "text_comment", label: "Note", tip: "Text comment" },
  { id: "area_comment", label: "Area", tip: "Area comment" },
  { id: "delete", label: "Delete", tip: "Delete selected annotation" },
];

const COLOURS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#111827"];

export function AnnotationToolbar({
  tool,
  colour,
  stamps,
  selectedStampId,
  canUndo,
  canRedo,
  onToolChange,
  onColourChange,
  onStampSelect,
  onUndo,
  onRedo,
}: {
  tool: AnnotationTool;
  colour: string;
  stamps: MarkingStamp[];
  selectedStampId: string | null;
  canUndo: boolean;
  canRedo: boolean;
  onToolChange: (tool: AnnotationTool) => void;
  onColourChange: (colour: string) => void;
  onStampSelect: (stampId: string) => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  return (
    <aside
      className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-slate-200 bg-white py-2"
      aria-label="Annotation tools"
    >
      {TOOLS.map((item) => (
        <button
          key={item.id}
          type="button"
          title={item.tip}
          aria-label={item.label}
          aria-pressed={tool === item.id}
          className={`flex h-10 w-10 items-center justify-center rounded-xl text-[11px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 ${
            tool === item.id
              ? "bg-slate-900 text-white"
              : "bg-slate-50 text-slate-700 hover:bg-slate-100"
          }`}
          onClick={() => onToolChange(item.id)}
        >
          {item.label.slice(0, 3)}
        </button>
      ))}

      <div className="my-1 h-px w-8 bg-slate-200" />

      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!canUndo}
        title="Undo"
        aria-label="Undo"
        onClick={onUndo}
      >
        ↶
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!canRedo}
        title="Redo"
        aria-label="Redo"
        onClick={onRedo}
      >
        ↷
      </Button>

      <div className="my-1 h-px w-8 bg-slate-200" />

      <div className="flex flex-col gap-1" role="group" aria-label="Colour">
        {COLOURS.map((c) => (
          <button
            key={c}
            type="button"
            title={`Colour ${c}`}
            aria-label={`Select colour ${c}`}
            aria-pressed={colour === c}
            className={`h-5 w-5 rounded-full border ${
              colour === c ? "ring-2 ring-slate-900" : "border-slate-300"
            }`}
            style={{ backgroundColor: c }}
            onClick={() => onColourChange(c)}
          />
        ))}
      </div>

      {stamps.length ? (
        <>
          <div className="my-1 h-px w-8 bg-slate-200" />
          <div className="flex max-h-40 flex-col gap-1 overflow-y-auto px-1">
            {stamps.map((stamp) => (
              <button
                key={stamp.id}
                type="button"
                title={stamp.accessible_label}
                aria-label={stamp.accessible_label}
                aria-pressed={selectedStampId === stamp.id && tool === "stamp"}
                className={`rounded-lg px-1 py-1 text-[10px] ${
                  selectedStampId === stamp.id && tool === "stamp"
                    ? "bg-rose-100 text-rose-800"
                    : "bg-slate-50 text-slate-700"
                }`}
                onClick={() => {
                  onStampSelect(stamp.id);
                  onToolChange("stamp");
                }}
              >
                <StampImage
                  storagePath={stamp.storage_path}
                  alt={stamp.accessible_label}
                  className="mx-auto h-5 w-5 object-contain"
                />
              </button>
            ))}
          </div>
        </>
      ) : null}
    </aside>
  );
}
