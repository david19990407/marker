"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FeedbackFieldsEditor } from "@/components/teacher/homework-builder/feedback-fields-editor";
import { saveCommentBankLinksAction } from "@/lib/actions/homework-builder";
import type { AssignmentFeedbackField } from "@/lib/feedback/types";
import { newId } from "@/lib/homework/structure";
import { BLOCK_TYPE_LABELS, RESPONSE_BLOCK_TYPES } from "@/lib/types";
import type { AssignmentCommentDraft, BuilderSection } from "@/lib/types";

export type CommentBankOption = { id: string; name: string };

interface Props {
  templateId: string;
  sections: BuilderSection[];
  /** Controlled assignment comments shared with Content stage. */
  comments: AssignmentCommentDraft[];
  onCommentsChange: (next: AssignmentCommentDraft[]) => void;
  commentAutosaveLabel?: string;
  commentAutosaveError?: string | null;
  onFlushComments?: () => void;
  commentBanks?: CommentBankOption[];
  linkedCommentBankIds?: string[];
  feedbackFields?: AssignmentFeedbackField[];
}

type BankView = "assignment" | string;

export function FeedbackStage({
  templateId,
  sections,
  comments,
  onCommentsChange,
  commentAutosaveLabel = "Saved",
  commentAutosaveError = null,
  onFlushComments,
  commentBanks = [],
  linkedCommentBankIds = [],
  feedbackFields = [],
}: Props) {
  const [bankIds, setBankIds] = useState<string[]>(linkedCommentBankIds);
  const [selectedBank, setSelectedBank] = useState<BankView>("assignment");
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [bankMessage, setBankMessage] = useState<string | null>(null);
  const [bankPending, startBankTransition] = useTransition();
  const [generatorOpen, setGeneratorOpen] = useState(false);

  const questionOptions = useMemo(
    () => collectQuestionOptions(sections),
    [sections],
  );
  const sectionOptions = useMemo(
    () => collectSectionOptions(sections),
    [sections],
  );

  function updateComments(next: AssignmentCommentDraft[]) {
    onCommentsChange(normaliseComments(next));
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return comments.filter((c) => {
      if (!q) return true;
      return (
        c.short_label.toLowerCase().includes(q) ||
        c.full_comment.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q)
      );
    });
  }, [comments, search]);

  const selectedComment =
    comments.find((c) => c._id === selectedCommentId) ?? filtered[0] ?? null;

  function addComment() {
    const created: AssignmentCommentDraft = {
      _id: newId(),
      short_label: "New comment",
      full_comment: "",
      category: "",
      linked_question_id: null,
      linked_question_ids: [],
      linked_section_id: null,
      mark_range_min: null,
      mark_range_max: null,
      is_active: true,
      sort_order: comments.length,
      available_for_drag_drop: true,
      available_for_overall: true,
      available_for_question: true,
      available_for_annotation: false,
      assessment_objective: null,
    };
    updateComments([...comments, created]);
    setSelectedCommentId(created._id);
    setSelectedBank("assignment");
  }

  function updateComment(id: string, patch: Partial<AssignmentCommentDraft>) {
    updateComments(
      comments.map((comment) =>
        comment._id === id ? { ...comment, ...patch } : comment,
      ),
    );
  }

  function removeComment(id: string) {
    if (!window.confirm("Delete this comment? This cannot be undone.")) return;
    const next = comments.filter((comment) => comment._id !== id);
    updateComments(next);
    if (selectedCommentId === id) {
      setSelectedCommentId(next[0]?._id ?? null);
    }
  }

  function moveComment(id: string, direction: -1 | 1) {
    const index = comments.findIndex((c) => c._id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= comments.length) return;
    const next = [...comments];
    [next[index], next[target]] = [next[target], next[index]];
    updateComments(next);
  }

  function pasteBulk(raw: string) {
    const rows = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!rows.length) return;
    const created = rows.map((line, i) => {
      const parts = line.split("\t");
      const short_label = (parts[0] || `Comment ${comments.length + i + 1}`).trim();
      const full_comment = (parts[1] || parts[0] || "").trim();
      const category = (parts[2] || "").trim();
      return {
        _id: newId(),
        short_label,
        full_comment,
        category,
        linked_question_id: null,
        linked_question_ids: [] as string[],
        linked_section_id: null,
        mark_range_min: null,
        mark_range_max: null,
        is_active: true,
        sort_order: comments.length + i,
        available_for_drag_drop: true,
        available_for_overall: true,
        available_for_question: true,
        available_for_annotation: false,
        assessment_objective: null,
      } satisfies AssignmentCommentDraft;
    });
    updateComments([...comments, ...created]);
  }

  function generateQuickSet(input: {
    prefix: string;
    suffix: string;
    labels: string;
  }) {
    const labels = input.labels
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!labels.length) return;
    const created = labels.map((label, i) => {
      const short_label = `${input.prefix}${label}${input.suffix}`.trim();
      return {
        _id: newId(),
        short_label: short_label || label,
        full_comment: short_label || label,
        category: "",
        linked_question_id: null,
        linked_question_ids: [] as string[],
        linked_section_id: null,
        mark_range_min: null,
        mark_range_max: null,
        is_active: true,
        sort_order: comments.length + i,
        available_for_drag_drop: true,
        available_for_overall: true,
        available_for_question: true,
        available_for_annotation: false,
        assessment_objective: null,
      } satisfies AssignmentCommentDraft;
    });
    updateComments([...comments, ...created]);
    setGeneratorOpen(false);
  }

  function toggleBank(id: string) {
    setBankIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function saveBankLinks() {
    setBankMessage(null);
    startBankTransition(async () => {
      const result = await saveCommentBankLinksAction(templateId, bankIds);
      setBankMessage(result.error ?? result.success ?? "Links saved");
    });
  }

  return (
    <div className="space-y-4">
      <FeedbackFieldsEditor
        templateId={templateId}
        initialFields={feedbackFields}
      />
    <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_300px]">
      {/* Left: banks */}
      <Card className="h-fit space-y-3">
        <div>
          <CardTitle>Comment banks</CardTitle>
          <p className="mt-1 text-xs text-slate-500">
            Assignment comments and linked school banks.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSelectedBank("assignment")}
          className={`w-full rounded-xl px-3 py-2 text-left text-sm ${
            selectedBank === "assignment"
              ? "bg-brand-50 font-medium text-brand-900"
              : "hover:bg-slate-50"
          }`}
        >
          Assignment comments
          <span className="ml-2 text-xs text-slate-400">{comments.length}</span>
        </button>
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            School banks
          </p>
          {commentBanks.length === 0 ? (
            <p className="text-xs text-slate-400">No school banks available.</p>
          ) : (
            commentBanks.map((bank) => {
              const linked = bankIds.includes(bank.id);
              return (
                <label
                  key={bank.id}
                  className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={linked}
                    onChange={() => toggleBank(bank.id)}
                  />
                  <span className="min-w-0 flex-1 truncate">{bank.name}</span>
                </label>
              );
            })
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={saveBankLinks}
          disabled={bankPending}
        >
          {bankPending ? "Saving…" : "Save bank links"}
        </Button>
        {bankMessage ? (
          <p className="text-xs text-slate-500">{bankMessage}</p>
        ) : null}
      </Card>

      {/* Centre: comments */}
      <div className="space-y-4">
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Comments</CardTitle>
            <p className="mt-1 text-sm text-slate-500">
              Inline edit, reorder, and bulk paste. Autosave never deletes unless
              you remove a comment.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              tone={commentAutosaveError ? "danger" : "neutral"}
            >
              {commentAutosaveLabel}
            </Badge>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onFlushComments?.()}
            >
              Save now
            </Button>
            <Button type="button" onClick={addComment}>
              + Add comment
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setGeneratorOpen((v) => !v)}
            >
              Quick generate
            </Button>
          </div>
        </Card>

        {commentAutosaveError ? (
          <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {commentAutosaveError}
          </div>
        ) : null}

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search comments…"
        />

        {generatorOpen ? (
          <QuickGenerator
            onGenerate={generateQuickSet}
            onPaste={pasteBulk}
            onClose={() => setGeneratorOpen(false)}
          />
        ) : null}

        {filtered.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-500">
              No comments yet. Add one, paste from a spreadsheet, or use Quick
              generate.
            </p>
          </Card>
        ) : null}

        {filtered.map((comment, index) => (
          <button
            key={comment._id}
            type="button"
            onClick={() => setSelectedCommentId(comment._id)}
            className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
              selectedComment?._id === comment._id
                ? "border-brand-300 bg-brand-50"
                : "border-slate-100 bg-white hover:border-brand-100"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-900">
                {comment.short_label || "Untitled"}
              </span>
              <Badge tone={comment.is_active ? "success" : "neutral"}>
                {comment.is_active ? "Active" : "Off"}
              </Badge>
              {comment.category ? (
                <Badge tone="brand">{comment.category}</Badge>
              ) : null}
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-slate-600">
              {comment.full_comment || "No comment text"}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  moveComment(comment._id, -1);
                }}
                disabled={index === 0}
              >
                Up
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  moveComment(comment._id, 1);
                }}
                disabled={index === filtered.length - 1}
              >
                Down
              </Button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={(e) => {
                  e.stopPropagation();
                  removeComment(comment._id);
                }}
              >
                Delete
              </Button>
            </div>
          </button>
        ))}
      </div>

      {/* Right: links / usage */}
      <Card className="h-fit space-y-4">
        <div>
          <CardTitle>Links & usage</CardTitle>
          <p className="mt-1 text-xs text-slate-500">
            Link the selected comment to questions or a section. Store IDs;
            display titles.
          </p>
        </div>
        {!selectedComment ? (
          <p className="text-sm text-slate-500">Select a comment to edit links.</p>
        ) : (
          <CommentLinkPanel
            comment={selectedComment}
            questionOptions={questionOptions}
            sectionOptions={sectionOptions}
            onChange={(patch) => updateComment(selectedComment._id, patch)}
          />
        )}
      </Card>
    </div>
    </div>
  );
}

function CommentLinkPanel({
  comment,
  questionOptions,
  sectionOptions,
  onChange,
}: {
  comment: AssignmentCommentDraft;
  questionOptions: Array<{ id: string; label: string }>;
  sectionOptions: Array<{ id: string; label: string }>;
  onChange: (patch: Partial<AssignmentCommentDraft>) => void;
}) {
  const linked = new Set(comment.linked_question_ids ?? []);
  if (comment.linked_question_id) linked.add(comment.linked_question_id);

  return (
    <div className="space-y-3">
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-slate-500">
          Short label
        </span>
        <Input
          value={comment.short_label}
          onChange={(e) => onChange({ short_label: e.target.value })}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-slate-500">
          Full comment
        </span>
        <Textarea
          value={comment.full_comment}
          onChange={(e) => onChange({ full_comment: e.target.value })}
          className="min-h-24"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-slate-500">
          Category / set name
        </span>
        <Input
          value={comment.category}
          onChange={(e) => onChange({ category: e.target.value })}
          placeholder="Optional"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-slate-500">
          Assessment objective (optional)
        </span>
        <Input
          value={comment.assessment_objective ?? ""}
          onChange={(e) =>
            onChange({ assessment_objective: e.target.value || null })
          }
          placeholder="Any tag you define"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Mark min
          </span>
          <Input
            type="number"
            value={comment.mark_range_min ?? ""}
            onChange={(e) =>
              onChange({
                mark_range_min: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Mark max
          </span>
          <Input
            type="number"
            value={comment.mark_range_max ?? ""}
            onChange={(e) =>
              onChange({
                mark_range_max: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-slate-500">
          Linked section
        </span>
        <select
          className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
          value={comment.linked_section_id ?? ""}
          onChange={(e) =>
            onChange({ linked_section_id: e.target.value || null })
          }
        >
          <option value="">Whole assignment</option>
          {sectionOptions.map((section) => (
            <option key={section.id} value={section.id}>
              {section.label}
            </option>
          ))}
        </select>
      </label>

      <div>
        <p className="mb-1 text-xs font-medium text-slate-500">
          Linked questions
        </p>
        <div className="max-h-40 space-y-1 overflow-auto rounded-xl border border-slate-100 p-2">
          {questionOptions.length === 0 ? (
            <p className="text-xs text-slate-400">
              Save worksheet questions first to link them.
            </p>
          ) : (
            questionOptions.map((q) => (
              <label
                key={q.id}
                className="flex items-start gap-2 text-xs text-slate-700"
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={linked.has(q.id)}
                  onChange={(e) => {
                    const next = new Set(linked);
                    if (e.target.checked) next.add(q.id);
                    else next.delete(q.id);
                    const ids = Array.from(next);
                    onChange({
                      linked_question_ids: ids,
                      linked_question_id: ids[0] ?? null,
                    });
                  }}
                />
                <span>{q.label}</span>
              </label>
            ))
          )}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-500">Usage</p>
        <Checkbox
          label="Question feedback"
          checked={comment.available_for_question}
          onChange={(available_for_question) =>
            onChange({ available_for_question })
          }
        />
        <Checkbox
          label="Overall feedback"
          checked={comment.available_for_overall}
          onChange={(available_for_overall) =>
            onChange({ available_for_overall })
          }
        />
        <Checkbox
          label="Annotation"
          checked={comment.available_for_annotation ?? false}
          onChange={(available_for_annotation) =>
            onChange({ available_for_annotation })
          }
        />
        <Checkbox
          label="Active"
          checked={comment.is_active}
          onChange={(is_active) => onChange({ is_active })}
        />
      </div>
    </div>
  );
}

function QuickGenerator({
  onGenerate,
  onPaste,
  onClose,
}: {
  onGenerate: (input: {
    prefix: string;
    suffix: string;
    labels: string;
  }) => void;
  onPaste: (raw: string) => void;
  onClose: () => void;
}) {
  const [prefix, setPrefix] = useState("");
  const [suffix, setSuffix] = useState("");
  const [labels, setLabels] = useState("Label 1\nLabel 2\nLabel 3");
  const [paste, setPaste] = useState("");

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <CardTitle>Quick generate / paste</CardTitle>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        Placeholders only — edit or remove anything. No subject-specific terms
        are required.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-500">Optional prefix</span>
          <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-500">Optional suffix</span>
          <Input value={suffix} onChange={(e) => setSuffix(e.target.value)} />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-slate-500">
          Labels or bands (one per line)
        </span>
        <Textarea
          value={labels}
          onChange={(e) => setLabels(e.target.value)}
          className="min-h-24"
        />
      </label>
      <Button
        type="button"
        onClick={() => onGenerate({ prefix, suffix, labels })}
      >
        Generate comments
      </Button>
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-slate-500">
          Paste from spreadsheet (label [tab] comment [tab] category)
        </span>
        <Textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          className="min-h-20"
          placeholder="Short label&#9;Full comment&#9;Category"
        />
      </label>
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          onPaste(paste);
          setPaste("");
        }}
      >
        Import pasted rows
      </Button>
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

export function normaliseComments(comments: AssignmentCommentDraft[]) {
  return comments.map((comment, index) => ({
    ...comment,
    sort_order: index,
    linked_question_ids:
      comment.linked_question_ids?.length
        ? comment.linked_question_ids
        : comment.linked_question_id
          ? [comment.linked_question_id]
          : [],
  }));
}

export function commentLinkedQuestionIds(
  comment: AssignmentCommentDraft,
): string[] {
  if (comment.linked_question_ids?.length) return [...comment.linked_question_ids];
  if (comment.linked_question_id) return [comment.linked_question_id];
  return [];
}

function collectQuestionOptions(sections: BuilderSection[]) {
  const options: Array<{ id: string; label: string }> = [];

  function walk(section: BuilderSection) {
    for (const block of section.blocks) {
      if (!(RESPONSE_BLOCK_TYPES as readonly string[]).includes(block.block_type)) {
        continue;
      }
      // Only real DB question IDs — never block._id (breaks FK).
      if (!block.question_id) continue;
      options.push({
        id: block.question_id,
        label: `${block.content || block.prompt || BLOCK_TYPE_LABELS[block.block_type]} (${BLOCK_TYPE_LABELS[block.block_type]})`,
      });
    }
    for (const sub of section.subsections) walk(sub);
  }

  for (const section of sections) walk(section);
  return options;
}

function collectSectionOptions(sections: BuilderSection[]) {
  const options: Array<{ id: string; label: string }> = [];
  function walk(section: BuilderSection, depth = 0) {
    options.push({
      id: section._id,
      label: `${"— ".repeat(depth)}${section.title || "Section"}`,
    });
    for (const sub of section.subsections) walk(sub, depth + 1);
  }
  for (const section of sections) walk(section);
  return options;
}
