"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Highlighter,
  Library,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  PinOff,
  Redo2,
  RotateCcw,
  Search,
  Square,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  StampImage,
  isStampImageReady,
} from "@/components/shared/stamp-image";
import type { AnnotationTool, MarkingStamp } from "@/lib/marking/annotation-types";
import {
  frequentToolbarStamps,
  orderStampsForTeacher,
  pinnedStampIds,
  type TeacherStampPreference,
} from "@/lib/marking/teacher-stamp-order";
import { cn } from "@/lib/utils";

const CORE_TOOLS: Array<{
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

function StampButton({
  stamp,
  selected,
  ready,
  onSelect,
  onPaletteDragStart,
  onToolChange,
  dragHandle,
}: {
  stamp: MarkingStamp;
  selected: boolean;
  ready: boolean;
  onSelect: (stampId: string) => void;
  onPaletteDragStart?: (stampId: string | null) => void;
  onToolChange: (tool: AnnotationTool) => void;
  dragHandle?: boolean;
}) {
  return (
    <button
      type="button"
      title={
        ready
          ? `${stamp.accessible_label} — click to place or drag onto worksheet`
          : `${stamp.accessible_label} (loading)`
      }
      aria-label={
        ready
          ? stamp.accessible_label
          : `${stamp.accessible_label}, still loading`
      }
      aria-pressed={selected}
      disabled={!ready}
      className={cn(
        "flex h-10 w-10 cursor-grab items-center justify-center rounded-xl active:cursor-grabbing",
        selected ? "bg-rose-100" : "bg-slate-50",
        !ready && "opacity-40",
        dragHandle && "ring-1 ring-slate-200",
      )}
      onPointerDown={(e) => {
        if (!ready || e.button !== 0) return;
        const startX = e.clientX;
        const startY = e.clientY;
        let started = false;
        const onMove = (ev: PointerEvent) => {
          if (
            Math.abs(ev.clientX - startX) < 4 &&
            Math.abs(ev.clientY - startY) < 4
          ) {
            return;
          }
          if (!started) {
            started = true;
            onSelect(stamp.id);
            onToolChange("stamp");
            onPaletteDragStart?.(stamp.id);
          }
        };
        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          if (!started) {
            onSelect(stamp.id);
            onToolChange("stamp");
          }
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      }}
    >
      <StampImage
        storagePath={stamp.storage_path}
        alt={stamp.accessible_label}
        className="h-5 w-5 object-contain"
      />
    </button>
  );
}

export function AnnotationToolbar({
  tool,
  colour,
  stamps,
  selectedStampId,
  readyStampPaths = new Set<string>(),
  stampPreferences = [],
  canUndo,
  canRedo,
  docked,
  collapsed,
  floatingPos,
  onToolChange,
  onColourChange,
  onStampSelect,
  onStampPaletteDragStart,
  onStampPreferencesChange,
  onResetStampPreferences,
  onUndo,
  onRedo,
  onDeleteSelected,
  onToggleDock,
  onToggleCollapse,
  onFloatDragStart,
}: {
  tool: AnnotationTool;
  colour: string;
  stamps: MarkingStamp[];
  selectedStampId: string | null;
  readyStampPaths?: Set<string>;
  stampPreferences?: TeacherStampPreference[];
  canUndo: boolean;
  canRedo: boolean;
  docked: boolean;
  collapsed: boolean;
  floatingPos: { x: number; y: number };
  onToolChange: (tool: AnnotationTool) => void;
  onColourChange: (colour: string) => void;
  onStampSelect: (stampId: string) => void;
  onStampPaletteDragStart?: (stampId: string | null) => void;
  onStampPreferencesChange?: (prefs: TeacherStampPreference[]) => void;
  onResetStampPreferences?: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDeleteSelected?: () => void;
  onToggleDock: () => void;
  onToggleCollapse: () => void;
  onFloatDragStart: (e: React.PointerEvent) => void;
}) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [reorderMode, setReorderMode] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const orderedStamps = useMemo(
    () => orderStampsForTeacher(stamps, stampPreferences),
    [stamps, stampPreferences],
  );
  const pinned = useMemo(
    () => pinnedStampIds(stampPreferences),
    [stampPreferences],
  );
  const frequent = useMemo(
    () => frequentToolbarStamps(orderedStamps, pinned, 6),
    [orderedStamps, pinned],
  );

  const libraryRows = useMemo(() => {
    const q = libraryQuery.trim().toLowerCase();
    return orderedStamps.filter(
      (s) =>
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.accessible_label.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q),
    );
  }, [libraryQuery, orderedStamps]);

  function prefsFromOrdered(
    nextOrdered: MarkingStamp[],
    nextPinned: Set<string> = pinned,
  ): TeacherStampPreference[] {
    return nextOrdered.map((stamp, index) => ({
      stamp_id: stamp.id,
      display_order: index,
      is_pinned: nextPinned.has(stamp.id),
    }));
  }

  function togglePin(stampId: string) {
    const nextPinned = new Set(pinned);
    if (nextPinned.has(stampId)) nextPinned.delete(stampId);
    else nextPinned.add(stampId);
    onStampPreferencesChange?.(prefsFromOrdered(orderedStamps, nextPinned));
  }

  function moveStamp(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || to >= orderedStamps.length) return;
    const next = [...orderedStamps];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    onStampPreferencesChange?.(prefsFromOrdered(next));
  }

  const shell = (
    <aside
      className={cn(
        "relative flex h-full min-h-0 flex-col items-center gap-1 border border-slate-200 bg-white py-2 shadow-sm",
        docked
          ? "w-14 min-w-14 shrink-0 rounded-none border-y-0 border-l-0"
          : "w-14 min-w-14 rounded-2xl shadow-lg",
        collapsed && "py-1",
      )}
      aria-label="Annotation tools"
      style={
        docked
          ? undefined
          : {
              position: "absolute",
              left: floatingPos.x,
              top: floatingPos.y,
              zIndex: 40,
              maxHeight: "calc(100% - 16px)",
            }
      }
    >
      <div className="flex w-full shrink-0 flex-col items-center gap-1 px-1">
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
          <div className="my-1 h-px w-8 shrink-0 bg-slate-200" />
          {CORE_TOOLS.map((item) => {
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
                  "shrink-0",
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

          <div className="my-1 h-px w-8 shrink-0 bg-slate-200" />

          <button
            type="button"
            className={cn(btnClass, "shrink-0")}
            disabled={!canUndo}
            title="Undo"
            aria-label="Undo"
            onClick={onUndo}
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={cn(btnClass, "shrink-0")}
            disabled={!canRedo}
            title="Redo"
            aria-label="Redo"
            onClick={onRedo}
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={cn(
              btnClass,
              "shrink-0",
              tool === "delete"
                ? "bg-slate-900 text-white"
                : "bg-slate-50 text-slate-700 hover:bg-slate-100",
            )}
            title="Delete selected annotation"
            aria-label="Delete selected annotation"
            aria-pressed={tool === "delete"}
            onClick={() => {
              if (tool === "delete") {
                onDeleteSelected?.();
                return;
              }
              onToolChange("delete");
            }}
          >
            <Trash2 className="h-4 w-4" />
          </button>

          <div className="my-1 h-px w-8 shrink-0 bg-slate-200" />

          <div
            className="flex shrink-0 flex-col gap-1"
            role="group"
            aria-label="Colour"
          >
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

          {orderedStamps.length ? (
            <>
              <div className="my-1 h-px w-8 shrink-0 bg-slate-200" />
              {/* Frequent stamps only — no nested toolbar scrollbar. */}
              <div
                className="flex shrink-0 flex-col gap-1 px-1"
                aria-label="Frequently used stamps"
              >
                {frequent.map((stamp) => {
                  const path = stamp.storage_path?.trim() || "";
                  const ready =
                    Boolean(path) &&
                    (readyStampPaths.has(path) || isStampImageReady(path));
                  return (
                    <StampButton
                      key={stamp.id}
                      stamp={stamp}
                      selected={
                        selectedStampId === stamp.id && tool === "stamp"
                      }
                      ready={ready}
                      onSelect={onStampSelect}
                      onPaletteDragStart={onStampPaletteDragStart}
                      onToolChange={onToolChange}
                    />
                  );
                })}
              </div>

              <button
                type="button"
                className={cn(
                  btnClass,
                  "shrink-0",
                  libraryOpen
                    ? "bg-slate-900 text-white"
                    : "bg-slate-50 text-slate-700 hover:bg-slate-100",
                )}
                title="All stamps"
                aria-label="Open all stamps library"
                aria-expanded={libraryOpen}
                onClick={() => setLibraryOpen((v) => !v)}
              >
                <Library className="h-4 w-4" />
              </button>
            </>
          ) : null}
        </>
      ) : null}

      {libraryOpen ? (
        <div
          className="absolute left-full top-0 z-50 ml-2 flex h-[min(70vh,560px)] w-72 flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
          role="dialog"
          aria-label="Stamp library"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input
              value={libraryQuery}
              onChange={(e) => setLibraryQuery(e.target.value)}
              placeholder="Search stamps"
              aria-label="Search stamps"
              className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
            />
          </div>
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <button
              type="button"
              className="rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50"
              onClick={() => setReorderMode((v) => !v)}
            >
              {reorderMode ? "Done reordering" : "Reorder stamps"}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50"
              title="Restore administrator order"
              onClick={() => {
                setReorderMode(false);
                onResetStampPreferences?.();
              }}
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          </div>
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
            {libraryRows.map((stamp, index) => {
              const path = stamp.storage_path?.trim() || "";
              const ready =
                Boolean(path) &&
                (readyStampPaths.has(path) || isStampImageReady(path));
              const isPinned = pinned.has(stamp.id);
              return (
                <li
                  key={stamp.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-100 px-2 py-1.5"
                  draggable={reorderMode}
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => {
                    if (!reorderMode) return;
                    e.preventDefault();
                  }}
                  onDrop={() => {
                    if (dragIndex == null) return;
                    moveStamp(dragIndex, index);
                    setDragIndex(null);
                  }}
                >
                  {reorderMode ? (
                    <GripVertical className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  ) : null}
                  <StampButton
                    stamp={stamp}
                    selected={selectedStampId === stamp.id && tool === "stamp"}
                    ready={ready}
                    onSelect={(id) => {
                      onStampSelect(id);
                      onToolChange("stamp");
                      setLibraryOpen(false);
                    }}
                    onPaletteDragStart={onStampPaletteDragStart}
                    onToolChange={onToolChange}
                    dragHandle={reorderMode}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-slate-800">
                      {stamp.name}
                    </p>
                    <p className="truncate text-[10px] text-slate-500">
                      {stamp.category}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded p-1 text-slate-500 hover:bg-slate-100"
                    title={isPinned ? "Unpin stamp" : "Pin stamp"}
                    aria-label={isPinned ? "Unpin stamp" : "Pin stamp"}
                    onClick={() => togglePin(stamp.id)}
                  >
                    {isPinned ? (
                      <Pin className="h-3.5 w-3.5 text-rose-600" />
                    ) : (
                      <PinOff className="h-3.5 w-3.5" />
                    )}
                  </button>
                </li>
              );
            })}
            {libraryRows.length === 0 ? (
              <li className="px-2 py-4 text-center text-xs text-slate-500">
                No stamps match.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </aside>
  );

  return shell;
}
