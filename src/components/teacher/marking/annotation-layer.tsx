"use client";

import { useRef, useState } from "react";
import { StampImage } from "@/components/shared/stamp-image";
import {
  annotationStyle,
  type AnnotationTool,
  type MarkingStamp,
  type SubmissionAnnotation,
} from "@/lib/marking/annotation-types";

export function AnnotationLayer({
  annotations,
  tool,
  colour,
  selectedId,
  stampSizePct,
  stamps = [],
  onSelect,
  onCreate,
  onMove,
}: {
  annotations: SubmissionAnnotation[];
  tool: AnnotationTool;
  colour: string;
  selectedId: string | null;
  stampSizePct: number;
  stamps?: MarkingStamp[];
  onSelect: (id: string | null) => void;
  onCreate: (draft: {
    annotation_type: SubmissionAnnotation["annotation_type"];
    x_norm: number;
    y_norm: number;
    w_norm: number;
    h_norm: number;
    text_content?: string | null;
    geometry?: Record<string, unknown>;
  }) => void;
  onMove: (
    id: string,
    next: Pick<SubmissionAnnotation, "x_norm" | "y_norm" | "w_norm" | "h_norm">,
  ) => void;
}) {
  const stampMap = new Map(stamps.map((s) => [s.id, s]));
  const rootRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [draftBox, setDraftBox] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  function toNorm(clientX: number, clientY: number) {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return { x: 0, y: 0 };
    }
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  }

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 z-20"
      style={{
        cursor:
          tool === "select"
            ? "default"
            : tool === "delete"
              ? "not-allowed"
              : "crosshair",
      }}
      onMouseDown={(e) => {
        if (tool === "select" || tool === "delete") return;
        const point = toNorm(e.clientX, e.clientY);
        setDragStart(point);
        setDraftBox({ x: point.x, y: point.y, w: 0, h: 0 });
      }}
      onMouseMove={(e) => {
        if (!dragStart) return;
        const point = toNorm(e.clientX, e.clientY);
        setDraftBox({
          x: Math.min(dragStart.x, point.x),
          y: Math.min(dragStart.y, point.y),
          w: Math.abs(point.x - dragStart.x),
          h: Math.abs(point.y - dragStart.y),
        });
      }}
      onMouseUp={() => {
        if (!dragStart || !draftBox) {
          setDragStart(null);
          setDraftBox(null);
          return;
        }
        if (tool === "stamp") {
          const size = stampSizePct / 100;
          onCreate({
            annotation_type: "stamp",
            x_norm: dragStart.x,
            y_norm: dragStart.y,
            w_norm: size,
            h_norm: size,
          });
        } else if (tool === "text_comment") {
          const text = window.prompt("Comment text");
          if (text?.trim()) {
            onCreate({
              annotation_type: "text_comment",
              x_norm: dragStart.x,
              y_norm: dragStart.y,
              w_norm: Math.max(draftBox.w, 0.18),
              h_norm: Math.max(draftBox.h, 0.08),
              text_content: text.trim(),
            });
          }
        } else if (tool === "area_comment") {
          const text = window.prompt("Area comment");
          onCreate({
            annotation_type: "area_comment",
            x_norm: draftBox.x,
            y_norm: draftBox.y,
            w_norm: Math.max(draftBox.w, 0.05),
            h_norm: Math.max(draftBox.h, 0.05),
            text_content: text?.trim() || "Area comment",
          });
        } else if (tool === "text_highlight" || tool === "freehand") {
          onCreate({
            annotation_type: tool === "freehand" ? "freehand" : "text_highlight",
            x_norm: draftBox.x,
            y_norm: draftBox.y,
            w_norm: Math.max(draftBox.w, 0.04),
            h_norm: Math.max(draftBox.h, tool === "freehand" ? 0.01 : 0.03),
            geometry:
              tool === "freehand"
                ? {
                    points: [
                      [dragStart.x, dragStart.y],
                      [draftBox.x + draftBox.w, draftBox.y + draftBox.h],
                    ],
                  }
                : {},
          });
        }
        setDragStart(null);
        setDraftBox(null);
      }}
    >
      {annotations.map((annotation) => {
        const selected = selectedId === annotation.id;
        return (
          <div
            key={annotation.id}
            role="button"
            tabIndex={0}
            aria-label={`${annotation.annotation_type} annotation`}
            className={`absolute rounded-sm border ${
              selected ? "border-slate-900" : "border-transparent"
            }`}
            style={{
              ...annotationStyle(annotation),
              backgroundColor:
                annotation.annotation_type === "stamp"
                  ? "transparent"
                  : annotation.colour,
              opacity:
                annotation.annotation_type === "stamp"
                  ? 1
                  : annotation.opacity,
              pointerEvents: "auto",
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(annotation.id);
            }}
            onMouseDown={(e) => {
              if (tool !== "select") return;
              e.stopPropagation();
              const start = toNorm(e.clientX, e.clientY);
              const origin = {
                x: annotation.x_norm,
                y: annotation.y_norm,
              };
              function onMoveWindow(ev: MouseEvent) {
                const point = toNorm(ev.clientX, ev.clientY);
                onMove(annotation.id, {
                  x_norm: Math.min(
                    1 - annotation.w_norm,
                    Math.max(0, origin.x + (point.x - start.x)),
                  ),
                  y_norm: Math.min(
                    1 - annotation.h_norm,
                    Math.max(0, origin.y + (point.y - start.y)),
                  ),
                  w_norm: annotation.w_norm,
                  h_norm: annotation.h_norm,
                });
              }
              function onUp() {
                window.removeEventListener("mousemove", onMoveWindow);
                window.removeEventListener("mouseup", onUp);
              }
              window.addEventListener("mousemove", onMoveWindow);
              window.addEventListener("mouseup", onUp);
            }}
          >
            {annotation.text_content ? (
              <p className="line-clamp-3 p-1 text-[10px] text-white">
                {annotation.text_content}
              </p>
            ) : null}
            {annotation.annotation_type === "stamp" ? (
              <div className="flex h-full w-full items-center justify-center">
                <StampImage
                  storagePath={
                    stampMap.get(annotation.stamp_id ?? "")?.storage_path
                  }
                  alt={
                    stampMap.get(annotation.stamp_id ?? "")?.accessible_label ??
                    "Stamp"
                  }
                  className="h-full w-full object-contain"
                />
              </div>
            ) : null}
          </div>
        );
      })}

      {draftBox ? (
        <div
          className="pointer-events-none absolute border border-dashed border-slate-700"
          style={{
            left: `${draftBox.x * 100}%`,
            top: `${draftBox.y * 100}%`,
            width: `${Math.max(draftBox.w * 100, 1)}%`,
            height: `${Math.max(draftBox.h * 100, 1)}%`,
            backgroundColor: colour,
            opacity: 0.2,
          }}
        />
      ) : null}
    </div>
  );
}
