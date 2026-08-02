"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import { StampImage } from "@/components/shared/stamp-image";
import {
  dragBoxFromPoints,
  exactAnnotationStyle,
  pointerToNorm,
  readCollapsed,
  stampNormSize,
} from "@/lib/marking/annotation-geometry";
import {
  BOX_COMMENT_FONT,
  BOX_COMMENT_LINE_HEIGHT,
  BOX_COMMENT_PAD_X,
  BOX_COMMENT_PAD_Y,
  placeBoxCommentAtPoint,
  resizeBoxCommentForText,
  resizeBoxCommentWidth,
} from "@/lib/marking/box-comment-size";
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
  stamp_definition_id?: string | null;
  /** Start inline editing immediately after create (box tool click). */
  begin_inline_edit?: boolean;
};

type DragMode = "move" | "resize-right" | "resize-left" | "resize-se";

const boxTextStyle: CSSProperties = {
  font: BOX_COMMENT_FONT,
  lineHeight: BOX_COMMENT_LINE_HEIGHT,
  fontWeight: 400,
  color: "#111827",
  margin: 0,
  padding: 0,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  overflowWrap: "anywhere",
};

function InlineBoxCommentEditor({
  annotationId,
  initialText,
  annotation,
  canvasRef,
  onInlineTextChange,
  onLiveGeometry,
  onCommit,
  onEndInlineEdit,
}: {
  annotationId: string;
  initialText: string;
  annotation: SubmissionAnnotation;
  canvasRef: RefObject<HTMLDivElement | null>;
  onInlineTextChange: (id: string, text: string) => void;
  onLiveGeometry: Dispatch<SetStateAction<GeometryPatch | null>>;
  onCommit: (id: string, patch: GeometryPatch) => void;
  onEndInlineEdit: (id: string, cancel?: boolean) => void;
}) {
  const editRef = useRef<HTMLTextAreaElement | null>(null);
  const [draftText, setDraftText] = useState(initialText);

  useLayoutEffect(() => {
    const el = editRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    try {
      el.setSelectionRange(len, len);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <textarea
      ref={editRef}
      data-box-comment-editor="true"
      value={draftText}
      aria-label="Box comment text"
      className="block w-full resize-none border-0 bg-transparent p-0 outline-none"
      style={
        {
          ...boxTextStyle,
          minHeight: 16,
          height: "100%",
          fieldSizing: "content",
        } as CSSProperties
      }
      onChange={(e) => {
        const next = e.target.value;
        setDraftText(next);
        onInlineTextChange(annotationId, next);
        const canvas = canvasRef.current?.getBoundingClientRect();
        if (!canvas) return;
        const preferred =
          typeof annotation.geometry?.preferred_w_norm === "number"
            ? (annotation.geometry.preferred_w_norm as number)
            : annotation.w_norm;
        const sized = resizeBoxCommentForText(
          next,
          annotation.x_norm,
          annotation.y_norm,
          preferred,
          canvas.width,
          canvas.height,
        );
        onLiveGeometry({
          x_norm: sized.x_norm,
          y_norm: sized.y_norm,
          w_norm: sized.w_norm,
          h_norm: sized.h_norm,
          text_content: next,
          geometry: {
            ...(annotation.geometry ?? {}),
            preferred_w_norm: sized.w_norm,
          },
        });
      }}
      onBlur={() => {
        onLiveGeometry((current) => {
          if (current) onCommit(annotationId, current);
          return null;
        });
        onEndInlineEdit(annotationId, false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setDraftText(initialText);
          onLiveGeometry(null);
          onEndInlineEdit(annotationId, true);
        }
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

function HorizontalResizeEdge({
  side,
  onPointerDown,
}: {
  side: "left" | "right";
  onPointerDown: (e: ReactPointerEvent) => void;
}) {
  return (
    <button
      type="button"
      data-resize-handle="true"
      aria-label={
        side === "right"
          ? "Resize box comment width from the right edge"
          : "Resize box comment width from the left edge"
      }
      title="Drag to change width"
      className={`absolute top-0 z-10 h-full w-2 border-0 bg-transparent p-0 ${
        side === "right" ? "-right-1 cursor-ew-resize" : "-left-1 cursor-ew-resize"
      }`}
      onPointerDown={onPointerDown}
    />
  );
}

function StampResizeHandle({
  onPointerDown,
}: {
  onPointerDown: (e: ReactPointerEvent) => void;
}) {
  return (
    <button
      type="button"
      data-resize-handle="true"
      aria-label="Resize stamp"
      className="absolute -bottom-1.5 -right-1.5 z-10 h-3 w-3 cursor-se-resize rounded-sm border border-slate-700/70 bg-white"
      onPointerDown={onPointerDown}
    />
  );
}

function AnnotationItem({
  annotation,
  selected,
  editing,
  tool,
  stamps,
  canvasRef,
  onSelect,
  onCommit,
  onToggleCollapse,
  onBeginInlineEdit,
  onInlineTextChange,
  onEndInlineEdit,
  onDelete,
}: {
  annotation: SubmissionAnnotation;
  selected: boolean;
  editing: boolean;
  tool: AnnotationTool;
  stamps: MarkingStamp[];
  canvasRef: RefObject<HTMLDivElement | null>;
  onSelect: (id: string) => void;
  onCommit: (id: string, patch: GeometryPatch) => void;
  onToggleCollapse: (id: string) => void;
  onBeginInlineEdit: (id: string) => void;
  onInlineTextChange: (id: string, text: string) => void;
  onEndInlineEdit: (id: string, cancel?: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    ox: number;
    oy: number;
    ow: number;
    oh: number;
    text: string;
  } | null>(null);
  const [live, setLive] = useState<GeometryPatch | null>(null);

  const collapsed = readCollapsed(annotation.geometry);
  const isBox = annotation.annotation_type === "area_comment";
  const isBubble = annotation.annotation_type === "text_comment";
  const isStamp = annotation.annotation_type === "stamp";
  const isHighlight = annotation.annotation_type === "text_highlight";
  const interactive = tool === "select";
  const display = live
    ? { ...annotation, ...live }
    : annotation;

  const beginDrag = useCallback(
    (e: ReactPointerEvent, mode: DragMode) => {
      if (!interactive || editing) return;
      e.stopPropagation();
      e.preventDefault();
      onSelect(annotation.id);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        mode,
        startX: e.clientX,
        startY: e.clientY,
        ox: annotation.x_norm,
        oy: annotation.y_norm,
        ow: annotation.w_norm,
        oh: annotation.h_norm,
        text: annotation.text_content ?? "",
      };
    },
    [
      annotation.h_norm,
      annotation.id,
      annotation.text_content,
      annotation.w_norm,
      annotation.x_norm,
      annotation.y_norm,
      editing,
      interactive,
      onSelect,
    ],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const drag = dragRef.current;
      const canvas = canvasRef.current;
      if (!drag || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dx = (e.clientX - drag.startX) / Math.max(1, rect.width);
      const dy = (e.clientY - drag.startY) / Math.max(1, rect.height);

      if (drag.mode === "move") {
        setLive({
          x_norm: Math.min(1 - drag.ow, Math.max(0, drag.ox + dx)),
          y_norm: Math.min(1 - drag.oh, Math.max(0, drag.oy + dy)),
          w_norm: drag.ow,
          h_norm: drag.oh,
        });
        return;
      }

      if (drag.mode === "resize-se" && isStamp) {
        setLive({
          x_norm: drag.ox,
          y_norm: drag.oy,
          w_norm: Math.min(0.9, Math.max(0.04, drag.ow + dx)),
          h_norm: Math.min(0.9, Math.max(0.04, drag.oh + dy)),
        });
        return;
      }

      if ((drag.mode === "resize-right" || drag.mode === "resize-left") && isBox) {
        const nextW =
          drag.mode === "resize-right"
            ? Math.min(0.45, Math.max(0.08, drag.ow + dx))
            : Math.min(0.45, Math.max(0.08, drag.ow - dx));
        const sized = resizeBoxCommentWidth(
          drag.text,
          drag.ox,
          drag.oy,
          nextW,
          rect.width,
          rect.height,
          drag.mode === "resize-left" ? "right" : "left",
        );
        setLive({
          x_norm: sized.x_norm,
          y_norm: sized.y_norm,
          w_norm: sized.w_norm,
          h_norm: sized.h_norm,
          geometry: {
            ...(annotation.geometry ?? {}),
            preferred_w_norm: sized.w_norm,
          },
        });
      }
    },
    [annotation.geometry, canvasRef, isBox, isStamp],
  );

  const endDrag = useCallback(
    (e: ReactPointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      setLive((current) => {
        if (current) onCommit(annotation.id, current);
        return null;
      });
    },
    [annotation.id, onCommit],
  );

  useEffect(() => {
    if (!selected || !interactive || editing) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Enter" && isBox) {
        ev.preventDefault();
        onBeginInlineEdit(annotation.id);
        return;
      }
      if (ev.key !== "Backspace" && ev.key !== "Delete") return;
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      ev.preventDefault();
      onDelete(annotation.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [annotation.id, editing, interactive, isBox, onBeginInlineEdit, onDelete, selected]);

  if (collapsed && (isBox || isBubble)) {
    return (
      <div
        ref={elRef}
        data-annotation-item="true"
        role="button"
        tabIndex={0}
        aria-label="Collapsed annotation"
        className="absolute"
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
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span
          className="block h-4 w-4 rounded-sm border-2 bg-white shadow-sm"
          style={{ borderColor: annotation.colour || "#dc2626" }}
          title={annotation.text_content ?? "Comment"}
        />
      </div>
    );
  }

  const outlineColour = annotation.colour || "#dc2626";
  const nearRight = display.x_norm + display.w_norm > 0.92;

  return (
    <div
      ref={elRef}
      data-annotation-item="true"
      role="button"
      tabIndex={0}
      aria-label={`${annotation.annotation_type} annotation`}
      className="absolute box-border"
      style={{
        ...annotationStyle(display),
        zIndex: selected || editing ? 30 : 20,
        cursor: interactive && !editing ? "move" : "default",
        backgroundColor: isHighlight
          ? annotation.colour
          : isBox || isBubble
            ? "#ffffff"
            : "transparent",
        opacity: isHighlight ? annotation.opacity : 1,
        border: isBox || isBubble ? `1.5px solid ${outlineColour}` : "none",
        borderRadius: isBox ? 2 : 0,
        boxShadow: selected && !editing ? "0 0 0 1px rgba(15,23,42,0.28)" : "none",
        overflow: isBox || isStamp ? "visible" : "hidden",
        padding: isBox
          ? `${BOX_COMMENT_PAD_Y}px ${BOX_COMMENT_PAD_X}px`
          : 0,
        pointerEvents: tool === "select" || tool === "delete" ? "auto" : "none",
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(annotation.id);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (isBox) onBeginInlineEdit(annotation.id);
      }}
      onPointerDown={(e) => {
        if (
          (e.target as HTMLElement).closest(
            "[data-resize-handle],[data-collapse-btn],textarea",
          )
        ) {
          return;
        }
        if (editing) return;
        beginDrag(e, "move");
      }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {isBox ? (
        <>
          <span
            aria-hidden
            className="absolute -left-1.5 -top-1.5 h-2 w-2 rounded-full"
            style={{ backgroundColor: outlineColour }}
          />
          {editing ? (
            <InlineBoxCommentEditor
              key={`box-edit-${annotation.id}`}
              annotationId={annotation.id}
              initialText={annotation.text_content ?? ""}
              annotation={annotation}
              canvasRef={canvasRef}
              onInlineTextChange={onInlineTextChange}
              onLiveGeometry={setLive}
              onCommit={onCommit}
              onEndInlineEdit={onEndInlineEdit}
            />
          ) : (
            <p style={boxTextStyle}>{annotation.text_content || ""}</p>
          )}
          {selected && interactive && !editing ? (
            <>
              <button
                type="button"
                data-collapse-btn="true"
                aria-label="Collapse comment"
                className="absolute -right-2 -top-2 z-10 flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-white text-[9px] text-slate-600"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCollapse(annotation.id);
                }}
              >
                −
              </button>
              {nearRight ? (
                <HorizontalResizeEdge
                  side="left"
                  onPointerDown={(e) => beginDrag(e, "resize-left")}
                />
              ) : (
                <HorizontalResizeEdge
                  side="right"
                  onPointerDown={(e) => beginDrag(e, "resize-right")}
                />
              )}
            </>
          ) : null}
        </>
      ) : null}

      {isStamp ? (
        <StampImage
          stamp={
            stamps.find(
              (s) =>
                s.id === annotation.stamp_id ||
                s.id ===
                  (annotation.geometry?.stamp_definition_id as string | undefined),
            ) ?? null
          }
          geometry={annotation.geometry}
          alt={
            (typeof annotation.geometry?.accessible_label_snapshot === "string"
              ? annotation.geometry.accessible_label_snapshot
              : null) ||
            annotation.text_content ||
            "Stamp"
          }
          className="h-full w-full object-contain"
        />
      ) : null}

      {selected && interactive && isStamp ? (
        <StampResizeHandle onPointerDown={(e) => beginDrag(e, "resize-se")} />
      ) : null}
    </div>
  );
}

const MemoAnnotationItem = memo(AnnotationItem);

export function AnnotationLayer({
  annotations,
  stamps,
  tool,
  selectedStampId,
  colour,
  selectedId,
  editingId,
  linkedCommentDrag,
  onSelect,
  onCreate,
  onCommitGeometry,
  onToggleCollapse,
  onBeginInlineEdit,
  onInlineTextChange,
  onEndInlineEdit,
  onDeleteSelected,
}: {
  annotations: SubmissionAnnotation[];
  stamps: MarkingStamp[];
  tool: AnnotationTool;
  selectedStampId: string | null;
  colour: string;
  selectedId: string | null;
  editingId: string | null;
  linkedCommentDrag: { itemId: string; text: string } | null;
  onSelect: (id: string | null) => void;
  onCreate: (draft: CreateDraft) => void;
  onCommitGeometry: (id: string, patch: GeometryPatch) => void;
  onToggleCollapse: (id: string) => void;
  onBeginInlineEdit: (id: string) => void;
  onInlineTextChange: (id: string, text: string) => void;
  onEndInlineEdit: (id: string, cancel?: boolean) => void;
  onDeleteSelected: (id: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [draftBox, setDraftBox] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  return (
    <div
      ref={rootRef}
      data-annotation-layer="true"
      className="absolute inset-0 z-[5]"
      style={{
        cursor:
          tool === "select" || tool === "delete"
            ? "default"
            : tool === "stamp" || tool === "area_comment"
              ? "crosshair"
              : "crosshair",
        pointerEvents: "auto",
      }}
      onDragOver={(e) => {
        if (
          linkedCommentDrag ||
          e.dataTransfer.types.includes("application/x-comment-bank-item")
        ) {
          e.preventDefault();
        }
      }}
      onDrop={(e) => {
        if (!rootRef.current) return;
        let itemId = linkedCommentDrag?.itemId ?? "";
        let text = linkedCommentDrag?.text ?? "";
        const raw = e.dataTransfer.getData("application/x-comment-bank-item");
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as { id?: string; text?: string };
            itemId = parsed.id ?? itemId;
            text = parsed.text ?? text;
          } catch {
            /* ignore */
          }
        }
        if (!text) return;
        e.preventDefault();
        const rect = rootRef.current.getBoundingClientRect();
        const norm = pointerToNorm(e.clientX, e.clientY, rect);
        const placed = placeBoxCommentAtPoint(
          norm.x,
          norm.y,
          text,
          rect.width,
          rect.height,
        );
        onCreate({
          annotation_type: "area_comment",
          ...placed,
          text_content: text,
          source_comment_item_id: itemId || null,
          geometry: {
            preferred_w_norm: placed.w_norm,
            text_snapshot: text,
          },
        });
      }}
      onPointerDown={(e) => {
        if (!rootRef.current) return;
        if ((e.target as HTMLElement).closest("[data-annotation-item]")) return;
        if (editingId) {
          onEndInlineEdit(editingId, false);
        }
        onSelect(null);
        if (tool === "select" || tool === "delete") return;

        const rect = rootRef.current.getBoundingClientRect();
        const norm = pointerToNorm(e.clientX, e.clientY, rect);

        if (tool === "stamp" && selectedStampId) {
          const stamp = stamps.find((s) => s.id === selectedStampId);
          if (!stamp) return;
          const size = stampNormSize(
            stamp.default_size_pct || 8,
            rect.width / Math.max(1, rect.height),
          );
          const imageWidth =
            typeof (stamp as { default_width_px?: number }).default_width_px ===
            "number"
              ? (stamp as { default_width_px?: number }).default_width_px!
              : 64;
          const imageHeight =
            typeof (stamp as { default_height_px?: number }).default_height_px ===
            "number"
              ? (stamp as { default_height_px?: number }).default_height_px!
              : 64;
          const draft: CreateDraft = {
            annotation_type: "stamp",
            x_norm: Math.min(1 - size.w, Math.max(0, norm.x - size.w / 2)),
            y_norm: Math.min(1 - size.h, Math.max(0, norm.y - size.h / 2)),
            w_norm: size.w,
            h_norm: size.h,
            stamp_definition_id: stamp.id,
            text_content: stamp.accessible_label || stamp.name,
            geometry: {
              stamp_definition_id: stamp.id,
              storage_path: stamp.storage_path,
              image_width: imageWidth,
              image_height: imageHeight,
              aspect_ratio: imageHeight > 0 ? imageWidth / imageHeight : 1,
              accessible_label_snapshot: stamp.accessible_label,
              stamp_name_snapshot: stamp.name,
              applied_at: new Date().toISOString(),
              asset_version:
                typeof (stamp as { asset_version?: number }).asset_version ===
                "number"
                  ? (stamp as { asset_version?: number }).asset_version
                  : 1,
              stamp_normalised: true,
            },
          };
          onCreate(draft);
          return;
        }

        if (tool === "area_comment") {
          const placed = placeBoxCommentAtPoint(
            norm.x,
            norm.y,
            "",
            rect.width,
            rect.height,
          );
          onCreate({
            annotation_type: "area_comment",
            ...placed,
            text_content: "",
            geometry: { preferred_w_norm: placed.w_norm },
            begin_inline_edit: true,
          });
          return;
        }

        dragStart.current = { x: norm.x, y: norm.y };
        setDraftBox({ x: norm.x, y: norm.y, w: 0, h: 0 });
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragStart.current || !rootRef.current) return;
        const rect = rootRef.current.getBoundingClientRect();
        const norm = pointerToNorm(e.clientX, e.clientY, rect);
        setDraftBox(dragBoxFromPoints(dragStart.current, norm));
      }}
      onPointerUp={(e) => {
        if (!dragStart.current || !rootRef.current) return;
        const start = dragStart.current;
        dragStart.current = null;
        const rect = rootRef.current.getBoundingClientRect();
        const norm = pointerToNorm(e.clientX, e.clientY, rect);
        const box = dragBoxFromPoints(start, norm);
        setDraftBox(null);
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        if (box.w < 0.01 || box.h < 0.008) return;
        if (tool === "text_highlight") {
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
          editing={editingId === annotation.id}
          tool={tool}
          stamps={stamps}
          canvasRef={rootRef}
          onSelect={onSelect}
          onCommit={onCommitGeometry}
          onToggleCollapse={onToggleCollapse}
          onBeginInlineEdit={onBeginInlineEdit}
          onInlineTextChange={onInlineTextChange}
          onEndInlineEdit={onEndInlineEdit}
          onDelete={(id) => onDeleteSelected(id)}
        />
      ))}

      {draftBox ? (
        <div
          className="pointer-events-none absolute box-border"
          style={{
            ...exactAnnotationStyle(draftBox),
            backgroundColor: colour,
            opacity: 0.35,
            border: `1px dashed ${colour}`,
            borderRadius: 4,
          }}
        />
      ) : null}
    </div>
  );
}
