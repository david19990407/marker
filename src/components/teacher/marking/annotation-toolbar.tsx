"use client";

import {
  ChevronDown,
  ChevronUp,
  Highlighter,
  MessageCircle,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  Redo2,
  Square,
  Trash2,
  Undo2,
} from "lucide-react";
import { StampImage } from "@/components/shared/stamp-image";
import type { AnnotationTool, MarkingStamp } from "@/lib/marking/annotation-types";
import { cn } from "@/lib/utils";

const TOOLS: Array<{
  id: AnnotationTool;
  tip: string;
  label: string;
  Icon: typeof MousePointer2;
}> = [
  {
    id: "select",
    tip: "Select and move annotations",
    label: "Selection tool",
    Icon: MousePointer2,
  },
  {
    id: "text_highlight",
    tip: "Highlight an area",
    label: "Highlight tool",
    Icon: Highlighter,
  },
  {
    id: "area_comment",
    tip: "Draw a rectangular box comment",
    label: "Box comment",
    Icon: Square,
  },
  {
    id: "text_comment",
    tip: "Place a speech-bubble comment",
    label: "Speech-bubble comment",
    Icon: MessageCircle,
  },
  {
    id: "delete",
    tip: "Delete selected annotation",
    label: "Delete selected annotation",
    Icon: Trash2,
  },
];

const COLOURS = [
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#111827",
];

const btnClass =
  "flex h-10 w-10 items-center justify-center rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-40";

export function AnnotationToolbar({
  tool,
  colour,
  stamps,
  selectedStampId,
  canUndo,
  canRedo,
  docked,
  collapsed,
  floatingPos,
  onToolChange,
  onColourChange,
  onStampSelect,
  onUndo,
  onRedo,
  onToggleDock,
  onToggleCollapse,
  onFloatDragStart,
}: {
  tool: AnnotationTool;
  colour: string;
  stamps: MarkingStamp[];
  selectedStampId: string | null;
  canUndo: boolean;
  canRedo: boolean;
  docked: boolean;
  collapsed: boolean;
  floatingPos: { x: number; y: number };
  onToolChange: (tool: AnnotationTool) => void;
  onColourChange: (colour: string) => void;
  onStampSelect: (stampId: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleDock: () => void;
  onToggleCollapse: () => void;
  onFloatDragStart: (e: React.PointerEvent) => void;
}) {
  const shell = (
    <aside
      className={cn(
        "flex flex-col items-center gap-1 border border-slate-200 bg-white py-2 shadow-sm",
        docked
          ? "h-full w-14 shrink-0 rounded-none border-y-0 border-l-0"
          : "w-14 rounded-2xl shadow-lg",
        collapsed && "py-1",
      )}
      aria-label="Annotation tools"
      style={
        docked
          ? undefined
          : {
              position: "fixed",
              left: floatingPos.x,
              top: floatingPos.y,
              zIndex: 60,
            }
      }
    >
      <div className="flex w-full flex-col items-center gap-1 px-1">
        <button
          type="button"
          className={btnClass}
          title={docked ? "Undock toolbar" : "Redock toolbar"}
          aria-label={docked ? "Undock toolbar" : "Redock toolbar"}
          onClick={onToggleDock}
        >
          {docked ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
        {!docked ? (
          <button
            type="button"
            className={cn(btnClass, "cursor-grab active:cursor-grabbing")}
            title="Drag toolbar"
            aria-label="Drag floating toolbar"
            onPointerDown={onFloatDragStart}
          >
            <span className="text-[10px] font-semibold text-slate-500">⠿</span>
          </button>
        ) : null}
        <button
          type="button"
          className={btnClass}
          title={collapsed ? "Expand toolbar" : "Collapse toolbar"}
          aria-label={collapsed ? "Expand toolbar" : "Collapse toolbar"}
          onClick={onToggleCollapse}
        >
          {collapsed ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </button>
      </div>

      {!collapsed ? (
        <>
          <div className="my-1 h-px w-8 bg-slate-200" />
          {TOOLS.map((item) => {
            const Icon = item.Icon;
            const selected = tool === item.id;
            return (
              <button
                key={item.id}
                type="button"
                title={item.tip}
                aria-label={item.label}
                aria-pressed={selected}
                className={cn(
                  btnClass,
                  selected
                    ? "bg-slate-900 text-white"
                    : "bg-slate-50 text-slate-700 hover:bg-slate-100",
                )}
                onClick={() => onToolChange(item.id)}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </button>
            );
          })}

          <div className="my-1 h-px w-8 bg-slate-200" />

          <button
            type="button"
            className={btnClass}
            disabled={!canUndo}
            title="Undo"
            aria-label="Undo"
            onClick={onUndo}
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={btnClass}
            disabled={!canRedo}
            title="Redo"
            aria-label="Redo"
            onClick={onRedo}
          >
            <Redo2 className="h-4 w-4" />
          </button>

          <div className="my-1 h-px w-8 bg-slate-200" />

          <div className="flex flex-col gap-1" role="group" aria-label="Colour">
            {COLOURS.map((c) => (
              <button
                key={c}
                type="button"
                title={`Colour ${c}`}
                aria-label={`Select colour ${c}`}
                aria-pressed={colour === c}
                className={cn(
                  "h-5 w-5 rounded-full border focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500",
                  colour === c ? "ring-2 ring-slate-900" : "border-slate-300",
                )}
                style={{ backgroundColor: c }}
                onClick={() => onColourChange(c)}
              />
            ))}
          </div>

          {stamps.length ? (
            <>
              <div className="my-1 h-px w-8 bg-slate-200" />
              <div className="flex max-h-36 flex-col gap-1 overflow-y-auto px-1">
                {stamps.map((stamp) => (
                  <button
                    key={stamp.id}
                    type="button"
                    title={stamp.accessible_label}
                    aria-label={stamp.accessible_label}
                    aria-pressed={
                      selectedStampId === stamp.id && tool === "stamp"
                    }
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-xl",
                      selectedStampId === stamp.id && tool === "stamp"
                        ? "bg-rose-100"
                        : "bg-slate-50",
                    )}
                    onClick={() => {
                      onStampSelect(stamp.id);
                      onToolChange("stamp");
                    }}
                  >
                    <StampImage
                      storagePath={stamp.storage_path}
                      alt={stamp.accessible_label}
                      className="h-5 w-5 object-contain"
                    />
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </aside>
  );

  return shell;
}
