"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { saveAssignmentCommentSelectionsAction } from "@/lib/actions/comment-bank-groups";
import {
  COMMENT_BANK_SCOPE_LABELS,
  type CommentBank,
  type CommentBankGroup,
  type CommentBankItem,
} from "@/lib/feedback/types";

export type AssignmentCommentSelectorBank = CommentBank & {
  groups: CommentBankGroup[];
  items: CommentBankItem[];
};

export function AssignmentCommentSelector({
  templateId,
  banks,
  initialSelections,
}: {
  templateId: string;
  banks: AssignmentCommentSelectorBank[];
  initialSelections: string[];
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialSelections),
  );
  const [expandedBanks, setExpandedBanks] = useState<Set<string>>(
    () => new Set(banks.slice(0, 1).map((bank) => bank.id)),
  );
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const activeItems = useMemo(
    () => banks.flatMap((bank) => bank.items.filter((item) => item.is_active)),
    [banks],
  );
  const totalCount = activeItems.length;
  const selectedCount = activeItems.filter((item) => selectedIds.has(item.id)).length;
  const selectedBankIds = useMemo(
    () =>
      new Set(
        banks
          .filter((bank) =>
            bank.items.some((item) => item.is_active && selectedIds.has(item.id)),
          )
          .map((bank) => bank.id),
      ),
    [banks, selectedIds],
  );

  const filteredBanks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return banks;
    return banks
      .map((bank) => ({
        ...bank,
        items: bank.items.filter(
          (item) =>
            item.short_label.toLowerCase().includes(q) ||
            item.title.toLowerCase().includes(q) ||
            item.full_text.toLowerCase().includes(q) ||
            item.category.toLowerCase().includes(q) ||
            item.tags.some((tag) => tag.toLowerCase().includes(q)) ||
            bank.name.toLowerCase().includes(q),
        ),
      }))
      .filter((bank) => bank.items.length > 0);
  }, [banks, query]);

  function setItems(itemIds: string[], checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const itemId of itemIds) {
        if (checked) next.add(itemId);
        else next.delete(itemId);
      }
      return next;
    });
  }

  function toggleExpanded(
    id: string,
    setExpanded: (updater: (prev: Set<string>) => Set<string>) => void,
  ) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function saveSelections() {
    setMessage(null);
    startTransition(async () => {
      const orderedIds = banks.flatMap((bank) =>
        bank.items
          .filter((item) => item.is_active && selectedIds.has(item.id))
          .map((item) => item.id),
      );
      const result = await saveAssignmentCommentSelectionsAction(
        templateId,
        orderedIds,
      );
      if (result.selectedItemIds) {
        setSelectedIds(new Set(result.selectedItemIds));
      }
      setMessage(result.error ?? result.success ?? "Selections saved");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>Select comment bank comments</CardTitle>
          <p className="mt-1 text-sm text-slate-500">
            Administrators manage the source banks. Choose which comments are
            available while marking this assignment.
          </p>
        </div>
        <Badge tone={selectedCount ? "brand" : "neutral"}>
          {selectedCount} of {totalCount} comments selected
        </Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          className="min-w-64 flex-1"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search labels, text, category or tags"
          aria-label="Search comment bank comments"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => setItems(activeItems.map((item) => item.id), true)}
          disabled={!activeItems.length}
        >
          Select all
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setSelectedIds(new Set())}
          disabled={!selectedIds.size}
        >
          Clear
        </Button>
        <Button type="button" onClick={saveSelections} disabled={pending}>
          {pending ? "Saving..." : "Save selections"}
        </Button>
      </div>

      {message ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {message}
        </p>
      ) : null}

      {!filteredBanks.length ? (
        <Card className="text-sm text-slate-500">
          No available comment banks match your search.
        </Card>
      ) : null}

      <div className="space-y-3">
        {filteredBanks.map((bank) => {
          const bankItems = bank.items.filter((item) => item.is_active);
          const bankItemIds = bankItems.map((item) => item.id);
          const bankSelectedCount = bankItems.filter((item) =>
            selectedIds.has(item.id),
          ).length;
          const bankFullySelected =
            bankItems.length > 0 && bankSelectedCount === bankItems.length;
          const isExpanded = expandedBanks.has(bank.id);
          const ungroupedItems = bankItems.filter((item) => !item.group_id);
          const groups = bank.groups
            .filter((group) => group.is_active)
            .filter((group) =>
              bankItems.some((item) => item.group_id === group.id),
            );

          return (
            <Card key={bank.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => toggleExpanded(bank.id, setExpandedBanks)}
                >
                  <span className="block font-medium text-slate-900">
                    {isExpanded ? "[-] " : "[+] "}
                    {bank.name}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {COMMENT_BANK_SCOPE_LABELS[bank.scope]}
                    {bank.subject ? ` - ${bank.subject}` : ""}
                    {bank.year_group ? ` - ${bank.year_group}` : ""}
                    {" - "}
                    {bankSelectedCount} of {bankItems.length} selected
                  </span>
                </button>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={bankFullySelected}
                    ref={(node) => {
                      if (node) {
                        node.indeterminate =
                          bankSelectedCount > 0 && !bankFullySelected;
                      }
                    }}
                    onChange={(e) => setItems(bankItemIds, e.target.checked)}
                  />
                  Select bank
                </label>
              </div>

              {isExpanded ? (
                <div className="space-y-3 border-t border-slate-100 pt-3">
                  {groups.map((group) => {
                    const groupItems = bankItems.filter(
                      (item) => item.group_id === group.id,
                    );
                    const groupItemIds = groupItems.map((item) => item.id);
                    const groupSelectedCount = groupItems.filter((item) =>
                      selectedIds.has(item.id),
                    ).length;
                    const groupFullySelected =
                      groupItems.length > 0 &&
                      groupSelectedCount === groupItems.length;
                    const groupExpanded = expandedGroups.has(group.id);

                    return (
                      <div
                        key={group.id}
                        className="rounded-2xl border border-slate-100 p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left text-sm font-medium text-slate-800"
                            onClick={() =>
                              toggleExpanded(group.id, setExpandedGroups)
                            }
                          >
                            {groupExpanded ? "[-] " : "[+] "}
                            {group.name}
                            {group.short_code ? ` (${group.short_code})` : ""}
                            <span className="ml-2 text-xs font-normal text-slate-400">
                              {groupSelectedCount} of {groupItems.length}
                            </span>
                          </button>
                          <label className="flex items-center gap-2 text-xs text-slate-600">
                            <input
                              type="checkbox"
                              checked={groupFullySelected}
                              ref={(node) => {
                                if (node) {
                                  node.indeterminate =
                                    groupSelectedCount > 0 &&
                                    !groupFullySelected;
                                }
                              }}
                              onChange={(e) =>
                                setItems(groupItemIds, e.target.checked)
                              }
                            />
                            Select group
                          </label>
                        </div>
                        {groupExpanded ? (
                          <CommentItemList
                            items={groupItems}
                            selectedIds={selectedIds}
                            onToggle={(itemId, checked) =>
                              setItems([itemId], checked)
                            }
                          />
                        ) : null}
                      </div>
                    );
                  })}

                  {ungroupedItems.length ? (
                    <div className="rounded-2xl border border-slate-100 p-3">
                      <p className="text-sm font-medium text-slate-800">
                        Ungrouped comments
                      </p>
                      <CommentItemList
                        items={ungroupedItems}
                        selectedIds={selectedIds}
                        onToggle={(itemId, checked) => setItems([itemId], checked)}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      {selectedBankIds.size ? (
        <p className="text-xs text-slate-500">
          Selected banks:{" "}
          {banks
            .filter((bank) => selectedBankIds.has(bank.id))
            .map((bank) => bank.name)
            .join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function CommentItemList({
  items,
  selectedIds,
  onToggle,
}: {
  items: CommentBankItem[];
  selectedIds: Set<string>;
  onToggle: (itemId: string, checked: boolean) => void;
}) {
  return (
    <ul className="mt-3 space-y-2">
      {items.map((item) => (
        <li key={item.id}>
          <label className="flex items-start gap-3 rounded-xl px-2 py-2 text-sm hover:bg-slate-50">
            <input
              type="checkbox"
              className="mt-1"
              checked={selectedIds.has(item.id)}
              onChange={(e) => onToggle(item.id, e.target.checked)}
            />
            <span className="min-w-0">
              <span className="block font-medium text-slate-800">
                {item.short_label || item.title}
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                {item.full_text}
              </span>
              {item.tags.length || item.category ? (
                <span className="mt-1 flex flex-wrap gap-1">
                  {item.category ? <Badge tone="neutral">{item.category}</Badge> : null}
                  {item.tags.map((tag) => (
                    <Badge key={tag} tone="neutral">
                      {tag}
                    </Badge>
                  ))}
                </span>
              ) : null}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}
