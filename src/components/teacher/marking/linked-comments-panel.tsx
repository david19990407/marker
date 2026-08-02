"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import type { AssignmentCommentDraft } from "@/lib/types";
import type { CommentBankItem } from "@/lib/feedback/types";

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
};

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
  onDragCreateBoxComment?: (comment: { id: string; text: string }) => void;
}) {
  void onDragCreateBoxComment;
  const [query, setQuery] = useState("");

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
      });
    }

    for (const item of commentBankItems) {
      if (!item.is_active) continue;
      if (seenIds.has(item.id)) continue;
      const isLinked = Boolean(
        selectedQuestionId && item.linked_question_id === selectedQuestionId,
      );
      // Selected banks for the assignment — show question-linked first, then others.
      seenIds.add(item.id);
      linked.push({
        id: item.id,
        label: item.short_label || item.title,
        text: item.full_text,
        group: item.group_name || item.bank_name || "Selected banks",
      });
      void isLinked;
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
      .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
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

  return (
    <div className="space-y-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search comments"
        aria-label="Search linked comments"
      />

      {[...byGroup.entries()].map(([group, comments]) => (
        <div key={group}>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
            {group}
          </p>
          <ul className="space-y-1">
            {comments.map((c) => (
              <li key={c.id}>
                <div
                  role="button"
                  tabIndex={0}
                  draggable
                  aria-label={`Insert comment ${c.label}`}
                  title="Click to insert into feedback. Drag onto worksheet for a box comment."
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      "application/x-comment-bank-item",
                      JSON.stringify({ id: c.id, text: c.text }),
                    );
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => onInsertIntoFeedback(c.text)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onInsertIntoFeedback(c.text);
                    }
                  }}
                  className="cursor-grab rounded-lg border border-slate-100 px-2 py-1.5 text-left text-xs hover:bg-slate-50 active:cursor-grabbing"
                >
                  <span className="font-medium text-slate-800">{c.label}</span>
                  <span className="mt-0.5 block line-clamp-3 text-slate-500">
                    {c.text}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {!rows.length ? (
        <p className="text-xs text-slate-500">
          No linked comments for this question.
        </p>
      ) : null}
    </div>
  );
}
