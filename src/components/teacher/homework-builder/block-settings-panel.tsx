"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PassageView } from "@/components/shared/passage-view";
import {
  applyAutomaticLabels,
  createPassageLine,
  deletePassageLine,
  linesToContent,
  mergePassageLineWithPrevious,
  movePassageLineRow,
  normalizePassageConfig,
  normalizePassageLines,
  splitPassageLine,
} from "@/lib/homework/passage-numbering";
import {
  BLOCK_TYPE_LABELS,
  RESPONSE_BLOCK_TYPES,
  defaultScannedUploadConfig,
  type AssignmentCommentDraft,
  type BuilderBlock,
  type BuilderSection,
  type PassageConfig,
  type PassageLine,
  type ScannedUploadConfig,
  type ScannedUploadSubquestion,
} from "@/lib/types";
import { newId, normalizeNumericConfig } from "@/lib/homework/structure";
import {
  commentLinkedQuestionIds,
  type CommentBankOption,
} from "./feedback-stage";
import { McqEditor } from "./mcq-editor";
import { MediaBlockFields } from "./media-block-fields";
import { TableEditor } from "./table-editor";

type BlockUpdater = (prev: BuilderBlock) => BuilderBlock;

interface Props {
  block: BuilderBlock | null;
  allSections: BuilderSection[];
  onChange: (updater: BlockUpdater) => void;
  commentBanks?: CommentBankOption[];
  assignmentComments?: AssignmentCommentDraft[];
  onAssignmentCommentsChange?: (next: AssignmentCommentDraft[]) => void;
  assignmentId?: string;
}

export function BlockSettingsPanel({
  block,
  allSections,
  onChange,
  commentBanks = [],
  assignmentComments = [],
  onAssignmentCommentsChange,
  assignmentId = "",
}: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const passageBlocks = useMemo(() => collectPassageBlocks(allSections), [allSections]);

  if (!block) {
    return (
      <Card className="sticky top-4">
        <CardTitle className="mb-2">Block settings</CardTitle>
        <p className="text-sm text-slate-500">
          Select a block on the worksheet canvas to edit its student-facing wording,
          marks, and teacher guidance.
        </p>
      </Card>
    );
  }

  const isResponse = (RESPONSE_BLOCK_TYPES as readonly string[]).includes(block.block_type);
  const isMcq =
    block.block_type === "multiple_choice" || block.block_type === "multiple_select";
  const set = <K extends keyof BuilderBlock>(key: K, value: BuilderBlock[K]) =>
    onChange((prev) => ({ ...prev, [key]: value }));
  const visibleToStudents = !(block.teacher_only || block.student_visible === false);

  return (
    <Card className="sticky top-4 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <CardTitle>Block settings</CardTitle>
          <p className="mt-1 text-xs text-slate-500">
            {BLOCK_TYPE_LABELS[block.block_type]}
          </p>
        </div>
        {block.teacher_only ? <Badge tone="warning">Teacher only</Badge> : null}
      </div>

      <div className="space-y-3">
        {block.block_type !== "passage" ? (
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Student title
            </span>
            <Input
              value={block.content}
              onChange={(e) => set("content", e.target.value)}
              placeholder={titlePlaceholder(block)}
            />
          </label>
        ) : null}

        {block.block_type === "passage" ? (
          <PassageFields block={block} onChange={onChange} />
        ) : block.block_type === "image" ||
          block.block_type === "embedded_video" ||
          block.block_type === "downloadable_resource" ? (
          <MediaBlockFields
            block={block}
            assignmentId={assignmentId}
            onChange={onChange}
          />
        ) : (
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Student instructions
            </span>
            <Textarea
              value={block.prompt ?? ""}
              onChange={(e) => set("prompt", e.target.value)}
              placeholder="What should students do?"
              className="min-h-24"
            />
          </label>
        )}

        {isResponse ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                Marks for this question
              </span>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={block.max_marks ?? ""}
                onChange={(e) =>
                  set("max_marks", e.target.value ? Number(e.target.value) : null)
                }
                placeholder="0"
              />
            </label>
            <label className="flex items-center gap-2 pt-6 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={block.required ?? false}
                onChange={(e) => set("required", e.target.checked)}
                className="rounded border-slate-300"
              />
              Required
            </label>
          </div>
        ) : null}

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={visibleToStudents}
            onChange={(e) => {
              const visible = e.target.checked;
              onChange((prev) => ({
                ...prev,
                teacher_only: !visible,
                student_visible: visible,
              }));
            }}
            className="rounded border-slate-300"
          />
          Visible to students
        </label>
      </div>

      {isMcq ? <McqEditor block={block} onChange={onChange} /> : null}

      {block.block_type === "extended_writing" ? (
        <ExtendedWritingFields
          block={block}
          passageBlocks={passageBlocks}
          onChange={onChange}
        />
      ) : null}

      {block.block_type === "numeric" ? (
        <NumericFields block={block} onChange={onChange} />
      ) : null}

      {block.block_type === "table" || block.block_type === "vocabulary_table" ? (
        <TableEditor block={block} onChange={onChange} />
      ) : null}

      {block.block_type === "scanned_homework_upload" ? (
        <ScannedUploadSettings
          block={block}
          onChange={onChange}
          assignmentId={assignmentId}
        />
      ) : null}

      <div className="border-t border-slate-100 pt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
        >
          {advancedOpen ? "Hide advanced settings" : "Advanced settings"}
        </Button>
      </div>

      {advancedOpen ? (
        <div className="space-y-3">
          {isResponse ? (
            <>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-500">
                  Teacher marking guidance
                </span>
                <Textarea
                  value={block.mark_scheme_note ?? ""}
                  onChange={(e) => set("mark_scheme_note", e.target.value || null)}
                  placeholder="What should teachers look for when marking?"
                  className="min-h-20"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-500">
                  Teacher-only notes
                </span>
                <Textarea
                  value={block.teacher_note ?? ""}
                  onChange={(e) => set("teacher_note", e.target.value || null)}
                  placeholder="Notes students cannot see"
                  className="min-h-20"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={block.marks_apply !== false}
                  onChange={(e) => set("marks_apply", e.target.checked)}
                  className="rounded border-slate-300"
                />
                Include in total marks
              </label>
            </>
          ) : (
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                Teacher-only notes
              </span>
              <Textarea
                value={block.teacher_note ?? ""}
                onChange={(e) => set("teacher_note", e.target.value || null)}
                placeholder="Notes students cannot see"
                className="min-h-20"
              />
            </label>
          )}

          <LinkedFeedbackComments
            block={block}
            comments={assignmentComments}
            commentBanks={commentBanks}
            onCommentsChange={onAssignmentCommentsChange}
          />
        </div>
      ) : null}
    </Card>
  );
}

function PassageFields({
  block,
  onChange,
}: {
  block: BuilderBlock;
  allSections?: BuilderSection[];
  onChange: (updater: BlockUpdater) => void;
}) {
  const config = normalizePassageConfig(block.passageConfig, block.content);
  const lines = config.lines ?? [];

  function commitLines(nextLines: PassageLine[], patch?: Partial<PassageConfig>) {
    const ordered = nextLines.map((line, index) => ({ ...line, order: index }));
    const content = linesToContent(ordered);
    onChange((prev) => ({
      ...prev,
      content,
      passageConfig: normalizePassageConfig(
        {
          ...normalizePassageConfig(prev.passageConfig, prev.content),
          ...patch,
          lines: ordered,
          line_number_mode: "manual",
          show_line_numbers: ordered.some(
            (l) => l.label != null && String(l.label).trim() !== "",
          ),
        },
        content,
      ),
    }));
  }

  function patchMeta(patch: Partial<PassageConfig>) {
    onChange((prev) => ({
      ...prev,
      passageConfig: normalizePassageConfig(
        {
          ...normalizePassageConfig(prev.passageConfig, prev.content),
          ...patch,
          lines,
        },
        prev.content,
      ),
    }));
  }

  function updateLine(id: string, patch: Partial<PassageLine>) {
    commitLines(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Passage title
          </span>
          <Input
            value={config.title ?? ""}
            onChange={(e) => patchMeta({ title: e.target.value })}
            placeholder="Optional title"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">Source</span>
          <Input
            value={config.source_reference ?? ""}
            onChange={(e) => patchMeta({ source_reference: e.target.value })}
            placeholder="Author, book, article..."
          />
        </label>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Passage rows & line labels
          </p>
          <div className="flex flex-wrap gap-1">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                commitLines(applyAutomaticLabels(lines, "every_line", 1))
              }
            >
              Label every row
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                commitLines(applyAutomaticLabels(lines, "every_5", 1))
              }
            >
              Every 5th
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                commitLines(applyAutomaticLabels(lines, "every_10", 1))
              }
            >
              Every 10th
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                commitLines(applyAutomaticLabels(lines, "clear"))
              }
            >
              Clear labels
            </Button>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Type any label beside a row (1, 5, A, 1a…). Leave blank for no number.
          Labels never come from browser wrapping.
        </p>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Paste or edit all rows
          </span>
          <Textarea
            value={linesToContent(lines)}
            onChange={(e) => {
              const next = normalizePassageLines(null, e.target.value).map(
                (line, index) => ({
                  ...line,
                  label: lines[index]?.label ?? null,
                  id: lines[index]?.id ?? line.id,
                }),
              );
              commitLines(next);
            }}
            placeholder="Paste the extract. Each new line is one labelled row."
            className="min-h-28 bg-white"
          />
        </label>

        <div className="max-h-80 space-y-2 overflow-auto rounded-xl border border-slate-200 bg-white p-2">
          {lines.length === 0 ? (
            <p className="px-2 py-3 text-sm text-slate-400">
              No rows yet. Paste text above or add a row.
            </p>
          ) : null}
          {lines.map((line, index) => (
            <div
              key={line.id}
              className="grid gap-2 rounded-lg border border-slate-100 px-2 py-2 sm:grid-cols-[72px_minmax(0,1fr)_auto]"
            >
              <Input
                value={line.label ?? ""}
                onChange={(e) =>
                  updateLine(line.id, {
                    label: e.target.value.trim() ? e.target.value : null,
                  })
                }
                placeholder="Label"
                aria-label={`Line label for row ${index + 1}`}
                className="h-9 text-sm"
              />
              <Textarea
                value={line.text}
                onChange={(e) => updateLine(line.id, { text: e.target.value })}
                className="min-h-12 text-sm"
                aria-label={`Passage text row ${index + 1}`}
              />
              <div className="flex flex-wrap gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={index === 0}
                  onClick={() =>
                    commitLines(movePassageLineRow(lines, line.id, -1))
                  }
                >
                  Up
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={index === lines.length - 1}
                  onClick={() =>
                    commitLines(movePassageLineRow(lines, line.id, 1))
                  }
                >
                  Down
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => commitLines(splitPassageLine(lines, line.id))}
                >
                  Split
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={index === 0}
                  onClick={() =>
                    commitLines(mergePassageLineWithPrevious(lines, line.id))
                  }
                >
                  Merge
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  onClick={() => commitLines(deletePassageLine(lines, line.id))}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            commitLines([...lines, createPassageLine("", lines.length, null)])
          }
        >
          + Add row
        </Button>

        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500">
            Student / marking preview
          </p>
          <PassageView text={linesToContent(lines)} config={config} />
        </div>
      </div>
    </div>
  );
}

function ExtendedWritingFields({
  block,
  passageBlocks,
  onChange,
}: {
  block: BuilderBlock;
  passageBlocks: Array<{ id: string; label: string }>;
  onChange: (updater: BlockUpdater) => void;
}) {
  const set = <K extends keyof BuilderBlock>(key: K, value: BuilderBlock[K]) =>
    onChange((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Extended writing
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">Word limit</span>
          <Input
            type="number"
            min={0}
            value={block.word_limit ?? ""}
            onChange={(e) => set("word_limit", e.target.value ? Number(e.target.value) : null)}
            placeholder="None"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Character limit
          </span>
          <Input
            type="number"
            min={0}
            value={block.char_limit ?? ""}
            onChange={(e) => set("char_limit", e.target.value ? Number(e.target.value) : null)}
            placeholder="None"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Suggested minutes
          </span>
          <Input
            type="number"
            min={0}
            value={block.suggested_minutes ?? ""}
            onChange={(e) =>
              set("suggested_minutes", e.target.value ? Number(e.target.value) : null)
            }
            placeholder="Optional"
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-slate-500">
          Linked passage blocks
        </span>
        <select
          multiple
          value={block.passage_block_ids ?? []}
          onChange={(e) =>
            set(
              "passage_block_ids",
              Array.from(e.currentTarget.selectedOptions).map((option) => option.value),
            )
          }
          className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          {passageBlocks.map((passage) => (
            <option key={passage.id} value={passage.id}>
              {passage.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={block.allow_attachments ?? false}
          onChange={(e) => set("allow_attachments", e.target.checked)}
          className="rounded border-slate-300"
        />
        Allow attachments
      </label>
    </div>
  );
}

function NumericFields({
  block,
  onChange,
}: {
  block: BuilderBlock;
  onChange: (updater: BlockUpdater) => void;
}) {
  const numeric = normalizeNumericConfig(block.numericConfig);
  const set = <K extends keyof BuilderBlock>(key: K, value: BuilderBlock[K]) =>
    onChange((prev) => ({ ...prev, [key]: value }));
  const patchNumeric = (patch: Partial<typeof numeric>) =>
    onChange((prev) => ({
      ...prev,
      numericConfig: normalizeNumericConfig({
        ...normalizeNumericConfig(prev.numericConfig),
        ...patch,
      }),
    }));

  return (
    <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Numeric response
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Minimum value
          </span>
          <Input
            type="number"
            value={block.min_value ?? ""}
            onChange={(e) =>
              set("min_value", e.target.value !== "" ? Number(e.target.value) : null)
            }
            placeholder="No minimum"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Maximum value
          </span>
          <Input
            type="number"
            value={block.max_value ?? ""}
            onChange={(e) =>
              set("max_value", e.target.value !== "" ? Number(e.target.value) : null)
            }
            placeholder="No maximum"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="rounded border-slate-300"
            checked={numeric.allow_decimals}
            onChange={(e) => patchNumeric({ allow_decimals: e.target.checked })}
          />
          Allow decimal values
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Decimal places
          </span>
          <Input
            type="number"
            min={0}
            max={8}
            disabled={!numeric.allow_decimals}
            value={numeric.decimal_places ?? ""}
            onChange={(e) =>
              patchNumeric({
                decimal_places: e.target.value !== "" ? Number(e.target.value) : null,
              })
            }
            placeholder="Any"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Unit (optional)
          </span>
          <Input
            value={numeric.unit ?? ""}
            onChange={(e) => patchNumeric({ unit: e.target.value || null })}
            placeholder="cm, kg, %"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Marking mode
          </span>
          <select
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
            value={block.marking_mode ?? "teacher_reviewed"}
            onChange={(e) =>
              set(
                "marking_mode",
                e.target.value as "automatic" | "teacher_reviewed",
              )
            }
          >
            <option value="teacher_reviewed">Teacher reviewed</option>
            <option value="automatic">Automatic</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Correct answer
          </span>
          <Input
            type="number"
            value={block.correct_answer ?? ""}
            onChange={(e) => set("correct_answer", e.target.value || null)}
            placeholder="Exact value (optional)"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Accepted minimum
          </span>
          <Input
            type="number"
            value={numeric.correct_min ?? ""}
            onChange={(e) =>
              patchNumeric({
                correct_min: e.target.value !== "" ? Number(e.target.value) : null,
              })
            }
            placeholder="Range min"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Accepted maximum
          </span>
          <Input
            type="number"
            value={numeric.correct_max ?? ""}
            onChange={(e) =>
              patchNumeric({
                correct_max: e.target.value !== "" ? Number(e.target.value) : null,
              })
            }
            placeholder="Range max"
          />
        </label>
      </div>
    </div>
  );
}

function LinkedFeedbackComments({
  block,
  comments,
  commentBanks,
  onCommentsChange,
}: {
  block: BuilderBlock;
  comments: AssignmentCommentDraft[];
  commentBanks: CommentBankOption[];
  onCommentsChange?: (next: AssignmentCommentDraft[]) => void;
}) {
  const [search, setSearch] = useState("");
  const questionId = block.question_id ?? null;

  const linked = useMemo(() => {
    if (!questionId) return [];
    return comments.filter((comment) =>
      commentLinkedQuestionIds(comment).includes(questionId),
    );
  }, [comments, questionId]);

  const bankName = "Assignment comments";

  const searchable = useMemo(() => {
    const q = search.trim().toLowerCase();
    return comments.filter((comment) => {
      if (!comment.is_active) return false;
      if (questionId && commentLinkedQuestionIds(comment).includes(questionId)) {
        return false;
      }
      if (!q) return true;
      return (
        comment.short_label.toLowerCase().includes(q) ||
        comment.full_comment.toLowerCase().includes(q) ||
        comment.category.toLowerCase().includes(q)
      );
    });
  }, [comments, questionId, search]);

  function usageLabel(comment: AssignmentCommentDraft) {
    const parts: string[] = [];
    if (comment.available_for_question) parts.push("Question feedback");
    if (comment.available_for_overall) parts.push("Overall feedback");
    if (comment.available_for_annotation) parts.push("Annotation");
    if (comment.available_for_drag_drop) parts.push("Drag & drop");
    return parts.length ? parts.join(" · ") : "No usage flags";
  }

  function linkComment(commentId: string) {
    if (!questionId || !onCommentsChange) return;
    onCommentsChange(
      comments.map((comment) => {
        if (comment._id !== commentId) return comment;
        const ids = new Set(commentLinkedQuestionIds(comment));
        ids.add(questionId);
        const nextIds = [...ids];
        return {
          ...comment,
          linked_question_ids: nextIds,
          linked_question_id: nextIds[0] ?? null,
        };
      }),
    );
  }

  function unlinkComment(commentId: string) {
    if (!questionId || !onCommentsChange) return;
    onCommentsChange(
      comments.map((comment) => {
        if (comment._id !== commentId) return comment;
        const nextIds = commentLinkedQuestionIds(comment).filter(
          (id) => id !== questionId,
        );
        return {
          ...comment,
          linked_question_ids: nextIds,
          linked_question_id: nextIds[0] ?? null,
        };
      }),
    );
  }

  if (!questionId) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-500">
          Linked feedback comments
        </p>
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400">
          Save this question first so it has a stable question ID, then link
          comments.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium text-slate-500">
          Linked feedback comments
        </p>
        <p className="mt-0.5 text-[11px] text-slate-400">
          Links use the question ID (not the title). Same comments appear in
          marking.
        </p>
      </div>

      {linked.length > 0 ? (
        <ul className="space-y-2">
          {linked.map((comment) => (
            <li
              key={comment._id}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    {comment.category?.trim() || bankName}
                  </p>
                  <p className="font-medium text-slate-900">
                    {comment.short_label || "Untitled comment"}
                  </p>
                  {comment.full_comment ? (
                    <p className="line-clamp-3 whitespace-pre-wrap text-xs text-slate-600">
                      {comment.full_comment}
                    </p>
                  ) : null}
                  <p className="text-[11px] text-slate-400">
                    {usageLabel(comment)}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Linked question ID: {questionId.slice(0, 8)}…
                  </p>
                </div>
                {onCommentsChange ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => unlinkComment(comment._id)}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400">
          No linked comments yet.
        </div>
      )}

      {onCommentsChange ? (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <p className="text-xs font-medium text-slate-500">
            Link feedback comments
          </p>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search assignment comments…"
          />
          {commentBanks.length > 0 ? (
            <p className="text-[11px] text-slate-400">
              Admin banks can be selected in the Feedback stage:{" "}
              {commentBanks.map((b) => b.name).join(", ")}. Link individual
              assignment-specific comments below.
            </p>
          ) : null}
          <div className="max-h-48 space-y-1 overflow-auto">
            {searchable.length === 0 ? (
              <p className="text-xs text-slate-400">
                {comments.length === 0
                  ? "Create comments in the Feedback stage first."
                  : "No matching unlinked comments."}
              </p>
            ) : (
              searchable.slice(0, 20).map((comment) => (
                <button
                  key={comment._id}
                  type="button"
                  onClick={() => linkComment(comment._id)}
                  className="flex w-full items-start justify-between gap-2 rounded-xl border border-slate-100 px-2 py-1.5 text-left text-sm hover:bg-brand-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-800">
                      {comment.short_label || "Untitled"}
                    </span>
                    <span className="block truncate text-[11px] text-slate-400">
                      {comment.full_comment || "No full comment"}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-brand-700">Link</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function collectPassageBlocks(sections: BuilderSection[]) {
  const passages: Array<{ id: string; label: string }> = [];

  function walk(section: BuilderSection) {
    for (const block of section.blocks) {
      if (block.block_type === "passage") {
        passages.push({
          id: block._id,
          label: block.passageConfig?.title || block.content.slice(0, 40) || "Untitled passage",
        });
      }
    }
    for (const sub of section.subsections) walk(sub);
  }

  for (const section of sections) walk(section);
  return passages;
}

function titlePlaceholder(block: BuilderBlock) {
  if (block.block_type === "heading") return "Heading";
  if (block.block_type === "subheading") return "Subheading";
  if (block.block_type === "passage") return "Passage title";
  if ((RESPONSE_BLOCK_TYPES as readonly string[]).includes(block.block_type)) {
    return "Question title";
  }
  return "Student-facing title";
}

function ScannedUploadSettings({
  block,
  onChange,
  assignmentId,
}: {
  block: BuilderBlock;
  onChange: (updater: BlockUpdater) => void;
  assignmentId: string;
}) {
  const config = block.scannedUploadConfig ?? defaultScannedUploadConfig();
  const subquestions = [...config.subquestions].sort(
    (a, b) => a.display_order - b.display_order,
  );
  const derivedTotal = subquestions
    .filter((q) => q.include_in_total)
    .reduce((sum, q) => sum + Number(q.maximum_mark || 0), 0);
  const [schemeStatus, setSchemeStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [schemeError, setSchemeError] = useState<string | null>(null);

  function patchConfig(next: Partial<ScannedUploadConfig>) {
    onChange((prev) => {
      const current = prev.scannedUploadConfig ?? defaultScannedUploadConfig();
      const merged = { ...current, ...next };
      const total =
        merged.subquestions.length > 0
          ? merged.subquestions
              .filter((q) => q.include_in_total)
              .reduce((sum, q) => sum + Number(q.maximum_mark || 0), 0)
          : prev.max_marks;
      return {
        ...prev,
        scannedUploadConfig: merged,
        max_marks: total,
      };
    });
  }

  function updateSub(
    id: string,
    patch: Partial<ScannedUploadSubquestion>,
  ) {
    patchConfig({
      subquestions: config.subquestions.map((q) =>
        q.id === id ? { ...q, ...patch } : q,
      ),
    });
  }

  async function uploadMarkScheme(file: File | null) {
    if (!file) return;
    if (!assignmentId) {
      setSchemeError("Save the assignment before uploading a mark scheme.");
      setSchemeStatus("error");
      return;
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setSchemeError("Mark schemes must be PDF files.");
      setSchemeStatus("error");
      return;
    }
    setSchemeStatus("saving");
    setSchemeError(null);
    const { uploadBlockMediaAction } = await import(
      "@/lib/actions/homework-builder"
    );
    const fd = new FormData();
    fd.set("file", file);
    const result = await uploadBlockMediaAction(assignmentId, "download", fd);
    if (result.error || !result.media) {
      setSchemeError(result.error ?? "Upload failed");
      setSchemeStatus("error");
      return;
    }
    patchConfig({
      mark_scheme_storage_path: result.media.storage_path,
      mark_scheme_file_name: result.media.file_name,
    });
    setSchemeStatus("saved");
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-100 p-3">
      <div>
        <p className="text-sm font-semibold text-slate-900">Upload settings</p>
        <p className="text-xs text-slate-500">
          Students upload scanned or photographed work for marking.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-slate-500">Max files</span>
          <Input
            type="number"
            min={1}
            max={40}
            value={config.maximum_files}
            onChange={(e) =>
              patchConfig({ maximum_files: Number(e.target.value) || 1 })
            }
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-slate-500">
            Max file size (MB)
          </span>
          <Input
            type="number"
            min={1}
            max={50}
            value={Math.round(config.maximum_file_size_bytes / (1024 * 1024))}
            onChange={(e) =>
              patchConfig({
                maximum_file_size_bytes:
                  Math.max(1, Number(e.target.value) || 15) * 1024 * 1024,
              })
            }
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        {(
          [
            ["allow_pdf", "Allow PDF"],
            ["allow_images", "Allow images"],
            ["allow_docx", "Allow DOCX"],
            ["combine_images_to_pdf", "Combine images into one PDF"],
            ["allow_replacement", "Allow replace before submit"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(config[key])}
              onChange={(e) => patchConfig({ [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
      </div>

      <div className="space-y-2 border-t border-slate-100 pt-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Attached questions
            </p>
            <p className="text-xs text-slate-500">
              Mode A uses the block maximum. Mode B sums attached questions
              {subquestions.length
                ? ` · total ${derivedTotal} marks`
                : " · currently Mode A"}
              .
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const next: ScannedUploadSubquestion = {
                id: newId(),
                question_label: `Q${subquestions.length + 1}`,
                title: "",
                description: "",
                maximum_mark: 4,
                is_required: true,
                include_in_total: true,
                marking_guidance: "",
                display_order: subquestions.length,
              };
              patchConfig({ subquestions: [...config.subquestions, next] });
            }}
          >
            Add question
          </Button>
        </div>
        <div className="space-y-2">
          {subquestions.map((q) => (
            <div
              key={q.id}
              className="grid grid-cols-1 items-end gap-2 rounded-lg border border-slate-100 bg-slate-50/70 p-3 sm:grid-cols-[7rem_minmax(0,1fr)_5.5rem_auto_auto]"
            >
              <label className="text-sm">
                <span className="mb-1 block text-xs text-slate-500">
                  Question label
                </span>
                <Input
                  value={q.question_label}
                  placeholder="Q1a"
                  onChange={(e) =>
                    updateSub(q.id, { question_label: e.target.value })
                  }
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-slate-500">Title</span>
                <Input
                  value={q.title}
                  placeholder="Title"
                  onChange={(e) => updateSub(q.id, { title: e.target.value })}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-slate-500">
                  Maximum mark
                </span>
                <Input
                  type="number"
                  min={0}
                  value={q.maximum_mark}
                  onChange={(e) =>
                    updateSub(q.id, {
                      maximum_mark: Number(e.target.value) || 0,
                    })
                  }
                />
              </label>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={q.is_required}
                  onChange={(e) =>
                    updateSub(q.id, { is_required: e.target.checked })
                  }
                />
                Required
              </label>
              <div className="flex flex-wrap gap-2 pb-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={q.include_in_total}
                    onChange={(e) =>
                      updateSub(q.id, { include_in_total: e.target.checked })
                    }
                  />
                  In total
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    patchConfig({
                      subquestions: config.subquestions.filter(
                        (row) => row.id !== q.id,
                      ),
                    })
                  }
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2 border-t border-slate-100 pt-3">
        <p className="text-sm font-semibold text-slate-900">Mark scheme</p>
        <p className="text-xs text-slate-500">
          Staff-only PDF available in the marking interface. Students never see
          this file.
        </p>
        {config.mark_scheme_file_name ? (
          <p className="text-sm text-slate-700">
            Current: {config.mark_scheme_file_name}
          </p>
        ) : (
          <p className="text-xs text-slate-500">No mark-scheme PDF attached.</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-block">
            <span className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50">
              {config.mark_scheme_storage_path
                ? "Replace mark-scheme PDF"
                : "Upload mark-scheme PDF"}
            </span>
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(e) => {
                void uploadMarkScheme(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </label>
          {config.mark_scheme_storage_path ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                patchConfig({
                  mark_scheme_storage_path: null,
                  mark_scheme_file_name: null,
                })
              }
            >
              Remove
            </Button>
          ) : null}
          <span className="text-xs text-slate-500">
            {schemeStatus === "saving"
              ? "Saving"
              : schemeStatus === "saved"
                ? "Saved"
                : schemeStatus === "error"
                  ? "Save failed"
                  : null}
          </span>
        </div>
        {schemeError ? (
          <p className="text-xs text-rose-700">{schemeError}</p>
        ) : null}
      </div>
    </div>
  );
}
