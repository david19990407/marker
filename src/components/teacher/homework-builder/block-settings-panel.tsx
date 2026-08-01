"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PassageView } from "@/components/shared/passage-view";
import { normalizePassageConfig } from "@/lib/homework/passage-numbering";
import {
  BLOCK_TYPE_LABELS,
  RESPONSE_BLOCK_TYPES,
  type BuilderBlock,
  type BuilderSection,
  type PassageConfig,
  type PassageLineNumberMode,
  type PassageNumberingContinuation,
} from "@/lib/types";
import { McqEditor } from "./mcq-editor";
import { TableEditor } from "./table-editor";

type CommentBankOption = { id: string; name: string };
type BlockUpdater = (prev: BuilderBlock) => BuilderBlock;

interface Props {
  block: BuilderBlock | null;
  allSections: BuilderSection[];
  onChange: (updater: BlockUpdater) => void;
  commentBanks?: CommentBankOption[];
}

export function BlockSettingsPanel({
  block,
  allSections,
  onChange,
  commentBanks = [],
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

        {block.block_type === "passage" ? (
          <PassageFields block={block} onChange={onChange} />
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
  onChange: (updater: BlockUpdater) => void;
}) {
  const config = normalizePassageConfig(block.passageConfig);
  const mode = config.line_number_mode ?? "every_5";

  function patchConfig(patch: Partial<PassageConfig>) {
    onChange((prev) => {
      const next = normalizePassageConfig({
        ...normalizePassageConfig(prev.passageConfig),
        ...patch,
      });
      return { ...prev, passageConfig: next };
    });
  }

  function setMode(nextMode: PassageLineNumberMode) {
    const interval =
      nextMode === "every_line"
        ? 1
        : nextMode === "every_5"
          ? 5
          : nextMode === "every_10"
            ? 10
            : Math.max(1, config.line_number_interval || 5);
    patchConfig({
      line_number_mode: nextMode,
      line_number_interval: interval,
      show_line_numbers: nextMode !== "none",
    });
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-slate-500">Passage text</span>
        <Textarea
          value={block.content}
          onChange={(e) =>
            onChange((prev) => ({ ...prev, content: e.target.value }))
          }
          placeholder="Paste or write the source text students will read. Each new line becomes a numbered line."
          className="min-h-36"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">Passage title</span>
          <Input
            value={config.title ?? ""}
            onChange={(e) => patchConfig({ title: e.target.value })}
            placeholder="Optional title"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">Source</span>
          <Input
            value={config.source_reference ?? ""}
            onChange={(e) => patchConfig({ source_reference: e.target.value })}
            placeholder="Author, book, article..."
          />
        </label>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Line numbering
        </p>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">Display</span>
          <select
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
            value={mode}
            onChange={(e) => setMode(e.target.value as PassageLineNumberMode)}
          >
            <option value="none">No line numbers</option>
            <option value="every_line">Number every line</option>
            <option value="every_5">Number every fifth line</option>
            <option value="every_10">Number every tenth line</option>
            <option value="custom_interval">Custom interval</option>
            <option value="manual">Manual numbering</option>
          </select>
        </label>

        {mode === "custom_interval" ? (
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Show a number every
            </span>
            <Input
              type="number"
              min={1}
              value={config.line_number_interval}
              onChange={(e) =>
                patchConfig({
                  line_number_interval: Math.max(1, Number(e.target.value) || 1),
                })
              }
            />
          </label>
        ) : null}

        {mode === "manual" ? (
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Visible line numbers
            </span>
            <Input
              value={(config.manual_line_numbers ?? []).join(", ")}
              onChange={(e) => {
                const nums = e.target.value
                  .split(/[\s,;]+/)
                  .map((part) => Number(part.trim()))
                  .filter((n) => Number.isFinite(n) && n > 0)
                  .map((n) => Math.floor(n));
                patchConfig({ manual_line_numbers: nums });
              }}
              placeholder="e.g. 1, 6, 11, 16, 21"
            />
            <span className="mt-1 block text-xs text-slate-400">
              Enter the display numbers that should appear in the gutter.
            </span>
          </label>
        ) : null}

        {mode !== "none" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                Numbering sequence
              </span>
              <select
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={config.numbering_continuation ?? "custom_start"}
                onChange={(e) =>
                  patchConfig({
                    numbering_continuation: e.target
                      .value as PassageNumberingContinuation,
                  })
                }
              >
                <option value="restart">Restart numbering</option>
                <option value="continue">Continue from previous passage</option>
                <option value="custom_start">Begin from a chosen value</option>
              </select>
            </label>
            {(config.numbering_continuation ?? "custom_start") === "custom_start" ? (
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-500">
                  Start at
                </span>
                <Input
                  type="number"
                  min={1}
                  value={config.starting_line_number}
                  onChange={(e) =>
                    patchConfig({
                      starting_line_number: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                />
              </label>
            ) : (
              <p className="self-end text-xs text-slate-500">
                {(config.numbering_continuation ?? "custom_start") === "restart"
                  ? "This passage will begin at line 1."
                  : "This passage continues after the previous passage’s last line."}
              </p>
            )}
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500">Student preview</p>
          <PassageView text={block.content} config={config} />
          {mode !== "none" ? (
            <p className="text-xs text-slate-400">
              Teachers can reference these line numbers in marking guidance.
            </p>
          ) : null}
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
  const set = <K extends keyof BuilderBlock>(key: K, value: BuilderBlock[K]) =>
    onChange((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-slate-500">Minimum value</span>
        <Input
          type="number"
          value={block.min_value ?? ""}
          onChange={(e) => set("min_value", e.target.value ? Number(e.target.value) : null)}
          placeholder="No minimum"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-slate-500">Maximum value</span>
        <Input
          type="number"
          value={block.max_value ?? ""}
          onChange={(e) => set("max_value", e.target.value ? Number(e.target.value) : null)}
          placeholder="No maximum"
        />
      </label>
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
