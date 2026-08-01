"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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

export function LinkedCommentsPanel({
  selectedQuestionId,
  assignmentComments,
  commentBankItems,
  onInsertIntoFeedback,
  onClickInsertAnnotation,
}: {
  selectedQuestionId: string | null;
  assignmentComments: LinkedComment[];
  commentBankItems: CommentBankItem[];
  onInsertIntoFeedback: (text: string) => void;
  onClickInsertAnnotation: (comment: {
    id: string;
    text: string;
  }) => void;
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [favourites, setFavourites] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set(
        JSON.parse(
          window.localStorage.getItem("marking:comment-favourites") || "[]",
        ) as string[],
      );
    } catch {
      return new Set();
    }
  });
  const [recent, setRecent] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(
        window.localStorage.getItem("marking:comment-recent") || "[]",
      ) as string[];
    } catch {
      return [];
    }
  });

  const grouped = useMemo(() => {
    const seen = new Set<string>();
    const linked: Array<{
      id: string;
      label: string;
      text: string;
      group: string;
      bank: string;
      priority: number;
    }> = [];

    for (const c of assignmentComments) {
      if (!c.is_active) continue;
      const key = c.full_comment.trim().toLowerCase();
      if (seen.has(key)) continue;
      const ids = c.linked_question_ids?.length
        ? c.linked_question_ids
        : c.linked_question_id
          ? [c.linked_question_id]
          : [];
      const isLinked = selectedQuestionId
        ? ids.includes(selectedQuestionId)
        : false;
      if (!isLinked && !c.available_for_overall && !showAll) continue;
      if (!isLinked && !showAll && !c.available_for_question) continue;
      seen.add(key);
      linked.push({
        id: c._id,
        label: c.short_label || c.category || "Comment",
        text: c.full_comment,
        group: isLinked ? "Linked to question" : "Other comments",
        bank: "Assignment comments",
        priority: isLinked ? 0 : 2,
      });
    }

    for (const item of commentBankItems) {
      if (!item.is_active) continue;
      const key = item.full_text.trim().toLowerCase();
      if (seen.has(key)) continue;
      const isLinked = Boolean(
        selectedQuestionId && item.linked_question_id === selectedQuestionId,
      );
      if (!isLinked && !showAll) continue;
      seen.add(key);
      linked.push({
        id: item.id,
        label: item.short_label || item.title,
        text: item.full_text,
        group: item.category || "General",
        bank: item.bank_name || "Comment bank",
        priority: isLinked ? 0 : 1,
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
      .sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label));
  }, [
    assignmentComments,
    commentBankItems,
    selectedQuestionId,
    showAll,
    query,
  ]);

  const byBank = useMemo(() => {
    const map = new Map<string, Map<string, typeof grouped>>();
    for (const item of grouped) {
      if (!map.has(item.bank)) map.set(item.bank, new Map());
      const groups = map.get(item.bank)!;
      if (!groups.has(item.group)) groups.set(item.group, []);
      groups.get(item.group)!.push(item);
    }
    return map;
  }, [grouped]);

  function remember(id: string) {
    setRecent((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, 8);
      window.localStorage.setItem("marking:comment-recent", JSON.stringify(next));
      return next;
    });
  }

  function toggleFavourite(id: string) {
    setFavourites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      window.localStorage.setItem(
        "marking:comment-favourites",
        JSON.stringify([...next]),
      );
      return next;
    });
  }

  return (
    <div className="space-y-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search comments"
        aria-label="Search comments"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={showAll ? "secondary" : "outline"}
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? "Showing all groups" : "Expand other groups"}
        </Button>
      </div>

      {recent.length ? (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase text-slate-400">
            Recent
          </p>
          <ul className="space-y-1">
            {grouped
              .filter((c) => recent.includes(c.id))
              .map((c) => (
                <CommentRow
                  key={`recent-${c.id}`}
                  comment={c}
                  favourite={favourites.has(c.id)}
                  onFavourite={() => toggleFavourite(c.id)}
                  onInsertFeedback={() => {
                    remember(c.id);
                    onInsertIntoFeedback(c.text);
                  }}
                  onInsertAnnotation={() => {
                    remember(c.id);
                    onClickInsertAnnotation({ id: c.id, text: c.text });
                  }}
                />
              ))}
          </ul>
        </div>
      ) : null}

      {[...byBank.entries()].map(([bank, groups]) => (
        <div key={bank} className="space-y-2">
          <p className="text-xs font-semibold text-slate-800">{bank}</p>
          {[...groups.entries()].map(([group, comments]) => (
            <div key={`${bank}-${group}`}>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                {group}
              </p>
              <ul className="space-y-1">
                {comments.map((c) => (
                  <CommentRow
                    key={c.id}
                    comment={c}
                    favourite={favourites.has(c.id)}
                    onFavourite={() => toggleFavourite(c.id)}
                    onInsertFeedback={() => {
                      remember(c.id);
                      onInsertIntoFeedback(c.text);
                    }}
                    onInsertAnnotation={() => {
                      remember(c.id);
                      onClickInsertAnnotation({ id: c.id, text: c.text });
                    }}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}

      {!grouped.length ? (
        <p className="text-xs text-slate-500">No linked comments for this question.</p>
      ) : null}
    </div>
  );
}

function CommentRow({
  comment,
  favourite,
  onFavourite,
  onInsertFeedback,
  onInsertAnnotation,
}: {
  comment: { id: string; label: string; text: string };
  favourite: boolean;
  onFavourite: () => void;
  onInsertFeedback: () => void;
  onInsertAnnotation: () => void;
}) {
  return (
    <li>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(
            "application/x-comment-bank-item",
            JSON.stringify({ id: comment.id, text: comment.text }),
          );
          e.dataTransfer.effectAllowed = "copy";
        }}
        className="rounded-lg border border-slate-100 px-2 py-1.5 text-left text-xs hover:bg-slate-50"
      >
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={onInsertAnnotation}
            title="Insert with current comment tool"
          >
            <span className="font-medium text-slate-800">{comment.label}</span>
            <span className="mt-0.5 block line-clamp-2 text-slate-500">
              {comment.text}
            </span>
          </button>
          <button
            type="button"
            className="shrink-0 text-amber-500"
            title={favourite ? "Remove favourite" : "Favourite"}
            aria-label={favourite ? "Remove favourite" : "Favourite"}
            onClick={onFavourite}
          >
            {favourite ? "★" : "☆"}
          </button>
        </div>
        <div className="mt-1 flex gap-1">
          <Button type="button" size="sm" variant="outline" onClick={onInsertFeedback}>
            Into feedback
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onInsertAnnotation}>
            Onto work
          </Button>
        </div>
      </div>
    </li>
  );
}
