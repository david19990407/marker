"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  saveCommentBankAction,
  saveCommentBankItemAction,
} from "@/lib/actions/comment-banks";
import { saveCommentBankGroupAction } from "@/lib/actions/comment-bank-groups";
import {
  COMMENT_BANK_SCOPE_LABELS,
  COMMENT_TONE_LABELS,
  type CommentBank,
  type CommentBankGroup,
  type CommentBankItem,
  type CommentBankScope,
  type CommentTone,
} from "@/lib/feedback/types";

type BankForm = {
  name: string;
  description: string;
  scope: Extract<CommentBankScope, "school" | "department">;
  subject: string;
  department_name: string;
  year_group: string;
};

type QuickGenerateForm = {
  bankName: string;
  groupName: string;
  prefix: string;
  labels: string;
  fullComments: string;
  category: string;
  tags: string;
  tone: CommentTone;
};

const emptyBankForm: BankForm = {
  name: "",
  description: "",
  scope: "school",
  subject: "",
  department_name: "",
  year_group: "",
};

const emptyQuickForm: QuickGenerateForm = {
  bankName: "",
  groupName: "",
  prefix: "",
  labels: "Comment 1\nComment 2\nComment 3",
  fullComments: "",
  category: "",
  tags: "",
  tone: "neutral",
};

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
  const [bankForm, setBankForm] = useState<BankForm>(emptyBankForm);
  const [groupForm, setGroupForm] = useState({
    name: "",
    short_code: "",
    description: "",
    category: "",
    tags: "",
  });
  const [newComment, setNewComment] = useState({
    short_label: "",
    title: "",
    full_text: "",
    category: "",
    tags: "",
    tone: "neutral" as CommentTone,
    year_group: "",
  });
  const [quickForm, setQuickForm] = useState<QuickGenerateForm>(() => ({
    ...emptyQuickForm,
    bankName: initialBanks[0]?.name ?? "",
  }));
  const [csvPaste, setCsvPaste] = useState("");
  const [search, setSearch] = useState("");

  const selectedBank = banks.find((bank) => bank.id === selectedBankId) ?? null;
  const bankGroups = useMemo(
    () =>
      groups
        .filter((group) => group.bank_id === selectedBankId)
        .sort((a, b) => a.sort_order - b.sort_order),
    [groups, selectedBankId],
  );
  const bankItems = useMemo(
    () =>
      items
        .filter((item) => item.bank_id === selectedBankId)
        .sort((a, b) => a.sort_order - b.sort_order),
    [items, selectedBankId],
  );
  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bankItems.filter((item) => {
      const inGroup = !selectedGroupId || item.group_id === selectedGroupId;
      if (!inGroup) return false;
      if (!q) return true;
      return (
        item.short_label.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.full_text.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [bankItems, search, selectedGroupId]);

  const itemCountByBank = useMemo(() => {
    const count = new Map<string, number>();
    for (const item of items) {
      if (item.is_active) count.set(item.bank_id, (count.get(item.bank_id) ?? 0) + 1);
    }
    return count;
  }, [items]);

  const groupCountByBank = useMemo(() => {
    const count = new Map<string, number>();
    for (const group of groups) {
      if (group.is_active) {
        count.set(group.bank_id, (count.get(group.bank_id) ?? 0) + 1);
      }
    }
    return count;
  }, [groups]);

  const quickPreview = useMemo(
    () => buildQuickPreview(quickForm, bankItems),
    [quickForm, bankItems],
  );
  const csvRows = useMemo(() => parsePastedRows(csvPaste), [csvPaste]);

  function updateItem(itemId: string, patch: Partial<CommentBankItem>) {
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    );
  }

  function createBank() {
    startTransition(async () => {
      const result = await saveCommentBankAction({
        scope: bankForm.scope,
        name: bankForm.name.trim(),
        description: bankForm.description || null,
        subject: bankForm.subject || null,
        year_group: bankForm.year_group || null,
        department_name:
          bankForm.scope === "department"
            ? bankForm.department_name || bankForm.subject || "Department"
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
        setSelectedGroupId(null);
        setBankForm(emptyBankForm);
        setQuickForm((prev) => ({ ...prev, bankName: result.bank!.name }));
        setMessage(result.success ?? "Bank created");
      }
    });
  }

  function saveSelectedBank(patch: Partial<CommentBank>) {
    if (!selectedBank) return;
    startTransition(async () => {
      const result = await saveCommentBankAction({ ...selectedBank, ...patch });
      if (result.error) {
        setMessage(result.error);
        return;
      }
      if (result.bank) {
        setBanks((prev) =>
          prev.map((bank) => (bank.id === result.bank!.id ? result.bank! : bank)),
        );
        setMessage(result.success ?? "Bank saved");
      }
    });
  }

  function createGroup() {
    if (!selectedBankId) return;
    startTransition(async () => {
      const result = await saveCommentBankGroupAction({
        bank_id: selectedBankId,
        name: groupForm.name,
        short_code: groupForm.short_code,
        description: groupForm.description,
        category: groupForm.category,
        tags: splitTags(groupForm.tags),
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
          category: "",
          tags: "",
        });
        setMessage(result.success ?? "Group created");
      }
    });
  }

  function saveGroup(group: CommentBankGroup, patch: Partial<CommentBankGroup>) {
    startTransition(async () => {
      const result = await saveCommentBankGroupAction({ ...group, ...patch });
      if (result.error) {
        setMessage(result.error);
        return;
      }
      if (result.group) {
        setGroups((prev) =>
          prev.map((entry) =>
            entry.id === result.group!.id ? result.group! : entry,
          ),
        );
        setMessage(result.success ?? "Group saved");
      }
    });
  }

  function createComment() {
    if (!selectedBankId) return;
    startTransition(async () => {
      const result = await saveCommentBankItemAction({
        bank_id: selectedBankId,
        group_id: selectedGroupId,
        short_label: newComment.short_label.trim(),
        title: (newComment.title || newComment.short_label).trim(),
        full_text: newComment.full_text.trim(),
        category:
          newComment.category ||
          bankGroups.find((group) => group.id === selectedGroupId)?.name ||
          "",
        tags: splitTags(newComment.tags),
        tone: newComment.tone,
        year_group: newComment.year_group || selectedBank?.year_group || null,
        subject: selectedBank?.subject ?? null,
        is_active: true,
        sort_order: bankItems.length,
      });
      if (result.error) {
        setMessage(result.error);
        return;
      }
      if (result.item) {
        setItems((prev) => [...prev, result.item!]);
        setNewComment({
          short_label: "",
          title: "",
          full_text: "",
          category: "",
          tags: "",
          tone: "neutral",
          year_group: "",
        });
        setMessage(result.success ?? "Comment created");
      }
    });
  }

  function saveComment(item: CommentBankItem, patch: Partial<CommentBankItem> = {}) {
    startTransition(async () => {
      const result = await saveCommentBankItemAction({ ...item, ...patch });
      if (result.error) {
        setMessage(result.error);
        return;
      }
      if (result.item) {
        setItems((prev) =>
          prev.map((entry) =>
            entry.id === result.item!.id ? result.item! : entry,
          ),
        );
        setMessage(result.success ?? "Comment saved");
      }
    });
  }

  function moveComment(item: CommentBankItem, direction: -1 | 1) {
    const scoped = visibleItems;
    const index = scoped.findIndex((entry) => entry.id === item.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= scoped.length) return;
    const other = scoped[target];
    const itemOrder = item.sort_order;
    updateItem(item.id, { sort_order: other.sort_order });
    updateItem(other.id, { sort_order: itemOrder });
    startTransition(async () => {
      const first = await saveCommentBankItemAction({
        ...item,
        sort_order: other.sort_order,
      });
      if (first.error) {
        setMessage(first.error);
        return;
      }
      const second = await saveCommentBankItemAction({
        ...other,
        sort_order: itemOrder,
      });
      setMessage(second.error ?? "Comment order saved");
    });
  }

  function quickGenerate() {
    if (!quickPreview.rows.length || quickPreview.errors.length) {
      setMessage("Fix quick generate warnings before creating comments.");
      return;
    }
    startTransition(async () => {
      let bank = banks.find(
        (entry) =>
          entry.name.toLowerCase() === quickForm.bankName.trim().toLowerCase(),
      );
      if (!bank) {
        const created = await saveCommentBankAction({
          scope: "school",
          name: quickForm.bankName.trim(),
          description: null,
          subject: null,
          year_group: null,
          is_active: true,
          sort_order: banks.length,
        });
        if (created.error || !created.bank) {
          setMessage(created.error ?? "Unable to create bank");
          return;
        }
        bank = created.bank;
        setBanks((prev) => [...prev, created.bank!]);
      }

      const groupResult = await saveCommentBankGroupAction({
        bank_id: bank.id,
        name: quickForm.groupName.trim(),
        short_code: null,
        description: null,
        category: quickForm.category,
        tags: splitTags(quickForm.tags),
        sort_order: groups.filter((group) => group.bank_id === bank!.id).length,
      });
      if (groupResult.error || !groupResult.group) {
        setMessage(groupResult.error ?? "Unable to create group");
        return;
      }

      const createdItems: CommentBankItem[] = [];
      for (const [index, row] of quickPreview.rows.entries()) {
        const result = await saveCommentBankItemAction({
          bank_id: bank.id,
          group_id: groupResult.group.id,
          title: row.short_label,
          short_label: row.short_label,
          full_text: row.full_text,
          category: quickForm.category || groupResult.group.name,
          tags: splitTags(quickForm.tags),
          tone: quickForm.tone,
          year_group: bank.year_group,
          subject: bank.subject,
          is_active: true,
          sort_order: bankItems.length + index,
        });
        if (result.error || !result.item) {
          setMessage(result.error ?? "Unable to create comment");
          return;
        }
        createdItems.push(result.item);
      }

      setGroups((prev) => [...prev, groupResult.group!]);
      setItems((prev) => [...prev, ...createdItems]);
      setSelectedBankId(bank.id);
      setSelectedGroupId(groupResult.group.id);
      setQuickForm({ ...emptyQuickForm, bankName: bank.name });
      setMessage(`Created ${createdItems.length} comments in ${groupResult.group.name}`);
    });
  }

  function importCsvRows() {
    if (!selectedBankId || !csvRows.length) return;
    startTransition(async () => {
      const createdItems: CommentBankItem[] = [];
      for (const [index, row] of csvRows.entries()) {
        const result = await saveCommentBankItemAction({
          bank_id: selectedBankId,
          group_id: selectedGroupId,
          short_label: row.short_label,
          title: row.title || row.short_label,
          full_text: row.full_text,
          category:
            row.category ||
            bankGroups.find((group) => group.id === selectedGroupId)?.name ||
            "",
          tags: row.tags,
          tone: "neutral",
          year_group: selectedBank?.year_group ?? null,
          subject: selectedBank?.subject ?? null,
          is_active: true,
          sort_order: bankItems.length + index,
        });
        if (result.error || !result.item) {
          setMessage(result.error ?? "Unable to import CSV row");
          return;
        }
        createdItems.push(result.item);
      }
      setItems((prev) => [...prev, ...createdItems]);
      setCsvPaste("");
      setMessage(`Imported ${createdItems.length} comments`);
    });
  }

  function exportSelectedBank() {
    if (!selectedBank) return;
    const rows = bankItems.map((item) => ({
      short_label: item.short_label,
      title: item.title,
      full_text: item.full_text,
      category: item.category,
      tags: item.tags.join(";"),
      group: bankGroups.find((group) => group.id === item.group_id)?.name ?? "",
      tone: item.tone,
      active: item.is_active ? "true" : "false",
    }));
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedBank.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-comments.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {message ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {message}
        </p>
      ) : null}

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Quick Generate</CardTitle>
            <p className="mt-1 text-sm text-slate-500">
              Create a group and a set of administrator-managed source comments.
            </p>
          </div>
          <Button
            type="button"
            onClick={quickGenerate}
            disabled={pending || quickPreview.errors.length > 0}
          >
            Confirm and create
          </Button>
        </div>
        <div className="grid gap-3 lg:grid-cols-4">
          <Input
            placeholder="Bank name"
            value={quickForm.bankName}
            onChange={(e) =>
              setQuickForm((prev) => ({ ...prev, bankName: e.target.value }))
            }
          />
          <Input
            placeholder="Group name"
            value={quickForm.groupName}
            onChange={(e) =>
              setQuickForm((prev) => ({ ...prev, groupName: e.target.value }))
            }
          />
          <Input
            placeholder="Prefix, e.g. Q1-"
            value={quickForm.prefix}
            onChange={(e) =>
              setQuickForm((prev) => ({ ...prev, prefix: e.target.value }))
            }
          />
          <select
            className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm"
            value={quickForm.tone}
            onChange={(e) =>
              setQuickForm((prev) => ({
                ...prev,
                tone: e.target.value as CommentTone,
              }))
            }
          >
            {Object.entries(COMMENT_TONE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Textarea
            className="min-h-28"
            placeholder="Short labels, one per line"
            value={quickForm.labels}
            onChange={(e) =>
              setQuickForm((prev) => ({ ...prev, labels: e.target.value }))
            }
          />
          <Textarea
            className="min-h-28"
            placeholder="Full comments: one line reused for all, or one per label"
            value={quickForm.fullComments}
            onChange={(e) =>
              setQuickForm((prev) => ({
                ...prev,
                fullComments: e.target.value,
              }))
            }
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            placeholder="Category"
            value={quickForm.category}
            onChange={(e) =>
              setQuickForm((prev) => ({ ...prev, category: e.target.value }))
            }
          />
          <Input
            placeholder="Tags, comma separated"
            value={quickForm.tags}
            onChange={(e) =>
              setQuickForm((prev) => ({ ...prev, tags: e.target.value }))
            }
          />
        </div>
        <div className="rounded-2xl border border-slate-100 p-3">
          <p className="text-sm font-medium text-slate-900">Preview</p>
          {quickPreview.errors.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-rose-700">
              {quickPreview.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
          <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-sm">
            {quickPreview.rows.map((row) => (
              <li key={`${row.short_label}-${row.full_text}`} className="text-slate-600">
                <span className="font-medium text-slate-900">{row.short_label}</span>
                {" - "}
                {row.full_text}
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[280px_280px_minmax(0,1fr)]">
        <Card className="h-fit space-y-4">
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Banks</CardTitle>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={exportSelectedBank}
              disabled={!selectedBank}
            >
              Export CSV
            </Button>
          </div>
          <ul className="max-h-[28rem] space-y-1 overflow-auto">
            {banks.map((bank) => (
              <li key={bank.id}>
                <button
                  type="button"
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm ${
                    selectedBankId === bank.id
                      ? "bg-slate-900 text-white"
                      : "hover:bg-slate-50"
                  } ${bank.is_active ? "" : "opacity-60"}`}
                  onClick={() => {
                    setSelectedBankId(bank.id);
                    setSelectedGroupId(null);
                    setQuickForm((prev) => ({ ...prev, bankName: bank.name }));
                  }}
                >
                  <span className="block font-medium">{bank.name}</span>
                  <span className="block text-xs opacity-75">
                    {COMMENT_BANK_SCOPE_LABELS[bank.scope]}
                    {bank.subject ? ` - ${bank.subject}` : ""}
                    {bank.year_group ? ` - ${bank.year_group}` : ""}
                  </span>
                  <span className="block text-xs opacity-75">
                    {groupCountByBank.get(bank.id) ?? 0} groups,{" "}
                    {itemCountByBank.get(bank.id) ?? 0} active comments
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="space-y-2 border-t border-slate-100 pt-3">
            <CardTitle className="text-sm">Create bank</CardTitle>
            <Input
              placeholder="Bank name"
              value={bankForm.name}
              onChange={(e) =>
                setBankForm((prev) => ({ ...prev, name: e.target.value }))
              }
            />
            <Textarea
              placeholder="Description"
              value={bankForm.description}
              onChange={(e) =>
                setBankForm((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
            />
            <select
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
              value={bankForm.scope}
              onChange={(e) =>
                setBankForm((prev) => ({
                  ...prev,
                  scope: e.target.value as BankForm["scope"],
                }))
              }
            >
              <option value="school">School-wide</option>
              <option value="department">Department</option>
            </select>
            <select
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
              value={bankForm.subject}
              onChange={(e) =>
                setBankForm((prev) => ({ ...prev, subject: e.target.value }))
              }
            >
              <option value="">Subject (optional)</option>
              {subjects.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </select>
            <select
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
              value={bankForm.year_group}
              onChange={(e) =>
                setBankForm((prev) => ({ ...prev, year_group: e.target.value }))
              }
            >
              <option value="">Year group (optional)</option>
              {yearGroups.map((yearGroup) => (
                <option key={yearGroup} value={yearGroup}>
                  {yearGroup}
                </option>
              ))}
            </select>
            <Input
              placeholder="Department name"
              value={bankForm.department_name}
              onChange={(e) =>
                setBankForm((prev) => ({
                  ...prev,
                  department_name: e.target.value,
                }))
              }
              disabled={bankForm.scope !== "department"}
            />
            <Button
              type="button"
              onClick={createBank}
              disabled={pending || !bankForm.name.trim()}
            >
              Create bank
            </Button>
          </div>

          {selectedBank ? (
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <CardTitle className="text-sm">Selected bank</CardTitle>
              <Input
                value={selectedBank.name}
                onChange={(e) =>
                  setBanks((prev) =>
                    prev.map((bank) =>
                      bank.id === selectedBank.id
                        ? { ...bank, name: e.target.value }
                        : bank,
                    ),
                  )
                }
              />
              <Textarea
                value={selectedBank.description ?? ""}
                onChange={(e) =>
                  setBanks((prev) =>
                    prev.map((bank) =>
                      bank.id === selectedBank.id
                        ? { ...bank, description: e.target.value || null }
                        : bank,
                    ),
                  )
                }
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => saveSelectedBank(selectedBank)}
                  disabled={pending}
                >
                  Save bank
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    saveSelectedBank({ is_active: !selectedBank.is_active })
                  }
                  disabled={pending}
                >
                  {selectedBank.is_active ? "Archive" : "Restore"}
                </Button>
              </div>
            </div>
          ) : null}
        </Card>

        <Card className="h-fit space-y-4">
          <CardTitle>Groups</CardTitle>
          {!selectedBank ? (
            <p className="text-sm text-slate-500">Select a bank to manage groups.</p>
          ) : (
            <>
              <button
                type="button"
                className={`w-full rounded-xl px-3 py-2 text-left text-sm ${
                  !selectedGroupId ? "bg-brand-50 text-brand-900" : "hover:bg-slate-50"
                }`}
                onClick={() => setSelectedGroupId(null)}
              >
                All comments
              </button>
              <ul className="max-h-72 space-y-1 overflow-auto">
                {bankGroups.map((group) => (
                  <li key={group.id} className={group.is_active ? "" : "opacity-60"}>
                    <button
                      type="button"
                      className={`w-full rounded-xl px-3 py-2 text-left text-sm ${
                        selectedGroupId === group.id
                          ? "bg-brand-50 text-brand-900"
                          : "hover:bg-slate-50"
                      }`}
                      onClick={() => setSelectedGroupId(group.id)}
                    >
                      <span className="block font-medium">{group.name}</span>
                      <span className="text-xs text-slate-500">
                        {bankItems.filter((item) => item.group_id === group.id).length} comments
                      </span>
                    </button>
                    <div className="mt-1 flex gap-1 px-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => saveGroup(group, { is_active: !group.is_active })}
                      >
                        {group.is_active ? "Archive" : "Restore"}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <Input
                  placeholder="Group name"
                  value={groupForm.name}
                  onChange={(e) =>
                    setGroupForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
                <Input
                  placeholder="Short code"
                  value={groupForm.short_code}
                  onChange={(e) =>
                    setGroupForm((prev) => ({
                      ...prev,
                      short_code: e.target.value,
                    }))
                  }
                />
                <Textarea
                  placeholder="Description"
                  value={groupForm.description}
                  onChange={(e) =>
                    setGroupForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                />
                <Input
                  placeholder="Category"
                  value={groupForm.category}
                  onChange={(e) =>
                    setGroupForm((prev) => ({
                      ...prev,
                      category: e.target.value,
                    }))
                  }
                />
                <Input
                  placeholder="Tags, comma separated"
                  value={groupForm.tags}
                  onChange={(e) =>
                    setGroupForm((prev) => ({ ...prev, tags: e.target.value }))
                  }
                />
                <Button
                  type="button"
                  onClick={createGroup}
                  disabled={pending || !groupForm.name.trim()}
                >
                  Add group
                </Button>
              </div>
            </>
          )}
        </Card>

        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Comments</CardTitle>
              <p className="mt-1 text-sm text-slate-500">
                Inline edit, reorder, archive, restore, paste import and export.
              </p>
            </div>
            <Badge tone="neutral">{visibleItems.length} shown</Badge>
          </div>

          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search comments"
          />

          <div className="rounded-2xl border border-slate-100 p-3">
            <CardTitle className="mb-2 text-sm">CSV paste import</CardTitle>
            <p className="mb-2 text-xs text-slate-500">
              Paste tab or comma separated rows:
              short_label, title, full_text, category, tags.
            </p>
            <Textarea
              className="min-h-24"
              value={csvPaste}
              onChange={(e) => setCsvPaste(e.target.value)}
              placeholder="short_label,title,full_text,category,tags"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={importCsvRows}
                disabled={pending || !selectedBankId || !csvRows.length}
              >
                Import {csvRows.length || ""} rows
              </Button>
              {csvRows.length ? (
                <span className="text-xs text-slate-500">
                  Into {selectedGroupId ? "selected group" : "ungrouped comments"}
                </span>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 p-3">
            <CardTitle className="mb-2 text-sm">Add one comment</CardTitle>
            <div className="grid gap-2 md:grid-cols-2">
              <Input
                placeholder="Short label"
                value={newComment.short_label}
                onChange={(e) =>
                  setNewComment((prev) => ({
                    ...prev,
                    short_label: e.target.value,
                  }))
                }
              />
              <Input
                placeholder="Title"
                value={newComment.title}
                onChange={(e) =>
                  setNewComment((prev) => ({ ...prev, title: e.target.value }))
                }
              />
              <Input
                placeholder="Category"
                value={newComment.category}
                onChange={(e) =>
                  setNewComment((prev) => ({
                    ...prev,
                    category: e.target.value,
                  }))
                }
              />
              <Input
                placeholder="Tags"
                value={newComment.tags}
                onChange={(e) =>
                  setNewComment((prev) => ({ ...prev, tags: e.target.value }))
                }
              />
            </div>
            <Textarea
              className="mt-2 min-h-20"
              placeholder="Full comment text"
              value={newComment.full_text}
              onChange={(e) =>
                setNewComment((prev) => ({ ...prev, full_text: e.target.value }))
              }
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <select
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                value={newComment.tone}
                onChange={(e) =>
                  setNewComment((prev) => ({
                    ...prev,
                    tone: e.target.value as CommentTone,
                  }))
                }
              >
                {Object.entries(COMMENT_TONE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                onClick={createComment}
                disabled={
                  pending ||
                  !selectedBankId ||
                  !newComment.short_label.trim() ||
                  !newComment.full_text.trim()
                }
              >
                Add comment
              </Button>
            </div>
          </div>

          <ul className="space-y-3">
            {visibleItems.map((item, index) => (
              <li
                key={item.id}
                className={`rounded-2xl border border-slate-100 p-3 ${
                  item.is_active ? "" : "bg-slate-50 opacity-75"
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={item.is_active ? "success" : "neutral"}>
                      {item.is_active ? "Active" : "Archived"}
                    </Badge>
                    {item.group_id ? (
                      <Badge tone="brand">
                        {bankGroups.find((group) => group.id === item.group_id)?.name ??
                          "Group"}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => moveComment(item, -1)}
                      disabled={index === 0 || pending}
                    >
                      Up
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => moveComment(item, 1)}
                      disabled={index === visibleItems.length - 1 || pending}
                    >
                      Down
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => saveComment(item, { is_active: !item.is_active })}
                      disabled={pending}
                    >
                      {item.is_active ? "Archive" : "Restore"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => saveComment(item)}
                      disabled={pending}
                    >
                      Save
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <Input
                    value={item.short_label}
                    onChange={(e) =>
                      updateItem(item.id, { short_label: e.target.value })
                    }
                    placeholder="Short label"
                  />
                  <Input
                    value={item.title}
                    onChange={(e) => updateItem(item.id, { title: e.target.value })}
                    placeholder="Title"
                  />
                  <Input
                    value={item.category}
                    onChange={(e) =>
                      updateItem(item.id, { category: e.target.value })
                    }
                    placeholder="Category"
                  />
                  <Input
                    value={item.tags.join(", ")}
                    onChange={(e) =>
                      updateItem(item.id, { tags: splitTags(e.target.value) })
                    }
                    placeholder="Tags"
                  />
                </div>
                <Textarea
                  className="mt-2 min-h-20"
                  value={item.full_text}
                  onChange={(e) => updateItem(item.id, { full_text: e.target.value })}
                  placeholder="Full comment"
                />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function splitTags(value: string) {
  return value
    .split(/[;,]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function lines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildQuickPreview(form: QuickGenerateForm, existingItems: CommentBankItem[]) {
  const labels = lines(form.labels);
  const comments = lines(form.fullComments);
  const errors: string[] = [];
  if (!form.bankName.trim()) errors.push("Bank name is required.");
  if (!form.groupName.trim()) errors.push("Group name is required.");
  if (!labels.length) errors.push("Add at least one short label.");
  if (comments.length > 1 && comments.length !== labels.length) {
    errors.push("Full comments must be one reusable line or match the label count.");
  }

  const existingLabels = new Set(
    existingItems.map((item) => item.short_label.trim().toLowerCase()),
  );
  const seenLabels = new Set<string>();
  const rows = labels.map((label, index) => {
    const short_label = `${form.prefix}${label}`.trim();
    const key = short_label.toLowerCase();
    if (!short_label) errors.push(`Blank label at row ${index + 1}.`);
    if (seenLabels.has(key)) errors.push(`Duplicate label in preview: ${short_label}.`);
    if (existingLabels.has(key)) {
      errors.push(`Label already exists in selected bank: ${short_label}.`);
    }
    seenLabels.add(key);
    return {
      short_label,
      full_text: comments.length === 1 ? comments[0] : comments[index] || short_label,
    };
  });

  return { rows, errors: [...new Set(errors)] };
}

function parsePastedRows(raw: string) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => parseDelimitedLine(line, index))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
}

function parseDelimitedLine(line: string, index: number) {
  const delimiter = line.includes("\t") ? "\t" : ",";
  const cells = line.split(delimiter).map((cell) => cell.trim());
  if (
    index === 0 &&
    cells[0]?.toLowerCase() === "short_label" &&
    cells[2]?.toLowerCase() === "full_text"
  ) {
    return null;
  }
  const [shortLabel, title, fullText, category, tags] = cells;
  if (!shortLabel && !fullText) return null;
  return {
    short_label: shortLabel || title || `Comment ${index + 1}`,
    title: title || shortLabel || `Comment ${index + 1}`,
    full_text: fullText || title || shortLabel || "",
    category: category || "",
    tags: splitTags(tags || ""),
  };
}

function toCsv(rows: Array<Record<string, string>>) {
  const headers = [
    "short_label",
    "title",
    "full_text",
    "category",
    "tags",
    "group",
    "tone",
    "active",
  ];
  return [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => csvEscape(row[header] ?? "")).join(","),
    ),
  ].join("\n");
}

function csvEscape(value: string) {
  if (!/[",\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
