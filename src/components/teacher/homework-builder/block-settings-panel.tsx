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
  type BuilderBlock,
  type BuilderSection,
  type PassageConfig,
  type PassageLine,
} from "@/lib/types";
import { normalizeNumericConfig } from "@/lib/homework/structure";
import { McqEditor } from "./mcq-editor";
import { MediaBlockFields } from "./media-block-fields";
import { TableEditor } from "./table-editor";

type CommentBankOption = { id: string; name: string };
type BlockUpdater = (prev: BuilderBlock) => BuilderBlock;

interface Props {
  block: BuilderBlock | null;
  allSections: BuilderSection[];
  onChange: (updater: BlockUpdater) => void;
  commentBanks?: CommentBankOption[];
  assignmentId?: string;
}

export function BlockSettingsPanel({
  block,
  allSections,
  onChange,
  commentBanks = [],
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
            ids={block.linked_comment_bank_ids ?? []}
            commentBanks={commentBanks}
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
  ids,
  commentBanks,
}: {
  ids: string[];
  commentBanks: CommentBankOption[];
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-500">
        Linked feedback comments (set up in Feedback stage)
      </p>
      {ids.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {ids.map((id) => {
            const label = commentBanks.find((bank) => bank.id === id)?.name ?? id;
            return (
              <Badge key={id} tone="neutral">
                {label}
              </Badge>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400">
          No linked comments yet.
        </div>
      )}
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
