"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  archiveCommentBankItemAction,
  saveCommentBankAction,
  saveCommentBankItemAction,
} from "@/lib/actions/comment-banks";
import {
  COMMENT_BANK_SCOPE_LABELS,
  COMMENT_TONE_LABELS,
  type CommentBank,
  type CommentBankItem,
  type CommentBankScope,
  type CommentTone,
} from "@/lib/feedback/types";

export function CommentBanksManager({
  initialBanks,
  initialItems,
  classes,
}: {
  initialBanks: CommentBank[];
  initialItems: CommentBankItem[];
  classes: Array<{ id: string; name: string; subject: string | null }>;
}) {
  const [banks, setBanks] = useState(initialBanks);
  const [items, setItems] = useState(initialItems);
  const [selectedBankId, setSelectedBankId] = useState<string | null>(
    initialBanks[0]?.id ?? null,
  );
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [newBank, setNewBank] = useState({
    name: "",
    scope: "personal" as CommentBankScope,
    subject: "",
    class_id: "",
  });

  const selectedBank = banks.find((b) => b.id === selectedBankId) ?? null;
  const bankItems = useMemo(
    () => items.filter((i) => i.bank_id === selectedBankId),
    [items, selectedBankId],
  );
  const selectedItem =
    bankItems.find((i) => i.id === selectedItemId) ?? bankItems[0] ?? null;

  function createBank() {
    startTransition(async () => {
      const result = await saveCommentBankAction({
        scope: newBank.scope,
        name: newBank.name || "My comment bank",
        subject: newBank.subject || null,
        class_id: newBank.class_id || null,
        department_name:
          newBank.scope === "department" ? newBank.subject || "Department" : null,
        is_active: true,
        sort_order: banks.length,
      });
      if (result.error) {
        setMessage(result.error);
        return;
      }
      if (result.bank) {
        setBanks((prev) => [...prev, result.bank!]);
        setSelectedBankId(result.bank.id);
        setMessage(result.success ?? "Bank created");
        setNewBank({ name: "", scope: "personal", subject: "", class_id: "" });
      }
    });
  }

  function saveItem(patch?: Partial<CommentBankItem>) {
    if (!selectedBank) return;
    const base = selectedItem ?? {
      id: undefined,
      bank_id: selectedBank.id,
      title: "New comment",
      short_label: "New",
      full_text: "",
      category: "",
      tags: [],
      year_group: null,
      subject: selectedBank.subject,
      tone: "neutral" as CommentTone,
      mark_range_min: null,
      mark_range_max: null,
      linked_question_id: null,
      is_active: true,
      sort_order: bankItems.length,
    };
    const payload = { ...base, ...patch, bank_id: selectedBank.id };
    startTransition(async () => {
      const result = await saveCommentBankItemAction(payload);
      if (result.error) {
        setMessage(result.error);
        return;
      }
      if (result.item) {
        setItems((prev) => {
          const exists = prev.some((i) => i.id === result.item!.id);
          return exists
            ? prev.map((i) => (i.id === result.item!.id ? result.item! : i))
            : [...prev, result.item!];
        });
        setSelectedItemId(result.item.id);
        setMessage(result.success ?? "Saved");
      }
    });
  }

  function archiveItem() {
    if (!selectedItem) return;
    startTransition(async () => {
      const result = await archiveCommentBankItemAction(selectedItem.id);
      if (result.error) {
        setMessage(result.error);
        return;
      }
      setItems((prev) =>
        prev.map((i) =>
          i.id === selectedItem.id ? { ...i, is_active: false } : i,
        ),
      );
      setMessage(result.success ?? "Archived");
    });
  }

  return (
    <div className="space-y-4">
      {message ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          {message}
        </p>
      ) : null}

      <Card className="space-y-3">
        <CardTitle>Create bank</CardTitle>
        <div className="grid gap-3 md:grid-cols-4">
          <Input
            placeholder="Bank name"
            value={newBank.name}
            onChange={(e) =>
              setNewBank((prev) => ({ ...prev, name: e.target.value }))
            }
          />
          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            value={newBank.scope}
            onChange={(e) =>
              setNewBank((prev) => ({
                ...prev,
                scope: e.target.value as CommentBankScope,
              }))
            }
          >
            {(["personal", "department", "class"] as CommentBankScope[]).map(
              (scope) => (
                <option key={scope} value={scope}>
                  {COMMENT_BANK_SCOPE_LABELS[scope]}
                </option>
              ),
            )}
          </select>
          <Input
            placeholder="Subject / department"
            value={newBank.subject}
            onChange={(e) =>
              setNewBank((prev) => ({ ...prev, subject: e.target.value }))
            }
          />
          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            value={newBank.class_id}
            onChange={(e) =>
              setNewBank((prev) => ({ ...prev, class_id: e.target.value }))
            }
          >
            <option value="">Class (optional)</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" onClick={createBank} disabled={pending}>
          Create bank
        </Button>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[240px_240px_minmax(0,1fr)]">
        <Card className="space-y-2">
          <CardTitle>Banks</CardTitle>
          <ul className="space-y-1">
            {banks.map((bank) => (
              <li key={bank.id}>
                <button
                  type="button"
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm ${
                    selectedBankId === bank.id
                      ? "bg-brand-50 text-brand-900"
                      : "hover:bg-slate-50"
                  }`}
                  onClick={() => {
                    setSelectedBankId(bank.id);
                    setSelectedItemId(null);
                  }}
                >
                  <span className="block font-medium">{bank.name}</span>
                  <span className="text-[11px] text-slate-400">
                    {COMMENT_BANK_SCOPE_LABELS[bank.scope]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Comments</CardTitle>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!selectedBank}
              onClick={() => saveItem({ id: undefined, full_text: "New comment text" })}
            >
              Add
            </Button>
          </div>
          <ul className="max-h-[28rem] space-y-1 overflow-y-auto">
            {bankItems.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm ${
                    selectedItem?.id === item.id
                      ? "bg-slate-100"
                      : "hover:bg-slate-50"
                  } ${item.is_active ? "" : "opacity-50"}`}
                  onClick={() => setSelectedItemId(item.id)}
                >
                  {item.short_label}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="space-y-3">
          <CardTitle>Edit comment</CardTitle>
          {!selectedItem ? (
            <p className="text-sm text-slate-500">Select or add a comment.</p>
          ) : (
            <>
              <Input
                value={selectedItem.title}
                onChange={(e) =>
                  setItems((prev) =>
                    prev.map((i) =>
                      i.id === selectedItem.id
                        ? { ...i, title: e.target.value }
                        : i,
                    ),
                  )
                }
                placeholder="Title"
              />
              <Input
                value={selectedItem.short_label}
                onChange={(e) =>
                  setItems((prev) =>
                    prev.map((i) =>
                      i.id === selectedItem.id
                        ? { ...i, short_label: e.target.value }
                        : i,
                    ),
                  )
                }
                placeholder="Short label"
              />
              <Textarea
                value={selectedItem.full_text}
                onChange={(e) =>
                  setItems((prev) =>
                    prev.map((i) =>
                      i.id === selectedItem.id
                        ? { ...i, full_text: e.target.value }
                        : i,
                    ),
                  )
                }
                placeholder="Full text"
              />
              <Input
                value={selectedItem.category}
                onChange={(e) =>
                  setItems((prev) =>
                    prev.map((i) =>
                      i.id === selectedItem.id
                        ? { ...i, category: e.target.value }
                        : i,
                    ),
                  )
                }
                placeholder="Category"
              />
              <Input
                value={selectedItem.tags.join(", ")}
                onChange={(e) =>
                  setItems((prev) =>
                    prev.map((i) =>
                      i.id === selectedItem.id
                        ? {
                            ...i,
                            tags: e.target.value
                              .split(",")
                              .map((t) => t.trim())
                              .filter(Boolean),
                          }
                        : i,
                    ),
                  )
                }
                placeholder="Tags (comma separated)"
              />
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={selectedItem.tone}
                onChange={(e) =>
                  setItems((prev) =>
                    prev.map((i) =>
                      i.id === selectedItem.id
                        ? { ...i, tone: e.target.value as CommentTone }
                        : i,
                    ),
                  )
                }
              >
                {Object.entries(COMMENT_TONE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => saveItem(selectedItem)}
                  disabled={pending}
                >
                  Save comment
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={archiveItem}
                  disabled={pending}
                >
                  Archive
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
