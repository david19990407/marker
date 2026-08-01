"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  saveCommentBankAction,
  saveCommentBankItemAction,
} from "@/lib/actions/comment-banks";
import { saveCommentBankGroupAction } from "@/lib/actions/comment-bank-groups";
import type {
  CommentBank,
  CommentBankGroup,
  CommentBankItem,
  CommentBankScope,
} from "@/lib/feedback/types";

export function AdminCommentBanksManager({
  initialBanks,
  initialItems,
  initialGroups,
  subjects,
  yearGroups,
}: {
  initialBanks: CommentBank[];
  initialItems: CommentBankItem[];
  initialGroups: CommentBankGroup[];
  subjects: string[];
  yearGroups: string[];
}) {
  const [banks, setBanks] = useState(initialBanks);
  const [items, setItems] = useState(initialItems);
  const [groups, setGroups] = useState(initialGroups);
  const [selectedBankId, setSelectedBankId] = useState<string | null>(
    initialBanks[0]?.id ?? null,
  );
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [bankForm, setBankForm] = useState({
    name: "",
    description: "",
    scope: "school" as CommentBankScope,
    subject: "",
    department_name: "",
  });
  const [groupForm, setGroupForm] = useState({
    name: "",
    short_code: "",
    description: "",
  });
  const [commentForm, setCommentForm] = useState({
    short_label: "",
    full_text: "",
    year_group: "",
  });

  const bankGroups = useMemo(
    () => groups.filter((g) => g.bank_id === selectedBankId),
    [groups, selectedBankId],
  );
  const groupItems = useMemo(
    () =>
      items.filter(
        (i) =>
          i.bank_id === selectedBankId &&
          (!selectedGroupId || i.group_id === selectedGroupId),
      ),
    [items, selectedBankId, selectedGroupId],
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
      <Card className="space-y-3 p-4">
        <CardTitle className="text-sm">Banks</CardTitle>
        <ul className="space-y-1">
          {banks.map((bank) => (
            <li key={bank.id}>
              <button
                type="button"
                className={`w-full rounded-xl px-3 py-2 text-left text-sm ${
                  selectedBankId === bank.id
                    ? "bg-slate-900 text-white"
                    : "hover:bg-slate-50"
                }`}
                onClick={() => {
                  setSelectedBankId(bank.id);
                  setSelectedGroupId(null);
                }}
              >
                <span className="font-medium">{bank.name}</span>
                <span className="block text-xs opacity-70">
                  {bank.scope}
                  {bank.subject ? ` · ${bank.subject}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <Input
            placeholder="Bank name"
            value={bankForm.name}
            onChange={(e) => setBankForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Textarea
            placeholder="Description"
            value={bankForm.description}
            onChange={(e) =>
              setBankForm((f) => ({ ...f, description: e.target.value }))
            }
          />
          <select
            className="h-11 w-full rounded-2xl border border-slate-200 px-3 text-sm"
            value={bankForm.scope}
            onChange={(e) =>
              setBankForm((f) => ({
                ...f,
                scope: e.target.value as CommentBankScope,
              }))
            }
          >
            <option value="school">School-wide</option>
            <option value="department">Department</option>
          </select>
          <select
            className="h-11 w-full rounded-2xl border border-slate-200 px-3 text-sm"
            value={bankForm.subject}
            onChange={(e) =>
              setBankForm((f) => ({ ...f, subject: e.target.value }))
            }
          >
            <option value="">Subject (optional)</option>
            {subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <Button
            type="button"
            disabled={pending || !bankForm.name.trim()}
            onClick={() =>
              startTransition(async () => {
                const result = await saveCommentBankAction({
                  scope: bankForm.scope,
                  name: bankForm.name.trim(),
                  description: bankForm.description || null,
                  subject: bankForm.subject || null,
                  department_name:
                    bankForm.scope === "department"
                      ? bankForm.subject || bankForm.department_name || "Department"
                      : null,
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
                  setBankForm({
                    name: "",
                    description: "",
                    scope: "school",
                    subject: "",
                    department_name: "",
                  });
                  setMessage(result.success ?? "Bank created");
                }
              })
            }
          >
            Create bank
          </Button>
        </div>
      </Card>

      <div className="space-y-4">
        {message ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            {message}
          </p>
        ) : null}

        {!selectedBankId ? (
          <Card className="p-4 text-sm text-slate-500">
            Create or select a comment bank.
          </Card>
        ) : (
          <>
            <Card className="space-y-3 p-4">
              <CardTitle className="text-sm">Groups</CardTitle>
              <ul className="flex flex-wrap gap-2">
                <li>
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1 text-xs ${
                      !selectedGroupId
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-700"
                    }`}
                    onClick={() => setSelectedGroupId(null)}
                  >
                    All comments
                  </button>
                </li>
                {bankGroups.map((group) => (
                  <li key={group.id}>
                    <button
                      type="button"
                      className={`rounded-full px-3 py-1 text-xs ${
                        selectedGroupId === group.id
                          ? "bg-slate-900 text-white"
                          : "bg-slate-100 text-slate-700"
                      }`}
                      onClick={() => setSelectedGroupId(group.id)}
                    >
                      {group.name}
                      {group.short_code ? ` (${group.short_code})` : ""}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="grid gap-2 sm:grid-cols-3">
                <Input
                  placeholder="Group name"
                  value={groupForm.name}
                  onChange={(e) =>
                    setGroupForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
                <Input
                  placeholder="Short code"
                  value={groupForm.short_code}
                  onChange={(e) =>
                    setGroupForm((f) => ({ ...f, short_code: e.target.value }))
                  }
                />
                <Button
                  type="button"
                  disabled={pending || !groupForm.name.trim()}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await saveCommentBankGroupAction({
                        bank_id: selectedBankId,
                        name: groupForm.name,
                        short_code: groupForm.short_code,
                        description: groupForm.description,
                        sort_order: bankGroups.length,
                      });
                      if (result.error) {
                        setMessage(result.error);
                        return;
                      }
                      if (result.group) {
                        setGroups((prev) => [...prev, result.group!]);
                        setSelectedGroupId(result.group.id);
                        setGroupForm({
                          name: "",
                          short_code: "",
                          description: "",
                        });
                        setMessage(result.success ?? "Group created");
                      }
                    })
                  }
                >
                  Add group
                </Button>
              </div>
            </Card>

            <Card className="space-y-3 p-4">
              <CardTitle className="text-sm">
                Comments{selectedGroupId ? " in selected group" : ""}
              </CardTitle>
              <ul className="max-h-72 space-y-2 overflow-y-auto">
                {groupItems.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-xl border border-slate-100 px-3 py-2 text-sm"
                  >
                    <p className="font-medium">{item.short_label || item.title}</p>
                    <p className="text-slate-500">{item.full_text}</p>
                  </li>
                ))}
              </ul>
              <div className="grid gap-2">
                <Input
                  placeholder="Short label"
                  value={commentForm.short_label}
                  onChange={(e) =>
                    setCommentForm((f) => ({
                      ...f,
                      short_label: e.target.value,
                    }))
                  }
                />
                <Textarea
                  placeholder="Full comment text"
                  value={commentForm.full_text}
                  onChange={(e) =>
                    setCommentForm((f) => ({ ...f, full_text: e.target.value }))
                  }
                />
                <select
                  className="h-11 w-full rounded-2xl border border-slate-200 px-3 text-sm"
                  value={commentForm.year_group}
                  onChange={(e) =>
                    setCommentForm((f) => ({
                      ...f,
                      year_group: e.target.value,
                    }))
                  }
                >
                  <option value="">Year group (optional)</option>
                  {yearGroups.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  disabled={
                    pending ||
                    !commentForm.short_label.trim() ||
                    !commentForm.full_text.trim()
                  }
                  onClick={() =>
                    startTransition(async () => {
                      const result = await saveCommentBankItemAction({
                        bank_id: selectedBankId,
                        group_id: selectedGroupId,
                        title: commentForm.short_label.trim(),
                        short_label: commentForm.short_label.trim(),
                        full_text: commentForm.full_text.trim(),
                        category: bankGroups.find((g) => g.id === selectedGroupId)
                          ?.name || "",
                        year_group: commentForm.year_group || null,
                        tone: "neutral",
                        is_active: true,
                        sort_order: groupItems.length,
                        tags: [],
                      });
                      if (result.error) {
                        setMessage(result.error);
                        return;
                      }
                      if (result.item) {
                        setItems((prev) => [...prev, result.item!]);
                        setCommentForm({
                          short_label: "",
                          full_text: "",
                          year_group: "",
                        });
                        setMessage(result.success ?? "Comment added");
                      }
                    })
                  }
                >
                  Add comment
                </Button>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
