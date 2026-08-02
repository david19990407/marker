"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { StampImage } from "@/components/shared/stamp-image";
import {
  dragBoxFromPoints,
  exactAnnotationStyle,
  pointerToNorm,
  readCollapsed,
  readSpeechTail,
  stampNormSize,
  tailFromPointer,
  type TailEdge,
} from "@/lib/marking/annotation-geometry";
import { placeBoxCommentAtPoint } from "@/lib/marking/box-comment-size";
import {
  annotationStyle,
  type AnnotationTool,
  type MarkingStamp,
  type SubmissionAnnotation,
} from "@/lib/marking/annotation-types";

type GeometryPatch = Pick<
  SubmissionAnnotation,
  "x_norm" | "y_norm" | "w_norm" | "h_norm"
> & {
  geometry?: Record<string, unknown>;
  text_content?: string | null;
  colour?: string;
  opacity?: number;
};

type CreateDraft = {
  annotation_type: SubmissionAnnotation["annotation_type"];
  x_norm: number;
  y_norm: number;
  w_norm: number;
  h_norm: number;
  text_content?: string | null;
  geometry?: Record<string, unknown>;
  source_comment_item_id?: string | null;
};

type DragMode = "move" | "resize" | "tail";

function SelectionOutline({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-[2px]"
      style={{ outline: "2px solid #0f172a", outlineOffset: 1 }}
    />
  );
}

function ResizeHandle({
  onPointerDown,
}: {
  onPointerDown: (e: ReactPointerEvent) => void;
}) {
  return (
    <button
      type="button"
      aria-label="Resize annotation"
      className="absolute -bottom-1.5 -right-1.5 z-10 h-3 w-3 cursor-se-resize rounded-sm border border-slate-900 bg-white"
      onPointerDown={onPointerDown}
    />
  );
}

function SpeechTail({
  edge,
  offset,
  colour,
  interactive,
  onTailPointerDown,
}: {
  edge: TailEdge;
  offset: number;
  colour: string;
  interactive: boolean;
  onTailPointerDown?: (e: ReactPointerEvent) => void;
}) {
  const o = Math.min(0.9, Math.max(0.1, offset));
  const tip: CSSProperties =
    edge === "bottom"
      ? { left: `${o * 100}%`, bottom: -22, transform: "translateX(-50%)" }
      : edge === "top"
        ? { left: `${o * 100}%`, top: -22, transform: "translateX(-50%)" }
        : edge === "left"
          ? { top: `${o * 100}%`, left: -22, transform: "translateY(-50%)" }
          : { top: `${o * 100}%`, right: -22, transform: "translateY(-50%)" };

  const triangle: CSSProperties =
    edge === "bottom"
      ? {
          left: `${o * 100}%`,
          bottom: -10,
          transform: "translateX(-50%)",
          borderLeft: "8px solid transparent",
          borderRight: "8px solid transparent",
          borderTop: `10px solid ${colour}`,
        }
      : edge === "top"
        ? {
            left: `${o * 100}%`,
            top: -10,
            transform: "translateX(-50%)",
            borderLeft: "8px solid transparent",
            borderRight: "8px solid transparent",
            borderBottom: `10px solid ${colour}`,
          }
        : edge === "left"
          ? {
              top: `${o * 100}%`,
              left: -10,
              transform: "translateY(-50%)",
              borderTop: "8px solid transparent",
              borderBottom: "8px solid transparent",
              borderRight: `10px solid ${colour}`,
            }
          : {
              top: `${o * 100}%`,
              right: -10,
              transform: "translateY(-50%)",
              borderTop: "8px solid transparent",
              borderBottom: "8px solid transparent",
              borderLeft: `10px solid ${colour}`,
            };

  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute h-0 w-0"
        style={triangle}
      />
      <span
        role={interactive ? "button" : undefined}
        aria-label={interactive ? "Move speech-bubble tail" : undefined}
        tabIndex={interactive ? 0 : undefined}
        className="absolute h-3 w-3 rotate-45 border border-red-600 bg-amber-300"
        style={{
          ...tip,
          pointerEvents: interactive ? "auto" : "none",
          cursor: interactive ? "grab" : "default",
          zIndex: 3,
        }}
        onPointerDown={interactive ? onTailPointerDown : undefined}
      />
    </>
  );
}

function AnnotationItem({
  annotation,
  selected,
  tool,
  stamps,
  canvasRef,
  onSelect,
  onCommit,
  onToggleCollapse,
  onEditText,
  onDelete,
  workspaceSelector = "[data-marking-worksheet-scroll]",
}: {
  annotation: SubmissionAnnotation;
  selected: boolean;
  tool: AnnotationTool;
  stamps: MarkingStamp[];
  canvasRef: RefObject<HTMLDivElement | null>;
  onSelect: (id: string) => void;
  onCommit: (id: string, patch: GeometryPatch) => void;
  onToggleCollapse: (id: string) => void;
  onEditText: (id: string) => void;
  onDelete: (id: string) => void;
  workspaceSelector?: string;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    origin: { x: number; y: number; w: number; h: number };
    rectW: number;
    rectH: number;
    pending: GeometryPatch | null;
    raf: number;
  } | null>(null);
  const [liveTail, setLiveTail] = useState<{
    tail_edge: TailEdge;
    tail_offset: number;
  } | null>(null);

  const stamp = annotation.stamp_id
    ? stamps.find((s) => s.id === annotation.stamp_id)
    : null;
  const isBubble = annotation.annotation_type === "text_comment";
  const isBox = annotation.annotation_type === "area_comment";
  const isHighlight = annotation.annotation_type === "text_highlight";
  const isStamp = annotation.annotation_type === "stamp";
  const collapsed = readCollapsed(annotation.geometry);
  const tail = readSpeechTail(annotation.geometry);
  const displayTail = liveTail ?? {
    tail_edge: tail.tail_edge,
    tail_offset: tail.tail_offset,
  };
  const interactive = tool === "select";

  const applyLiveStyle = useCallback((patch: GeometryPatch) => {
    const el = elRef.current;
    if (!el) return;
    el.style.left = `${patch.x_norm * 100}%`;
    el.style.top = `${patch.y_norm * 100}%`;
    el.style.width = `${patch.w_norm * 100}%`;
    el.style.height = `${patch.h_norm * 100}%`;
  }, []);

  function beginDrag(e: ReactPointerEvent, mode: DragMode) {
    if (tool !== "select") return;
    e.stopPropagation();
    e.preventDefault();
    const canvas = canvasRef.current;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const rect = canvas?.getBoundingClientRect();
    if (!rect) return;

    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origin: {
        x: annotation.x_norm,
        y: annotation.y_norm,
        w: annotation.w_norm,
        h: annotation.h_norm,
      },
      rectW: rect.width,
      rectH: rect.height,
      pending: null,
      raf: 0,
    };

    onSelect(annotation.id);

    function onMove(ev: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      const dx = (ev.clientX - d.startX) / d.rectW;
      const dy = (ev.clientY - d.startY) / d.rectH;

      if (d.mode === "tail") {
        const bubbleEl = elRef.current;
        if (!bubbleEl) return;
        const bubbleRect = bubbleEl.getBoundingClientRect();
        const nextTail = tailFromPointer(ev.clientX, ev.clientY, bubbleRect);
        d.pending = {
          x_norm: d.origin.x,
          y_norm: d.origin.y,
          w_norm: d.origin.w,
          h_norm: d.origin.h,
          geometry: {
            ...annotation.geometry,
            ...nextTail,
          },
        };
        cancelAnimationFrame(d.raf);
        d.raf = requestAnimationFrame(() => setLiveTail(nextTail));
        return;
      }

      let latest: GeometryPatch;
      if (d.mode === "move") {
        latest = {
          x_norm: Math.min(1 - d.origin.w, Math.max(0, d.origin.x + dx)),
          y_norm: Math.min(1 - d.origin.h, Math.max(0, d.origin.y + dy)),
          w_norm: d.origin.w,
          h_norm: d.origin.h,
        };
      } else {
        latest = {
          x_norm: d.origin.x,
          y_norm: d.origin.y,
          w_norm: Math.min(1 - d.origin.x, Math.max(0.008, d.origin.w + dx)),
          h_norm: Math.min(1 - d.origin.y, Math.max(0.008, d.origin.h + dy)),
        };
      }
      d.pending = latest;
      cancelAnimationFrame(d.raf);
      d.raf = requestAnimationFrame(() => applyLiveStyle(latest));
    }

    function onUp(ev: PointerEvent) {
      const d = dragRef.current;
      target.releasePointerCapture(ev.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (d) cancelAnimationFrame(d.raf);
      dragRef.current = null;
      setLiveTail(null);

      // Dragging outside the grey worksheet workspace deletes the annotation.
      if (d?.mode === "move") {
        const scroll = document.querySelector(workspaceSelector);
        if (scroll) {
          const bounds = scroll.getBoundingClientRect();
          const outside =
            ev.clientX < bounds.left ||
            ev.clientX > bounds.right ||
            ev.clientY < bounds.top ||
            ev.clientY > bounds.bottom;
          if (outside) {
            onDelete(annotation.id);
            return;
          }
        }
      }

      if (d?.pending) {
        onCommit(annotation.id, d.pending);
      }
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // Collapsed marker: compact footprint at the annotation origin.
  if ((isBox || isBubble) && collapsed) {
    return (
      <div
        ref={elRef}
        data-annotation-item="true"
        role="button"
        tabIndex={0}
        aria-label={`Collapsed ${isBubble ? "speech bubble" : "box"} comment`}
        className="absolute z-20"
        style={{
          left: `${annotation.x_norm * 100}%`,
          top: `${annotation.y_norm * 100}%`,
          width: 28,
          height: 28,
          cursor: interactive ? "move" : "default",
          pointerEvents: interactive || tool === "delete" ? "auto" : "none",
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(annotation.id);
          onToggleCollapse(annotation.id);
        }}
        onPointerDown={(e) => beginDrag(e, "move")}
      >
        {isBubble ? (
          <span
            className="relative flex h-7 w-7 items-center justify-center rounded-full border-2 bg-white text-[10px] font-semibold shadow-sm"
            style={{ borderColor: annotation.colour || "#dc2626", color: "#dc2626" }}
            title={annotation.text_content ?? "Comment"}
          >
            …
            <span
              aria-hidden
              className="absolute -bottom-1 left-1/2 h-0 w-0 -translate-x-1/2"
              style={{
                borderLeft: "5px solid transparent",
                borderRight: "5px solid transparent",
                borderTop: `6px solid ${annotation.colour || "#dc2626"}`,
              }}
            />
          </span>
        ) : (
          <span
            className="block h-4 w-4 rounded-sm border-2 bg-white shadow-sm"
            style={{ borderColor: annotation.colour || "#dc2626" }}
            title={annotation.text_content ?? "Comment"}
          />
        )}
      </div>
    );
  }

  const outlineColour = annotation.colour || "#dc2626";

  return (
    <div
      ref={elRef}
      data-annotation-item="true"
      role="button"
      tabIndex={0}
      aria-label={`${annotation.annotation_type} annotation`}
      className="absolute box-border"
      style={{
        ...annotationStyle(annotation),
        zIndex: selected ? 30 : 20,
        cursor: interactive ? "move" : "default",
        backgroundColor: isHighlight
          ? annotation.colour
          : isBox || isBubble
            ? "#ffffff"
            : "transparent",
        opacity: isHighlight ? annotation.opacity : 1,
        border:
          isBox || isBubble
            ? `1.5px solid ${outlineColour}`
            : "none",
        borderRadius: isBubble ? 8 : isBox ? 2 : 0,
        boxShadow: "none",
        overflow: isBubble || isBox || isStamp ? "visible" : "hidden",
        padding: isBox || isBubble ? 4 : 0,
        pointerEvents:
          tool === "select" || tool === "delete"
            ? "auto"
            : "none",
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(annotation.id);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (isBox || isBubble) onEditText(annotation.id);
      }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("[data-resize-handle],[data-tail-handle],[data-collapse-btn]")) {
          return;
        }
        beginDrag(e, "move");
      }}
    >
      {isBox ? (
        <>
          <span
            aria-hidden
            className="absolute -left-1.5 -top-1.5 h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: outlineColour }}
          />
          <p className="max-h-full overflow-auto text-[11px] leading-snug text-slate-900">
            {annotation.text_content || ""}
          </p>
        </>
      ) : null}

      {isBubble ? (
        <>
          <span data-tail-handle="true">
            <SpeechTail
              edge={displayTail.tail_edge}
              offset={displayTail.tail_offset}
              colour={outlineColour}
              interactive={selected && interactive}
              onTailPointerDown={(e) => {
                e.stopPropagation();
                beginDrag(e, "tail");
              }}
            />
          </span>
          <p className="max-h-full overflow-auto text-[11px] leading-snug text-slate-900">
            {annotation.text_content || "Comment"}
          </p>
        </>
      ) : null}

      {isStamp ? (
        <StampImage
          storagePath={stamp?.storage_path}
          alt={stamp?.accessible_label ?? "Stamp"}
          className="pointer-events-none block h-full w-full object-contain"
        />
      ) : null}

      {/* Stamps: image only — no selection frame or resize handles. */}
      <SelectionOutline show={selected && !isStamp && !isBox} />

      {selected && interactive && (isBox || isHighlight || isBubble) ? (
        <span data-resize-handle="true">
          <ResizeHandle
            onPointerDown={(e) => {
              e.stopPropagation();
              beginDrag(e, "resize");
            }}
          />
        </span>
      ) : null}

      {selected && interactive && isBubble ? (
        <button
          type="button"
          data-collapse-btn="true"
          aria-label="Collapse comment"
          className="absolute -right-2 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] text-slate-700 shadow"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse(annotation.id);
          }}
        >
          –
        </button>
      ) : null}
    </div>
  );
}

const MemoAnnotationItem = memo(AnnotationItem);

export function AnnotationLayer({
  annotations,
  tool,
  colour,
  selectedId,
  stampSizePct,
  stamps = [],
  onSelect,
  onCreate,
  onCommitGeometry,
  onEditText,
  onToggleCollapse,
  onDeleteSelected,
  onCommentDrop,
}: {
  annotations: SubmissionAnnotation[];
  tool: AnnotationTool;
  colour: string;
  selectedId: string | null;
  stampSizePct: number;
  stamps?: MarkingStamp[];
  onSelect: (id: string | null) => void;
  onCreate: (draft: CreateDraft) => void;
  /** Persist geometry only after pointer release — never during drag. */
  onCommitGeometry: (id: string, patch: GeometryPatch) => void;
  onEditText: (id: string, text: string) => void;
  onToggleCollapse: (id: string) => void;
  onDeleteSelected: (id?: string) => void;
  onCommentDrop?: (
    point: { x: number; y: number },
    comment: { id: string; text: string },
  ) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [draftBox, setDraftBox] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const draftRaf = useRef(0);

  function canvasRect() {
    return rootRef.current?.getBoundingClientRect() ?? null;
  }

  function promptText(label: string, initial = "") {
    return window.prompt(label, initial)?.trim() || null;
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inEditor =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (e.key === "Escape") {
        onSelect(null);
        return;
      }
      if (
        !inEditor &&
        selectedId &&
        (e.key === "Delete" || e.key === "Backspace")
      ) {
        e.preventDefault();
        onDeleteSelected(selectedId);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDeleteSelected, onSelect, selectedId]);

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 z-20"
      data-annotation-canvas="true"
      style={{
        cursor:
          tool === "select"
            ? "default"
            : tool === "delete"
              ? "not-allowed"
              : "crosshair",
      }}
      onClick={() => {
        if (tool === "select") onSelect(null);
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-comment-bank-item")) {
          e.preventDefault();
        }
      }}
      onDrop={(e) => {
        const raw = e.dataTransfer.getData("application/x-comment-bank-item");
        if (!raw || !onCommentDrop) return;
        e.preventDefault();
        const rect = canvasRect();
        if (!rect) return;
        try {
          const payload = JSON.parse(raw) as { id: string; text: string };
          const point = pointerToNorm(e.clientX, e.clientY, rect);
          onCommentDrop(point, payload);
        } catch {
          // ignore malformed payload
        }
      }}
      onPointerDown={(e) => {
        if (tool === "select" || tool === "delete") return;
        if ((e.target as HTMLElement).closest("[data-annotation-item]")) return;
        const rect = canvasRect();
        if (!rect) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const point = pointerToNorm(e.clientX, e.clientY, rect);
        dragStartRef.current = point;
        setDraftBox({ x: point.x, y: point.y, w: 0, h: 0 });
      }}
      onPointerMove={(e) => {
        const start = dragStartRef.current;
        if (!start) return;
        const rect = canvasRect();
        if (!rect) return;
        const point = pointerToNorm(e.clientX, e.clientY, rect);
        const box = dragBoxFromPoints(start, point);
        cancelAnimationFrame(draftRaf.current);
        draftRaf.current = requestAnimationFrame(() => setDraftBox(box));
      }}
      onPointerUp={(e) => {
        const start = dragStartRef.current;
        const rect = canvasRect();
        dragStartRef.current = null;
        cancelAnimationFrame(draftRaf.current);
        if (!start || !rect) {
          setDraftBox(null);
          return;
        }
        const end = pointerToNorm(e.clientX, e.clientY, rect);
        const box = dragBoxFromPoints(start, end);
        setDraftBox(null);

        if (tool === "stamp") {
          const aspect = rect.width / Math.max(1, rect.height);
          const size = stampNormSize(stampSizePct, aspect);
          onCreate({
            annotation_type: "stamp",
            x_norm: clampPoint(start.x, size.w),
            y_norm: clampPoint(start.y, size.h),
            w_norm: size.w,
            h_norm: size.h,
            geometry: { stamp_normalised: true },
          });
          return;
        }

        // Speech-bubble creation removed from the marking workflow.
        // Historical text_comment annotations still render for compatibility.

        if (tool === "area_comment") {
          const text = promptText("Box comment");
          if (!text) return;
          const placed = placeBoxCommentAtPoint(
            { x: box.w < 0.005 && box.h < 0.005 ? start.x : box.x, y: box.w < 0.005 && box.h < 0.005 ? start.y : box.y },
            text,
            rect.width,
            rect.height,
          );
          onCreate({
            annotation_type: "area_comment",
            x_norm: placed.x,
            y_norm: placed.y,
            w_norm: placed.w,
            h_norm: placed.h,
            text_content: text,
            geometry: { collapsed: false },
          });
          return;
        }

        if (tool === "text_highlight") {
          if (box.w < 0.001 && box.h < 0.001) return;
          onCreate({
            annotation_type: "text_highlight",
            x_norm: box.x,
            y_norm: box.y,
            w_norm: box.w,
            h_norm: box.h,
          });
        }
      }}
    >
      {annotations.map((annotation) => (
        <MemoAnnotationItem
          key={annotation.id}
          annotation={annotation}
          selected={selectedId === annotation.id}
          tool={tool}
          stamps={stamps}
          canvasRef={rootRef}
          onSelect={onSelect}
          onCommit={onCommitGeometry}
          onToggleCollapse={onToggleCollapse}
          onEditText={(id) => {
            const target = annotations.find((a) => a.id === id);
            if (!target) return;
            const next = promptText("Edit comment", target.text_content ?? "");
            if (next == null) return;
            onEditText(id, next);
          }}
          onDelete={(id) => onDeleteSelected(id)}
        />
      ))}

      {draftBox ? (
        <div
          className="pointer-events-none absolute box-border"
          style={{
            ...exactAnnotationStyle(draftBox),
            backgroundColor: tool === "area_comment" ? "#ffffff" : colour,
            opacity: tool === "text_highlight" ? 0.35 : 0.9,
            border:
              tool === "area_comment"
                ? `1.5px solid ${colour || "#dc2626"}`
                : `1px dashed ${colour}`,
            borderRadius: 4,
          }}
        />
      ) : null}
    </div>
  );
}

function clampPoint(origin: number, size: number) {
  return Math.min(1 - size, Math.max(0, origin - size / 2));
}
