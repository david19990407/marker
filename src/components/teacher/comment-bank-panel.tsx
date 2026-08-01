"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  recordCommentUseAction,
  toggleCommentFavouriteAction,
} from "@/lib/actions/comment-banks";
import {
  COMMENT_BANK_SCOPE_LABELS,
  COMMENT_TONE_LABELS,
  type CommentBankItem,
  type CommentBankScope,
  type CommentTone,
} from "@/lib/feedback/types";
import { filterCommentBankItems } from "@/lib/feedback/comment-templates";

export function CommentBankPanel({
  items,
  activeFieldKey,
  mark,
  onInsert,
}: {
  items: CommentBankItem[];
  activeFieldKey: string | null;
  mark?: number | null;
  onInsert: (text: string, item: CommentBankItem) => void;
}) {
  const [search, setSearch] = useState("");
  const [tone, setTone] = useState<CommentTone | "">("");
  const [scope, setScope] = useState<CommentBankScope | "">("");
  const [category, setCategory] = useState("");
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [recentOnly, setRecentOnly] = useState(false);
  const [localItems, setLocalItems] = useState(items);
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);

  const categories = useMemo(
    () =>
      Array.from(
        new Set(localItems.map((i) => i.category).filter(Boolean)),
      ).sort(),
    [localItems],
  );

  const filtered = useMemo(() => {
    let list = filterCommentBankItems(localItems, {
      search,
      tone: tone || null,
      scope: scope || null,
      category: category || null,
      favouritesOnly,
      mark: mark ?? null,
    });
    if (recentOnly) {
      list = list
        .filter((i) => i.recent_used_at)
        .sort((a, b) =>
          String(b.recent_used_at).localeCompare(String(a.recent_used_at)),
        );
    }
    return list;
  }, [
    localItems,
    search,
    tone,
    scope,
    category,
    favouritesOnly,
    recentOnly,
    mark,
  ]);

  function handleInsert(item: CommentBankItem) {
    if (!activeFieldKey) {
      setFlash("Select a feedback field first");
      return;
    }
    onInsert(item.full_text, item);
    startTransition(async () => {
      await recordCommentUseAction(item.id);
      setLocalItems((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? { ...row, recent_used_at: new Date().toISOString() }
            : row,
        ),
      );
    });
  }

  function handleFavourite(item: CommentBankItem) {
    const next = !item.is_favourite;
    setLocalItems((prev) =>
      prev.map((row) =>
        row.id === item.id ? { ...row, is_favourite: next } : row,
      ),
    );
    startTransition(async () => {
      const result = await toggleCommentFavouriteAction(item.id, next);
      if (result.error) {
        setFlash(result.error);
        setLocalItems((prev) =>
          prev.map((row) =>
            row.id === item.id ? { ...row, is_favourite: !next } : row,
          ),
        );
      }
    });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Comment banks
        </p>
        <Badge tone="neutral">
          {activeFieldKey ? `Insert → ${activeFieldKey}` : "Select a field"}
        </Badge>
      </div>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search comments…"
      />

      <div className="grid grid-cols-2 gap-2">
        <select
          className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs"
          value={tone}
          onChange={(e) => setTone(e.target.value as CommentTone | "")}
        >
          <option value="">All tones</option>
          {Object.entries(COMMENT_TONE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs"
          value={scope}
          onChange={(e) => setScope(e.target.value as CommentBankScope | "")}
        >
          <option value="">All scopes</option>
          {Object.entries(COMMENT_BANK_SCOPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={favouritesOnly ? "secondary" : "outline"}
            onClick={() => setFavouritesOnly((v) => !v)}
          >
            ★
          </Button>
          <Button
            type="button"
            size="sm"
            variant={recentOnly ? "secondary" : "outline"}
            onClick={() => setRecentOnly((v) => !v)}
          >
            Recent
          </Button>
        </div>
      </div>

      {flash ? (
        <p className="text-xs text-slate-600">{flash}</p>
      ) : null}

      <ul className="max-h-72 space-y-2 overflow-y-auto">
        {filtered.length === 0 ? (
          <li className="text-xs text-slate-500">No matching comments</li>
        ) : (
          filtered.map((item) => (
            <li
              key={item.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  "application/x-comment-bank-item",
                  JSON.stringify({
                    id: item.id,
                    text: item.full_text,
                  }),
                );
                e.dataTransfer.effectAllowed = "copy";
              }}
              className="rounded-xl border border-slate-200 bg-white p-2 text-xs shadow-sm"
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-800">{item.short_label}</p>
                  <p className="text-[11px] text-slate-400">
                    {item.bank_scope
                      ? COMMENT_BANK_SCOPE_LABELS[item.bank_scope]
                      : "Bank"}
                    {item.category ? ` · ${item.category}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-amber-500"
                  disabled={pending}
                  onClick={() => handleFavourite(item)}
                  aria-label="Toggle favourite"
                >
                  {item.is_favourite ? "★" : "☆"}
                </button>
              </div>
              <p className="mb-2 line-clamp-3 text-slate-600">{item.full_text}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!activeFieldKey}
                onClick={() => handleInsert(item)}
              >
                Insert
              </Button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
