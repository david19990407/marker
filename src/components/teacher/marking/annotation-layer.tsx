"use client";

import { memo, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { StampImage } from "@/components/shared/stamp-image";
import {
  dragBoxFromPoints,
  exactAnnotationStyle,
  pointerToNorm,
  speechBubbleBox,
} from "@/lib/marking/annotation-geometry";
import {
  annotationStyle,
  type AnnotationTool,
  type MarkingStamp,
  type SubmissionAnnotation,
} from "@/lib/marking/annotation-types";

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

function AnnotationItem({
  annotation,
  selected,
  tool,
  stamps,
  openBubbleId,
  onSelect,
  onMoveLive,
  onMoveEnd,
  onResizeLive,
  onResizeEnd,
  onToggleBubble,
  onEditText,
}: {
  annotation: SubmissionAnnotation;
  selected: boolean;
  tool: AnnotationTool;
  stamps: MarkingStamp[];
  openBubbleId: string | null;
  onSelect: (id: string) => void;
  onMoveLive: (
    id: string,
    next: Pick<SubmissionAnnotation, "x_norm" | "y_norm" | "w_norm" | "h_norm">,
  ) => void;
  onMoveEnd: (id: string) => void;
  onResizeLive: (
    id: string,
    next: Pick<SubmissionAnnotation, "x_norm" | "y_norm" | "w_norm" | "h_norm">,
  ) => void;
  onResizeEnd: (id: string) => void;
  onToggleBubble: (id: string) => void;
  onEditText: (id: string) => void;
}) {
  const stamp = annotation.stamp_id
    ? stamps.find((s) => s.id === annotation.stamp_id)
    : null;
  const isBubble = annotation.annotation_type === "text_comment";
  const isBox = annotation.annotation_type === "area_comment";
  const isHighlight = annotation.annotation_type === "text_highlight";

  function beginPointerDrag(
    e: React.PointerEvent,
    mode: "move" | "resize",
    canvasEl: HTMLElement | null,
  ) {
    if (tool !== "select") return;
    e.stopPropagation();
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const rect = canvasEl?.getBoundingClientRect();
    if (!rect) return;
    const start = pointerToNorm(e.clientX, e.clientY, rect);
    const origin = {
      x: annotation.x_norm,
      y: annotation.y_norm,
      w: annotation.w_norm,
      h: annotation.h_norm,
    };
    let raf = 0;
    let latest = origin;

    function onMove(ev: PointerEvent) {
      if (!rect) return;
      const point = pointerToNorm(ev.clientX, ev.clientY, rect);
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      if (mode === "move") {
        latest = {
          x: Math.min(1 - origin.w, Math.max(0, origin.x + dx)),
          y: Math.min(1 - origin.h, Math.max(0, origin.y + dy)),
          w: origin.w,
          h: origin.h,
        };
      } else {
        latest = {
          x: origin.x,
          y: origin.y,
          w: Math.min(1 - origin.x, Math.max(0.005, origin.w + dx)),
          h: Math.min(1 - origin.y, Math.max(0.005, origin.h + dy)),
        };
      }
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const payload = {
          x_norm: latest.x,
          y_norm: latest.y,
          w_norm: latest.w,
          h_norm: latest.h,
        };
        if (mode === "move") onMoveLive(annotation.id, payload);
        else onResizeLive(annotation.id, payload);
      });
    }

    function onUp(ev: PointerEvent) {
      target.releasePointerCapture(ev.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      cancelAnimationFrame(raf);
      if (mode === "move") onMoveEnd(annotation.id);
      else onResizeEnd(annotation.id);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${annotation.annotation_type} annotation`}
      className="absolute box-border"
      style={{
        ...annotationStyle(annotation),
        zIndex: selected ? 30 : 20,
        outline: selected ? "2px solid #0f172a" : "none",
        outlineOffset: 0,
        backgroundColor: isHighlight
          ? annotation.colour
          : isBox
            ? `${annotation.colour}33`
            : "transparent",
        opacity: isHighlight ? annotation.opacity : 1,
        border: isBox ? `2px solid ${annotation.colour}` : "none",
        pointerEvents: "auto",
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(annotation.id);
        if (isBubble) onToggleBubble(annotation.id);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (isBox || isBubble) onEditText(annotation.id);
      }}
      onPointerDown={(e) => {
        const canvas = (e.currentTarget.parentElement as HTMLElement) ?? null;
        beginPointerDrag(e, "move", canvas);
      }}
    >
      {isBubble ? (
        <div
          className="flex h-full w-full items-center justify-center rounded-full shadow"
          style={{ backgroundColor: annotation.colour, color: "#fff" }}
          title={annotation.text_content ?? "Comment"}
        >
          <MessageCircle className="h-3 w-3" aria-hidden />
        </div>
      ) : null}

      {isBox && annotation.text_content ? (
        <p className="max-h-full overflow-auto p-1 text-[11px] leading-snug text-slate-900">
          {annotation.text_content}
        </p>
      ) : null}

      {annotation.annotation_type === "stamp" ? (
        <div className="flex h-full w-full items-center justify-center">
          <StampImage
            storagePath={stamp?.storage_path}
            alt={stamp?.accessible_label ?? "Stamp"}
            className="h-full w-full object-contain"
          />
        </div>
      ) : null}

      {selected && (isBox || isHighlight) ? (
        <button
          type="button"
          aria-label="Resize annotation"
          className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-se-resize rounded-sm border border-slate-900 bg-white"
          onPointerDown={(e) => {
            const canvas =
              (e.currentTarget.parentElement?.parentElement as HTMLElement) ??
              null;
            beginPointerDrag(e, "resize", canvas);
          }}
        />
      ) : null}

      {isBubble && openBubbleId === annotation.id && annotation.text_content ? (
        <div className="absolute left-full top-0 z-40 ml-2 w-48 rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-700 shadow-lg">
          {annotation.text_content}
        </div>
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
  onMoveLive,
  onMoveEnd,
  onEditText,
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
  onMoveLive: (
    id: string,
    next: Pick<SubmissionAnnotation, "x_norm" | "y_norm" | "w_norm" | "h_norm">,
  ) => void;
  onMoveEnd: (id: string) => void;
  onEditText: (id: string, text: string) => void;
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
  const [openBubbleId, setOpenBubbleId] = useState<string | null>(null);
  const draftRaf = useRef(0);

  function canvasRect() {
    return rootRef.current?.getBoundingClientRect() ?? null;
  }

  function promptText(label: string, initial = "") {
    return window.prompt(label, initial)?.trim() || null;
  }

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
          const size = stampSizePct / 100;
          onCreate({
            annotation_type: "stamp",
            x_norm: start.x,
            y_norm: start.y,
            w_norm: size,
            h_norm: size,
          });
          return;
        }

        if (tool === "text_comment") {
          const text = promptText("Speech-bubble comment");
          if (!text) return;
          const bubble = speechBubbleBox(start);
          onCreate({
            annotation_type: "text_comment",
            ...{
              x_norm: bubble.x,
              y_norm: bubble.y,
              w_norm: bubble.w,
              h_norm: bubble.h,
            },
            text_content: text,
          });
          return;
        }

        if (tool === "area_comment") {
          if (box.w < 0.005 && box.h < 0.005) return;
          const text = promptText("Box comment");
          if (!text) return;
          onCreate({
            annotation_type: "area_comment",
            x_norm: box.x,
            y_norm: box.y,
            w_norm: box.w,
            h_norm: box.h,
            text_content: text,
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
        <div key={annotation.id} data-annotation-item="true">
          <MemoAnnotationItem
            annotation={annotation}
            selected={selectedId === annotation.id}
            tool={tool}
            stamps={stamps}
            openBubbleId={openBubbleId}
            onSelect={onSelect}
            onMoveLive={onMoveLive}
            onMoveEnd={onMoveEnd}
            onResizeLive={onMoveLive}
            onResizeEnd={onMoveEnd}
            onToggleBubble={(id) =>
              setOpenBubbleId((prev) => (prev === id ? null : id))
            }
            onEditText={(id) => {
              const target = annotations.find((a) => a.id === id);
              if (!target) return;
              const next = promptText(
                "Edit comment",
                target.text_content ?? "",
              );
              if (next == null) return;
              onEditText(id, next);
            }}
          />
        </div>
      ))}

      {draftBox ? (
        <div
          className="pointer-events-none absolute box-border border border-dashed border-slate-700"
          style={{
            ...exactAnnotationStyle(draftBox),
            backgroundColor: colour,
            opacity: 0.25,
          }}
        />
      ) : null}
    </div>
  );
}
