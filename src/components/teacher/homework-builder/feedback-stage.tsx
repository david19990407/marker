"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  saveAssignmentCommentsAction,
  saveCommentBankLinksAction,
} from "@/lib/actions/homework-builder";
import { useVersionedAutosave } from "@/hooks/use-versioned-autosave";
import { newId, responseKey } from "@/lib/homework/structure";
import { BLOCK_TYPE_LABELS, RESPONSE_BLOCK_TYPES } from "@/lib/types";
import type { AssignmentCommentDraft, BuilderSection } from "@/lib/types";

export type CommentBankOption = { id: string; name: string };

interface Props {
  templateId: string;
  sections: BuilderSection[];
  initialComments?: AssignmentCommentDraft[];
  commentBanks?: CommentBankOption[];
  linkedCommentBankIds?: string[];
}

export function FeedbackStage({
  templateId,
  sections,
  initialComments = [],
  commentBanks = [],
  linkedCommentBankIds = [],
}: Props) {
  const [comments, setComments] = useState<AssignmentCommentDraft[]>(() =>
    normaliseComments(initialComments),
  );
  const [bankIds, setBankIds] = useState<string[]>(linkedCommentBankIds);
  const [bankMessage, setBankMessage] = useState<string | null>(null);
  const [bankPending, startBankTransition] = useTransition();

  const questionOptions = useMemo(() => collectQuestionOptions(sections), [sections]);
  const autosave = useVersionedAutosave<AssignmentCommentDraft[]>({
    delayMs: 1200,
    save: async (value) => {
      const result = await saveAssignmentCommentsAction(templateId, value);
      return result.error ? { ok: false, error: result.error } : { ok: true };
    },
  });

  function updateComments(next: AssignmentCommentDraft[]) {
    const ordered = normaliseComments(next);
    setComments(ordered);
    autosave.markDirty(ordered);
  }

  function addComment() {
    updateComments([
      ...comments,
      {
        _id: newId(),
        short_label: "New comment",
        full_comment: "",
        category: "General",
        linked_question_id: null,
        mark_range_min: null,
        mark_range_max: null,
        is_active: true,
        sort_order: comments.length,
        available_for_drag_drop: true,
        available_for_overall: true,
        available_for_question: true,
      },
    ]);
  }

  function updateComment(id: string, patch: Partial<AssignmentCommentDraft>) {
    updateComments(
      comments.map((comment) => (comment._id === id ? { ...comment, ...patch } : comment)),
    );
  }

  function duplicateComment(comment: AssignmentCommentDraft) {
    updateComments([
      ...comments,
      {
        ...comment,
        _id: newId(),
        short_label: `${comment.short_label} copy`,
        sort_order: comments.length,
      },
    ]);
  }

  function removeComment(id: string) {
    if (!window.confirm("Remove this feedback comment?")) return;
    updateComments(comments.filter((comment) => comment._id !== id));
  }

  function moveComment(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= comments.length) return;
    const next = [...comments];
    [next[index], next[target]] = [next[target], next[index]];
    updateComments(next);
  }

  function saveBankLinks() {
    setBankMessage(null);
    startBankTransition(async () => {
      const result = await saveCommentBankLinksAction(templateId, bankIds);
      setBankMessage(result.error ?? result.success ?? "Comment bank links saved");
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Assignment feedback comments</CardTitle>
            <p className="mt-1 text-sm text-slate-500">
              Build reusable comments for drag-drop marking, overall feedback, and
              question-specific feedback.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={autosave.status === "error" ? "danger" : "neutral"}>
              {autosave.label}
            </Badge>
            <Button type="button" variant="secondary" onClick={() => void autosave.flush()}>
              Save comments
            </Button>
            <Button type="button" onClick={addComment}>
              + Add comment
            </Button>
          </div>
        </Card>

        {autosave.lastError ? (
          <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {autosave.lastError}
          </div>
        ) : null}

        {comments.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-500">
              No comments yet. Add comments teachers can reuse while marking.
            </p>
          </Card>
        ) : null}

        {comments.map((comment, index) => (
          <CommentEditor
            key={comment._id}
            comment={comment}
            index={index}
            total={comments.length}
            questionOptions={questionOptions}
            onChange={(patch) => updateComment(comment._id, patch)}
            onDuplicate={() => duplicateComment(comment)}
            onRemove={() => removeComment(comment._id)}
            onMoveUp={() => moveComment(index, -1)}
            onMoveDown={() => moveComment(index, 1)}
          />
        ))}
      </div>

      <Card className="h-fit space-y-4">
        <div>
          <CardTitle>Linked comment banks</CardTitle>
          <p className="mt-1 text-sm text-slate-500">
            Mock multi-select for school-wide banks teachers can draw from.
          </p>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Existing comment banks
          </span>
          <select
            multiple
            value={bankIds}
            onChange={(e) =>
              setBankIds(Array.from(e.currentTarget.selectedOptions).map((opt) => opt.value))
            }
            className="min-h-36 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
          >
            {commentBanks.map((bank) => (
              <option key={bank.id} value={bank.id}>
                {bank.name}
              </option>
            ))}
          </select>
        </label>
        {bankIds.length ? (
          <div className="flex flex-wrap gap-2">
            {bankIds.map((id) => (
              <Badge key={id} tone="neutral">
                {commentBanks.find((bank) => bank.id === id)?.name ?? id}
              </Badge>
            ))}
          </div>
        ) : null}
        <Button type="button" onClick={saveBankLinks} disabled={bankPending}>
          {bankPending ? "Saving..." : "Save bank links"}
        </Button>
        {bankMessage ? <p className="text-sm text-slate-500">{bankMessage}</p> : null}
      </Card>
    </div>
  );
}

function CommentEditor({
  comment,
  index,
  total,
  questionOptions,
  onChange,
  onDuplicate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  comment: AssignmentCommentDraft;
  index: number;
  total: number;
  questionOptions: Array<{ id: string; label: string }>;
  onChange: (patch: Partial<AssignmentCommentDraft>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">#{index + 1}</Badge>
          <Badge tone={comment.is_active ? "success" : "neutral"}>
            {comment.is_active ? "Active" : "Inactive"}
          </Badge>
          {comment.category ? <Badge tone="brand">{comment.category}</Badge> : null}
        </div>
        <div className="flex flex-wrap gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={onMoveUp} disabled={index === 0}>
            Up
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onMoveDown}
            disabled={index === total - 1}
          >
            Down
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onDuplicate}>
            Duplicate
          </Button>
          <Button type="button" variant="danger" size="sm" onClick={onRemove}>
            Remove
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">Short label</span>
          <Input
            value={comment.short_label}
            onChange={(e) => onChange({ short_label: e.target.value })}
            placeholder="E.g. Strong evidence"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">Category</span>
          <Input
            value={comment.category}
            onChange={(e) => onChange({ category: e.target.value })}
            placeholder="General, SPaG, Analysis..."
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-slate-500">Full comment</span>
        <Textarea
          value={comment.full_comment}
          onChange={(e) => onChange({ full_comment: e.target.value })}
          placeholder="Write the feedback text teachers can insert."
          className="min-h-24"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Linked question
          </span>
          <select
            value={comment.linked_question_id ?? ""}
            onChange={(e) => onChange({ linked_question_id: e.target.value || null })}
            className="h-11 w-full rounded-2xl border border-slate-200 px-3 text-sm"
          >
            <option value="">Any question</option>
            {questionOptions.map((question) => (
              <option key={question.id} value={question.id}>
                {question.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Mark range min
          </span>
          <Input
            type="number"
            step={0.5}
            value={comment.mark_range_min ?? ""}
            onChange={(e) =>
              onChange({ mark_range_min: e.target.value ? Number(e.target.value) : null })
            }
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Mark range max
          </span>
          <Input
            type="number"
            step={0.5}
            value={comment.mark_range_max ?? ""}
            onChange={(e) =>
              onChange({ mark_range_max: e.target.value ? Number(e.target.value) : null })
            }
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-4">
        <Checkbox
          label="Active"
          checked={comment.is_active}
          onChange={(is_active) => onChange({ is_active })}
        />
        <Checkbox
          label="Drag-drop context"
          checked={comment.available_for_drag_drop}
          onChange={(available_for_drag_drop) => onChange({ available_for_drag_drop })}
        />
        <Checkbox
          label="Overall context"
          checked={comment.available_for_overall}
          onChange={(available_for_overall) => onChange({ available_for_overall })}
        />
        <Checkbox
          label="Question context"
          checked={comment.available_for_question}
          onChange={(available_for_question) => onChange({ available_for_question })}
        />
      </div>
    </Card>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-slate-300"
      />
      {label}
    </label>
  );
}

function normaliseComments(comments: AssignmentCommentDraft[]) {
  return comments.map((comment, index) => ({ ...comment, sort_order: index }));
}

function collectQuestionOptions(sections: BuilderSection[]) {
  const options: Array<{ id: string; label: string }> = [];

  function walk(section: BuilderSection) {
    for (const block of section.blocks) {
      if (!(RESPONSE_BLOCK_TYPES as readonly string[]).includes(block.block_type)) continue;
      const id = block.question_id ?? responseKey(block);
      options.push({
        id,
        label: `${block.content || block.prompt || BLOCK_TYPE_LABELS[block.block_type]} (${BLOCK_TYPE_LABELS[block.block_type]})`,
      });
    }
    for (const sub of section.subsections) walk(sub);
  }

  for (const section of sections) walk(section);
  return options;
}
