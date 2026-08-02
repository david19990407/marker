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
  applyNormBoxStyle,
  clampNormBox,
  createRafScheduler,
} from "@/lib/marking/annotation-drag";
import {
  annotationStyle,
  type AnnotationTool,
  type MarkingStamp,
  type SubmissionAnnotation,
} from "@/lib/marking/annotation-types";
import {
  annotationSourceFields,
  parseCommentDragPayload,
  type CommentDragPayload,
} from "@/lib/marking/comment-drag-source";

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
  source_assignment_comment_id?: string | null;
  source_type?: SubmissionAnnotation["source_type"];
  text_snapshot?: string | null;
  stamp_definition_id?: string | null;
  /** Start inline editing immediately after create (box tool click). */
  begin_inline_edit?: boolean;
};

type DragMode =
  | "move"
  | "resize-right"
  | "resize-left"
  | "resize-se"
  | "resize-n"
  | "resize-s"
  | "resize-e"
  | "resize-w";

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
  hostRef,
  onLiveGeometry,
  onCommit,
  onEndInlineEdit,
}: {
  annotationId: string;
  initialText: string;
  annotation: SubmissionAnnotation;
  canvasRef: RefObject<HTMLDivElement | null>;
  hostRef: RefObject<HTMLDivElement | null>;
  onLiveGeometry: Dispatch<SetStateAction<GeometryPatch | null>>;
  onCommit: (id: string, patch: GeometryPatch) => void;
  onEndInlineEdit: (id: string, cancel?: boolean) => void;
}) {
  const editRef = useRef<HTMLTextAreaElement | null>(null);
  const [draftText, setDraftText] = useState(initialText);
  const latestPatch = useRef<GeometryPatch | null>(null);
  const rafRef = useRef(createRafScheduler());
  const committedRef = useRef(false);
  const endedRef = useRef(false);

  useLayoutEffect(() => {
    const el = editRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const len = el.value.length;
    try {
      el.setSelectionRange(len, len);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => () => rafRef.current.cancel(), []);

  function resizeForText(next: string) {
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
    const patch: GeometryPatch = {
      x_norm: sized.x_norm,
      y_norm: sized.y_norm,
      w_norm: sized.w_norm,
      h_norm: sized.h_norm,
      text_content: next,
      geometry: {
        ...(annotation.geometry ?? {}),
        preferred_w_norm: sized.w_norm,
        text_snapshot: next,
      },
    };
    latestPatch.current = patch;
    applyNormBoxStyle(hostRef.current, patch);
    rafRef.current.schedule(() => onLiveGeometry(patch));
  }

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
        // Keep typing local — do not push text into parent worksheet state per keystroke.
        resizeForText(next);
      }}
      onBlur={() => {
        if (endedRef.current || committedRef.current) return;
        committedRef.current = true;
        rafRef.current.cancel();
        const patch = latestPatch.current ?? {
          x_norm: annotation.x_norm,
          y_norm: annotation.y_norm,
          w_norm: annotation.w_norm,
          h_norm: annotation.h_norm,
          text_content: draftText,
          geometry: {
            ...(annotation.geometry ?? {}),
            text_snapshot: draftText,
          },
        };
        onCommit(annotationId, { ...patch, text_content: draftText });
        onLiveGeometry(null);
        onEndInlineEdit(annotationId, false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          endedRef.current = true;
          setDraftText(initialText);
          onLiveGeometry(null);
          latestPatch.current = null;
          onEndInlineEdit(annotationId, true);
          return;
        }
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        // Must not preventDefault — that blocks caret placement / typing.
        e.stopPropagation();
      }}
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
      className="absolute -bottom-1.5 -right-1.5 z-10 h-3 w-3 cursor-se-resize rounded-sm border border-slate-700/30 bg-slate-900/20 opacity-0 transition-opacity group-hover:opacity-60 hover:opacity-100 focus-visible:opacity-100"
      onPointerDown={onPointerDown}
    />
  );
}

function HighlightResizeEdge({
  side,
  onPointerDown,
}: {
  side: "n" | "s" | "e" | "w";
  onPointerDown: (e: ReactPointerEvent) => void;
}) {
  const classes =
    side === "n"
      ? "-top-1 left-0 h-2 w-full cursor-ns-resize"
      : side === "s"
        ? "-bottom-1 left-0 h-2 w-full cursor-ns-resize"
        : side === "e"
          ? "right-0 -mr-1 top-0 h-full w-2 cursor-ew-resize"
          : "left-0 -ml-1 top-0 h-full w-2 cursor-ew-resize";
  return (
    <button
      type="button"
      data-resize-handle="true"
      aria-label={`Resize highlight ${side} edge`}
      className={`absolute z-10 border-0 bg-slate-900/10 p-0 opacity-0 transition-opacity group-hover:opacity-30 hover:opacity-50 ${classes}`}
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
    pointerId: number;
  } | null>(null);
  const latestLive = useRef<GeometryPatch | null>(null);
  const [live, setLive] = useState<GeometryPatch | null>(null);
  const rafRef = useRef(createRafScheduler());

  const collapsed = readCollapsed(annotation.geometry);
  const isBox = annotation.annotation_type === "area_comment";
  const isBubble = annotation.annotation_type === "text_comment";
  const isStamp = annotation.annotation_type === "stamp";
  const isHighlight = annotation.annotation_type === "text_highlight";
  const interactive = tool === "select";
  const display = live
    ? { ...annotation, ...live }
    : annotation;

  useEffect(() => () => rafRef.current.cancel(), []);

  const publishLive = useCallback((patch: GeometryPatch) => {
    latestLive.current = patch;
    applyNormBoxStyle(elRef.current, patch);
    rafRef.current.schedule(() => setLive(patch));
  }, []);

  const beginDrag = useCallback(
    (e: ReactPointerEvent, mode: DragMode) => {
      if (!interactive || editing) return;
      e.stopPropagation();
      e.preventDefault();
      if (!selected) onSelect(annotation.id);
      const target = elRef.current ?? (e.currentTarget as HTMLElement);
      target.setPointerCapture(e.pointerId);
      dragRef.current = {
        mode,
        startX: e.clientX,
        startY: e.clientY,
        ox: (live ?? annotation).x_norm,
        oy: (live ?? annotation).y_norm,
        ow: (live ?? annotation).w_norm,
        oh: (live ?? annotation).h_norm,
        text: annotation.text_content ?? "",
        pointerId: e.pointerId,
      };
    },
    [
      annotation,
      editing,
      interactive,
      live,
      onSelect,
      selected,
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
        publishLive(
          clampNormBox({
            x_norm: drag.ox + dx,
            y_norm: drag.oy + dy,
            w_norm: drag.ow,
            h_norm: drag.oh,
          }),
        );
        return;
      }

      if (drag.mode === "resize-se" && isStamp) {
        const aspectNorm = drag.ow > 0 ? drag.oh / drag.ow : 1;
        const widthFromX = drag.ow + dx;
        const widthFromY = drag.ow + dy / Math.max(0.001, aspectNorm);
        const nextWRaw =
          Math.abs(widthFromY - drag.ow) > Math.abs(widthFromX - drag.ow)
            ? widthFromY
            : widthFromX;
        const maxW = Math.min(0.9, 1 - drag.ox, (1 - drag.oy) / aspectNorm);
        const nextW = Math.min(maxW, Math.max(0.02, nextWRaw));
        publishLive(
          clampNormBox({
            x_norm: drag.ox,
            y_norm: drag.oy,
            w_norm: nextW,
            h_norm: nextW * aspectNorm,
          }),
        );
        return;
      }

      if (
        isHighlight &&
        (drag.mode === "resize-n" ||
          drag.mode === "resize-s" ||
          drag.mode === "resize-e" ||
          drag.mode === "resize-w")
      ) {
        const minSize = 0.02;
        let x = drag.ox;
        let y = drag.oy;
        let w = drag.ow;
        let h = drag.oh;
        if (drag.mode === "resize-e") {
          w = Math.min(1 - drag.ox, Math.max(minSize, drag.ow + dx));
        } else if (drag.mode === "resize-w") {
          const right = drag.ox + drag.ow;
          x = Math.min(right - minSize, Math.max(0, drag.ox + dx));
          w = right - x;
        } else if (drag.mode === "resize-s") {
          h = Math.min(1 - drag.oy, Math.max(minSize, drag.oh + dy));
        } else if (drag.mode === "resize-n") {
          const bottom = drag.oy + drag.oh;
          y = Math.min(bottom - minSize, Math.max(0, drag.oy + dy));
          h = bottom - y;
        }
        publishLive(
          clampNormBox({
            x_norm: x,
            y_norm: y,
            w_norm: w,
            h_norm: h,
          }),
        );
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
        publishLive({
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
    [annotation.geometry, canvasRef, isBox, isHighlight, isStamp, publishLive],
  );

  const endDrag = useCallback(
    (e: ReactPointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      rafRef.current.cancel();
      try {
        const target = elRef.current ?? (e.currentTarget as HTMLElement);
        target.releasePointerCapture(drag.pointerId);
      } catch {
        /* ignore */
      }
      const current = latestLive.current;
      latestLive.current = null;
      if (current) {
        // Keep the committed geometry visible until parent state catches up.
        setLive(current);
        onCommit(annotation.id, current);
        // Clear local overlay on next frame so React props take over.
        requestAnimationFrame(() => setLive(null));
      } else {
        setLive(null);
      }
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
          pointerEvents:
            editing || tool === "select" || tool === "delete" ? "auto" : "none",
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
      className="group absolute box-border"
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
        outline:
          selected && !editing && (isStamp || isHighlight)
            ? "1px dashed rgba(15,23,42,0.35)"
            : "none",
        boxShadow: "none",
        overflow: isBox || isStamp ? "visible" : "hidden",
        padding: isBox
          ? `${BOX_COMMENT_PAD_Y}px ${BOX_COMMENT_PAD_X}px`
          : 0,
        pointerEvents:
          editing || tool === "select" || tool === "delete" ? "auto" : "none",
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
              annotationId={annotation.id}
              initialText={annotation.text_content ?? ""}
              annotation={annotation}
              canvasRef={canvasRef}
              hostRef={elRef}
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
          opacity={
            typeof annotation.geometry?.opacity === "number"
              ? (annotation.geometry.opacity as number)
              : undefined
          }
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

      {selected && interactive && isHighlight ? (
        <>
          <HighlightResizeEdge
            side="n"
            onPointerDown={(e) => beginDrag(e, "resize-n")}
          />
          <HighlightResizeEdge
            side="s"
            onPointerDown={(e) => beginDrag(e, "resize-s")}
          />
          <HighlightResizeEdge
            side="e"
            onPointerDown={(e) => beginDrag(e, "resize-e")}
          />
          <HighlightResizeEdge
            side="w"
            onPointerDown={(e) => beginDrag(e, "resize-w")}
          />
        </>
      ) : null}
    </div>
  );
}

const MemoAnnotationItem = memo(AnnotationItem);

function buildStampCreateDraft(
  stamp: MarkingStamp,
  norm: { x: number; y: number },
  rect: DOMRect,
): CreateDraft {
  const imageWidth = stamp.default_width_px || 64;
  const imageHeight = stamp.default_height_px || 64;
  const opacity =
    typeof stamp.default_opacity === "number"
      ? Math.min(1, Math.max(0.1, stamp.default_opacity))
      : 1;
  const widthPx = Math.min(
    300,
    Math.max(16, imageWidth || (stamp.default_size_pct / 100) * rect.width),
  );
  const aspect = imageHeight > 0 ? imageWidth / imageHeight : 1;
  const heightPx = widthPx / Math.max(0.01, aspect);
  const size = {
    w: Math.min(0.9, Math.max(0.02, widthPx / Math.max(1, rect.width))),
    h: Math.min(0.9, Math.max(0.02, heightPx / Math.max(1, rect.height))),
  };
  return {
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
      display_width_px: widthPx,
      display_height_px: heightPx,
      aspect_ratio: aspect,
      opacity,
      accessible_label_snapshot: stamp.accessible_label,
      stamp_name_snapshot: stamp.name,
      applied_at: new Date().toISOString(),
      asset_version: stamp.asset_version || 1,
      stamp_normalised: true,
    },
  };
}

export function AnnotationLayer({
  annotations,
  stamps,
  tool,
  selectedStampId,
  colour,
  selectedId,
  editingId,
  linkedCommentDrag,
  paletteStampDragId = null,
  onSelect,
  onCreate,
  onCommitGeometry,
  onToggleCollapse,
  onBeginInlineEdit,
  onEndInlineEdit,
  onDeleteSelected,
  onPaletteStampDrop,
}: {
  annotations: SubmissionAnnotation[];
  stamps: MarkingStamp[];
  tool: AnnotationTool;
  selectedStampId: string | null;
  colour: string;
  selectedId: string | null;
  editingId: string | null;
  linkedCommentDrag: CommentDragPayload | null;
  /** Stamp currently dragged from the palette (custom pointer drag). */
  paletteStampDragId?: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (draft: CreateDraft) => void;
  onCommitGeometry: (id: string, patch: GeometryPatch) => void;
  onToggleCollapse: (id: string) => void;
  onBeginInlineEdit: (id: string) => void;
  onEndInlineEdit: (id: string, cancel?: boolean) => void;
  onDeleteSelected: (id: string) => void;
  onPaletteStampDrop?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const draftOverlayRef = useRef<HTMLDivElement | null>(null);
  const onCreateRef = useRef(onCreate);
  const linkedCommentDragRef = useRef<CommentDragPayload | null>(linkedCommentDrag);
  const linkedDropHandled = useRef(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const draftLatest = useRef<{ x: number; y: number; w: number; h: number } | null>(
    null,
  );
  const [draftBox, setDraftBox] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [dropHint, setDropHint] = useState<{ x: number; y: number } | null>(null);
  const draftRafRef = useRef(createRafScheduler());

  useEffect(() => () => draftRafRef.current.cancel(), []);
  useEffect(() => {
    onCreateRef.current = onCreate;
  }, [onCreate]);
  useEffect(() => {
    linkedCommentDragRef.current = linkedCommentDrag;
    linkedDropHandled.current = false;
  }, [linkedCommentDrag]);

  const createLinkedCommentAtPoint = useCallback(
    (payload: CommentDragPayload, clientX: number, clientY: number) => {
      const root = rootRef.current;
      if (!root || linkedDropHandled.current) return false;
      const rect = root.getBoundingClientRect();
      const inside =
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom;
      if (!inside) return false;
      linkedDropHandled.current = true;
      const norm = pointerToNorm(clientX, clientY, rect);
      const placed = placeBoxCommentAtPoint(
        norm.x,
        norm.y,
        payload.text,
        rect.width,
        rect.height,
      );
      const source = annotationSourceFields(payload);
      onCreateRef.current({
        annotation_type: "area_comment",
        ...placed,
        text_content: source.text_content,
        source_comment_item_id: source.source_comment_item_id,
        source_assignment_comment_id: source.source_assignment_comment_id,
        source_type: source.source_type,
        text_snapshot: source.text_snapshot,
        geometry: {
          preferred_w_norm: placed.w_norm,
          text_snapshot: source.text_snapshot,
        },
      });
      setDropHint(null);
      return true;
    },
    [],
  );

  useEffect(() => {
    function onWindowPointerMove(e: PointerEvent) {
      const payload = linkedCommentDragRef.current;
      const root = rootRef.current;
      if (!payload || !root) return;
      const rect = root.getBoundingClientRect();
      const inside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      setDropHint(
        inside ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : null,
      );
    }

    function onWindowPointerUp(e: PointerEvent) {
      const payload = linkedCommentDragRef.current;
      if (!payload) return;
      createLinkedCommentAtPoint(payload, e.clientX, e.clientY);
    }

    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerUp);
    return () => {
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", onWindowPointerUp);
    };
  }, [createLinkedCommentAtPoint]);

  // Complete palette stamp drops that end over the worksheet.
  useEffect(() => {
    if (!paletteStampDragId) return;
    function onUp(e: PointerEvent) {
      const root = rootRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const inside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      if (!inside) {
        onPaletteStampDrop?.();
        return;
      }
      const stamp = stamps.find((s) => s.id === paletteStampDragId);
      if (!stamp) {
        onPaletteStampDrop?.();
        return;
      }
      const norm = pointerToNorm(e.clientX, e.clientY, rect);
      onCreate(buildStampCreateDraft(stamp, norm, rect));
      onPaletteStampDrop?.();
    }
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
  }, [onCreate, onPaletteStampDrop, paletteStampDragId, stamps]);

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
          e.dataTransfer.types.includes("application/x-comment-bank-item") ||
          e.dataTransfer.types.includes("application/x-marking-stamp")
        ) {
          e.preventDefault();
          if (linkedCommentDrag) {
            const rect = rootRef.current?.getBoundingClientRect();
            if (rect) {
              setDropHint({ x: e.clientX - rect.left, y: e.clientY - rect.top });
            }
          }
        }
      }}
      onDrop={(e) => {
        if (!rootRef.current) return;
        const stampRaw = e.dataTransfer.getData("application/x-marking-stamp");
        if (stampRaw) {
          e.preventDefault();
          try {
            const parsed = JSON.parse(stampRaw) as { id?: string };
            const stamp = stamps.find((s) => s.id === parsed.id);
            if (!stamp) return;
            const rect = rootRef.current.getBoundingClientRect();
            const norm = pointerToNorm(e.clientX, e.clientY, rect);
            onCreate(buildStampCreateDraft(stamp, norm, rect));
          } catch {
            /* ignore */
          }
          return;
        }
        const payload =
          parseCommentDragPayload(
            e.dataTransfer.getData("application/x-comment-bank-item") ||
              e.dataTransfer.getData("text/plain"),
          ) ?? linkedCommentDragRef.current;
        if (!payload) return;
        e.preventDefault();
        createLinkedCommentAtPoint(payload, e.clientX, e.clientY);
      }}
      onPointerDown={(e) => {
        if (!rootRef.current) return;
        if ((e.target as HTMLElement).closest("[data-annotation-item]")) return;
        onSelect(null);
        if (tool === "select" || tool === "delete") return;

        const rect = rootRef.current.getBoundingClientRect();
        const norm = pointerToNorm(e.clientX, e.clientY, rect);

        if (tool === "stamp" && selectedStampId) {
          const stamp = stamps.find((s) => s.id === selectedStampId);
          if (!stamp) return;
          onCreate(buildStampCreateDraft(stamp, norm, rect));
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
        const empty = { x: norm.x, y: norm.y, w: 0, h: 0 };
        draftLatest.current = empty;
        setDraftBox(empty);
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragStart.current || !rootRef.current) return;
        const rect = rootRef.current.getBoundingClientRect();
        const norm = pointerToNorm(e.clientX, e.clientY, rect);
        const box = dragBoxFromPoints(dragStart.current, norm);
        draftLatest.current = box;
        applyNormBoxStyle(draftOverlayRef.current, {
          x_norm: box.x,
          y_norm: box.y,
          w_norm: box.w,
          h_norm: box.h,
        });
        draftRafRef.current.schedule(() => setDraftBox(box));
      }}
      onPointerUp={(e) => {
        if (!dragStart.current || !rootRef.current) return;
        const start = dragStart.current;
        dragStart.current = null;
        draftRafRef.current.cancel();
        const rect = rootRef.current.getBoundingClientRect();
        const norm = pointerToNorm(e.clientX, e.clientY, rect);
        const box = dragLatestOrComputed(start, norm, draftLatest.current);
        draftLatest.current = null;
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
          onEndInlineEdit={onEndInlineEdit}
          onDelete={(id) => onDeleteSelected(id)}
        />
      ))}

      {draftBox ? (
        <div
          ref={draftOverlayRef}
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

      {linkedCommentDrag && dropHint ? (
        <div
          className="pointer-events-none absolute z-[40] h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-rose-500/70 bg-rose-500/10"
          style={{ left: dropHint.x, top: dropHint.y }}
          aria-hidden
        />
      ) : null}
    </div>
  );
}

function dragLatestOrComputed(
  start: { x: number; y: number },
  norm: { x: number; y: number },
  latest: { x: number; y: number; w: number; h: number } | null,
) {
  return latest ?? dragBoxFromPoints(start, norm);
}
