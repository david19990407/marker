"use client";

import { useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import type { AssignmentCommentDraft } from "@/lib/types";
import type { CommentBankItem } from "@/lib/feedback/types";
import {
  buildCommentDragPayload,
  type CommentDragPayload,
} from "@/lib/marking/comment-drag-source";

type LinkedComment = Pick<
  AssignmentCommentDraft,
  | "_id"
  | "short_label"
  | "full_comment"
  | "category"
  | "linked_question_id"
  | "linked_question_ids"
  | "is_active"
  | "available_for_question"
  | "available_for_overall"
  | "available_for_annotation"
>;

type Row = {
  id: string;
  label: string;
  text: string;
  group: string;
  sourceType: CommentDragPayload["sourceType"];
};

const DRAG_THRESHOLD_PX = 5;

export function LinkedCommentsPanel({
  selectedQuestionId,
  assignmentComments,
  commentBankItems,
  onInsertIntoFeedback,
  onDragCreateBoxComment,
}: {
  selectedQuestionId: string | null;
  assignmentComments: LinkedComment[];
  commentBankItems: CommentBankItem[];
  onInsertIntoFeedback: (text: string) => void;
  onDragCreateBoxComment?: (comment: CommentDragPayload | null) => void;
  onDragCreateBoxComment?: (
    comment: { id: string; text: string } | null,
  ) => void;
}) {
  const [query, setQuery] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragActiveRef = useRef(false);

  const rows = useMemo(() => {
    const seenIds = new Set<string>();
    const linked: Row[] = [];

    for (const c of assignmentComments) {
      if (!c.is_active) continue;
      if (seenIds.has(c._id)) continue;
      const ids = c.linked_question_ids?.length
        ? c.linked_question_ids
        : c.linked_question_id
          ? [c.linked_question_id]
          : [];
      const isLinked = selectedQuestionId
        ? ids.includes(selectedQuestionId)
        : false;
      const available =
        isLinked ||
        c.available_for_question ||
        c.available_for_overall ||
        c.available_for_annotation;
      if (!available) continue;
      seenIds.add(c._id);
      linked.push({
        id: c._id,
        label: c.short_label || c.category || "Comment",
        text: c.full_comment,
        group: isLinked ? "Question comments" : "Assignment comments",
        sourceType: "assignment_comment",
      });
    }

    for (const item of commentBankItems) {
      if (!item.is_active) continue;
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      linked.push({
        id: item.id,
        label: item.short_label || item.title,
        text: item.full_text,
        group: item.group_name || item.bank_name || "Selected banks",
        sourceType: "comment_bank_item",
      });
    }

    const q = query.trim().toLowerCase();
    return linked
      .filter(
        (c) =>
          !q ||
          c.label.toLowerCase().includes(q) ||
          c.text.toLowerCase().includes(q) ||
          c.group.toLowerCase().includes(q),
      )
      .sort(
        (a, b) =>
          a.group.localeCompare(b.group) || a.label.localeCompare(b.label),
      );
  }, [assignmentComments, commentBankItems, selectedQuestionId, query]);

  const byGroup = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const row of rows) {
      const list = map.get(row.group) ?? [];
      list.push(row);
      map.set(row.group, list);
    }
    return map;
  }, [rows]);

  function beginPointerDrag(row: Row, e: React.PointerEvent) {
    if (e.button !== 0) return;
    const payload = buildCommentDragPayload({
      sourceType: row.sourceType,
      sourceId: row.id,
      text: row.text,
    });
    const startX = e.clientX;
    const startY = e.clientY;
    let started = false;
    const startX = e.clientX;
    const startY = e.clientY;
    let started = false;
    dragActiveRef.current = false;

    const onMove = (ev: PointerEvent) => {
      if (
        Math.abs(ev.clientX - startX) < DRAG_THRESHOLD_PX &&
        Math.abs(ev.clientY - startY) < DRAG_THRESHOLD_PX
      ) {
        return;
      }
      if (!started) {
        started = true;
        dragActiveRef.current = true;
        setDraggingId(row.id);
        onDragCreateBoxComment?.(payload);
        onDragCreateBoxComment?.({ id: row.id, text: row.text });
      }
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
      setDraggingId(null);
      // Click (no drag) inserts into feedback. Clear drag state after a tick
      // so the worksheet drop handler can still read the payload.
      if (!started) {
        onDragCreateBoxComment?.(null);
        onInsertIntoFeedback(row.text);
      } else {
        window.setTimeout(() => onDragCreateBoxComment?.(null), 0);
      }
      window.setTimeout(() => {
        dragActiveRef.current = false;
      }, 0);
    };

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      started = true;
      started = true; // suppress click insert
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
      setDraggingId(null);
      onDragCreateBoxComment?.(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
  }

  return (
    <div className="space-y-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search comments"
        aria-label="Search linked comments"
      />

      {draggingId ? (
        <p className="text-[11px] text-slate-500">
          Drop onto the worksheet to place a box comment. Esc cancels.
        </p>
      ) : null}

      {[...byGroup.entries()].map(([group, comments]) => (
        <div key={group}>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
            {group}
          </p>
          <ul className="space-y-1">
            {comments.map((c) => {
              const payload = buildCommentDragPayload({
                sourceType: c.sourceType,
                sourceId: c.id,
                text: c.text,
              });
              return (
                <li key={`${c.sourceType}:${c.id}`}>
                  <div
                    role="button"
                    tabIndex={0}
                    draggable
                    aria-label={`Insert comment ${c.label}`}
                    title="Click to insert into feedback. Drag onto worksheet for a box comment."
                    className={`cursor-grab rounded-lg border px-2 py-1.5 text-left text-xs active:cursor-grabbing ${
                      draggingId === c.id
                        ? "border-rose-300 bg-rose-50 opacity-70"
                        : "border-slate-100 hover:bg-slate-50"
                    }`}
                    onPointerDown={(e) => beginPointerDrag(c, e)}
                    onDragStart={(e) => {
                      const raw = JSON.stringify(payload);
                      e.dataTransfer.setData(
                        "application/x-comment-bank-item",
                        raw,
                      );
                      e.dataTransfer.setData("text/plain", raw);
                      e.dataTransfer.effectAllowed = "copy";
                      onDragCreateBoxComment?.(payload);
                    }}
                    onDragEnd={() => onDragCreateBoxComment?.(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onInsertIntoFeedback(c.text);
                      }
                    }}
                  >
                    <span className="font-medium text-slate-800">{c.label}</span>
                    <span className="mt-0.5 block line-clamp-3 text-slate-500">
                      {c.text}
                    </span>
                  </div>
                </li>
              );
            })}
            {comments.map((c) => (
              <li key={c.id}>
                <div
                  role="button"
                  tabIndex={0}
                  draggable
                  aria-label={`Insert comment ${c.label}`}
                  title="Click to insert into feedback. Drag onto worksheet for a box comment."
                  className={`cursor-grab rounded-lg border px-2 py-1.5 text-left active:cursor-grabbing ${
                    draggingId === c.id
                      ? "border-rose-300 bg-rose-50 opacity-70"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                  onPointerDown={(e) => beginPointerDrag(c, e)}
                  onDragStart={(e) => {
                    // HTML5 fallback for environments that prefer native DnD.
                    const payload = JSON.stringify({ id: c.id, text: c.text });
                    e.dataTransfer.setData(
                      "application/x-comment-bank-item",
                      payload,
                    );
                    e.dataTransfer.setData("text/plain", payload);
                    e.dataTransfer.effectAllowed = "copy";
                    onDragCreateBoxComment?.({ id: c.id, text: c.text });
                  }}
                  onDragEnd={() => onDragCreateBoxComment?.(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onInsertIntoFeedback(c.text);
                    }
                  }}
                >
                  <p className="text-xs font-medium text-slate-800">{c.label}</p>
                  <p className="line-clamp-2 text-[11px] text-slate-500">
                    {c.text}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {rows.length === 0 ? (
        <p className="text-xs text-slate-500">No linked comments available.</p>
      ) : null}
    </div>
  );
}
