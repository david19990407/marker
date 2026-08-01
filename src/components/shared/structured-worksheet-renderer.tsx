"use client";

import { useMemo, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PassageView } from "@/components/shared/passage-view";
import { SignedImage, SignedVideo } from "@/components/shared/signed-media";
import { DownloadButton } from "@/components/shared/download-button";
import { computePassageStartLines } from "@/lib/homework/passage-numbering";
import {
  labelsForOptionIds,
  selectedMcqOptionIds,
  studentVisibleMcqOptions,
} from "@/lib/homework/mcq-answers";
import {
  formatMcqOptionIdentifier,
  getBlockOptionLabelStyle,
  getMcqOptionText,
} from "@/lib/homework/mcq-options";
import {
  isResponseType,
  normalizeMediaConfig,
  normalizeNumericConfig,
  responseKey,
} from "@/lib/homework/structure";
import {
  filterSectionsForStudents,
  getMediaConfig,
  isVisibleBlock,
  type VisibilityMode,
} from "@/lib/homework/visibility";
import {
  isEmbeddableVideo,
  parseVideoUrl,
} from "@/lib/homework/video-embed";
import { formatMarkLabelBracketed } from "@/lib/homework/marks";
import { formatFileSize } from "@/lib/utils/files";
import type {
  BuilderBlock,
  BuilderSection,
  McqOption,
  MediaAlignment,
  MediaDisplaySize,
  StudentResponse,
} from "@/lib/types";

export type WorksheetMode =
  | "teacher_preview"
  | "student_editable"
  | "student_readonly"
  | "teacher_marking";

export type WorksheetResponseValue =
  | { type: "text"; text: string }
  | { type: "numeric"; numeric: number | null }
  | { type: "bool"; bool: boolean }
  | { type: "mcq"; optionIds: string[] }
  | {
      type: "table";
      cells: Array<{ row_index: number; col_index: number; text: string }>;
    };

type ResponseWithCells = StudentResponse & {
  cells?: Array<{
    row_index: number;
    col_index: number;
    text_value: string | null;
    numeric_value: number | null;
    boolean_value: boolean | string | null;
  }>;
};

export function StructuredWorksheetRenderer({
  sections,
  mode,
  values = {},
  errors = {},
  onValueChange,
  showTeacherGuidance = false,
  submissionMeta,
  selectedQuestionId = null,
  onSelectQuestion,
}: {
  sections: BuilderSection[];
  mode: WorksheetMode;
  values?: Record<string, WorksheetResponseValue>;
  errors?: Record<string, string>;
  onValueChange?: (questionId: string, value: WorksheetResponseValue) => void;
  showTeacherGuidance?: boolean;
  submissionMeta?: { status?: string | null; submittedAt?: string | null } | null;
  selectedQuestionId?: string | null;
  onSelectQuestion?: (questionId: string) => void;
}) {
  const visibilityMode: VisibilityMode =
    mode === "teacher_marking" ? "teacher_marking" : "student";

  const visibleSections = useMemo(
    () => filterSectionsForStudents(sections, visibilityMode),
    [sections, visibilityMode],
  );

  const passageStarts = useMemo(
    () =>
      computePassageStartLines(visibleSections, {
        studentFacing: mode !== "teacher_marking",
      }),
    [visibleSections, mode],
  );

  const editable = mode === "student_editable";
  const showGuidance =
    showTeacherGuidance || mode === "teacher_marking";
  const isStudentMode =
    mode === "student_editable" || mode === "student_readonly";

  function handleChange(questionId: string, value: WorksheetResponseValue) {
    if (!editable || !onValueChange) return;
    onValueChange(questionId, value);
  }

  const submittedBanner =
    mode === "student_readonly" && submissionMeta?.submittedAt
      ? formatSubmittedBanner(submissionMeta.submittedAt)
      : null;

  return (
    <div
      className="homework-worksheet mx-auto max-w-3xl space-y-8 px-1 sm:px-2"
      style={{
        fontFamily:
          "var(--font-plus-jakarta), ui-sans-serif, system-ui, sans-serif",
      }}
    >
      {submittedBanner ? (
        <div
          className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
          role="status"
        >
          {submittedBanner}
        </div>
      ) : null}

      {mode === "teacher_preview" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">Teacher preview</Badge>
          <span className="text-xs text-slate-500">
            Controls are disabled — this is how students will see the worksheet.
          </span>
        </div>
      ) : null}

      <div className="space-y-10 border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#fafafa_100%)] px-4 py-8 shadow-sm sm:px-8 sm:py-10">
        {visibleSections.length === 0 ? (
          <p className="text-sm text-slate-500">No worksheet content yet.</p>
        ) : (
          visibleSections.map((section) => (
            <SectionView
              key={section._id}
              section={section}
              mode={mode}
              values={values}
              errors={errors}
              onValueChange={handleChange}
              editable={editable}
              showGuidance={showGuidance && !isStudentMode}
              passageStarts={passageStarts}
              depth={0}
              selectedQuestionId={selectedQuestionId}
              onSelectQuestion={onSelectQuestion}
            />
          ))
        )}
      </div>
    </div>
  );
}

/** Map StudentResponse records into renderer values keyed by question_id. */
export function buildValuesFromResponses(
  sections: BuilderSection[],
  existing: Record<string, ResponseWithCells> | ResponseWithCells[],
): Record<string, WorksheetResponseValue> {
  const byId: Record<string, ResponseWithCells> = Array.isArray(existing)
    ? Object.fromEntries(existing.map((r) => [r.question_id, r]))
    : existing;

  const result: Record<string, WorksheetResponseValue> = {};

  function processSection(section: BuilderSection) {
    for (const block of section.blocks) {
      if (!isResponseType(block.block_type)) continue;
      const qid = responseKey(block);
      const resp =
        byId[qid] ??
        (block.question_id ? byId[block.question_id] : undefined);
      if (!resp) continue;

      if (block.block_type === "numeric") {
        result[qid] = { type: "numeric", numeric: resp.numeric_value };
      } else if (block.block_type === "tick_box") {
        result[qid] = { type: "bool", bool: resp.boolean_value ?? false };
      } else if (
        block.block_type === "multiple_choice" ||
        block.block_type === "multiple_select"
      ) {
        result[qid] = {
          type: "mcq",
          optionIds: selectedMcqOptionIds(block, resp),
        };
      } else if (
        block.block_type === "table" ||
        block.block_type === "vocabulary_table"
      ) {
        result[qid] = {
          type: "table",
          cells: (resp.cells ?? []).map((c) => ({
            row_index: c.row_index,
            col_index: c.col_index,
            text:
              c.text_value ??
              (c.numeric_value != null ? String(c.numeric_value) : "") ??
              (c.boolean_value != null ? String(c.boolean_value) : ""),
          })),
        };
      } else {
        result[qid] = {
          type: "text",
          text: resp.text_value ?? resp.file_name ?? "",
        };
      }
    }
    for (const sub of section.subsections) processSection(sub);
  }

  for (const section of sections) processSection(section);
  return result;
}

function formatSubmittedBanner(submittedAt: string): string {
  const date = new Date(submittedAt);
  const formatted = Number.isNaN(date.getTime())
    ? submittedAt
    : date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
  return `Submitted ${formatted} · read-only`;
}

function SectionView({
  section,
  mode,
  values,
  errors,
  onValueChange,
  editable,
  showGuidance,
  passageStarts,
  depth = 0,
  selectedQuestionId = null,
  onSelectQuestion,
}: {
  section: BuilderSection;
  mode: WorksheetMode;
  values: Record<string, WorksheetResponseValue>;
  errors: Record<string, string>;
  onValueChange: (qid: string, v: WorksheetResponseValue) => void;
  editable: boolean;
  showGuidance: boolean;
  passageStarts: Map<string, number>;
  depth?: number;
  selectedQuestionId?: string | null;
  onSelectQuestion?: (questionId: string) => void;
}) {
  const visibilityMode: VisibilityMode =
    mode === "teacher_marking" ? "teacher_marking" : "student";
  const blocks = section.blocks.filter((b) => isVisibleBlock(b, visibilityMode));
  const HeadingTag = depth > 0 ? "h4" : "h3";
  const showTitle = !isDefaultTitle(section.title);

  return (
    <section className="space-y-7" aria-labelledby={`section-${section._id}`}>
      {showTitle ? (
        <HeadingTag
          id={`section-${section._id}`}
          className={
            depth > 0
              ? "font-[family-name:var(--font-outfit)] text-lg font-semibold tracking-tight text-slate-800"
              : "font-[family-name:var(--font-outfit)] text-xl font-semibold tracking-tight text-slate-900"
          }
        >
          {section.title}
        </HeadingTag>
      ) : null}
      {blocks.map((block) => {
        const selected =
          mode === "teacher_marking" &&
          Boolean(block.question_id) &&
          selectedQuestionId === block.question_id;
        const body = (
          <BlockView
            block={block}
            mode={mode}
            values={values}
            error={errors[responseKey(block)]}
            onValueChange={onValueChange}
            editable={editable}
            showGuidance={showGuidance}
            startLineNumber={passageStarts.get(block._id)}
          />
        );
        if (mode !== "teacher_marking" || !block.question_id) return body;
        return (
          <div
            key={block._id}
            data-question-id={block.question_id}
            className={`rounded-xl transition ${
              selected
                ? "ring-2 ring-slate-900 ring-offset-2"
                : "hover:ring-1 hover:ring-slate-300"
            }`}
            onClick={() => onSelectQuestion?.(block.question_id!)}
          >
            {body}
          </div>
        );
      })}
      {section.subsections.map((sub) => (
        <div key={sub._id} className="border-l border-slate-200 pl-5">
          <SectionView
            section={sub}
            mode={mode}
            values={values}
            errors={errors}
            onValueChange={onValueChange}
            editable={editable}
            showGuidance={showGuidance}
            passageStarts={passageStarts}
            depth={depth + 1}
            selectedQuestionId={selectedQuestionId}
            onSelectQuestion={onSelectQuestion}
          />
        </div>
      ))}
    </section>
  );
}

function isDefaultTitle(title: string): boolean {
  const t = title.trim().toLowerCase();
  return (
    t === "new section" ||
    t === "new subsection" ||
    t === "section" ||
    t === "subsection"
  );
}

function BlockView({
  block,
  mode,
  values,
  error,
  onValueChange,
  editable,
  showGuidance,
  startLineNumber,
}: {
  block: BuilderBlock;
  mode: WorksheetMode;
  values: Record<string, WorksheetResponseValue>;
  error?: string;
  onValueChange: (qid: string, v: WorksheetResponseValue) => void;
  editable: boolean;
  showGuidance: boolean;
  startLineNumber?: number;
}) {
  const qid = responseKey(block);
  const current = values[qid];
  const fieldId = `q-${qid}`;
  const previewControls = mode === "teacher_preview";
  const plainDisplay =
    mode === "student_readonly" || mode === "teacher_marking";

  switch (block.block_type) {
    case "heading":
      return (
        <h2 className="font-[family-name:var(--font-outfit)] text-2xl font-semibold tracking-tight text-slate-900">
          {block.content}
        </h2>
      );
    case "subheading":
      return (
        <h3 className="font-[family-name:var(--font-outfit)] text-lg font-semibold tracking-tight text-slate-800">
          {block.content}
        </h3>
      );
    case "instruction":
    case "rich_text":
      return (
        <p className="whitespace-pre-wrap text-[1.02rem] leading-8 text-slate-700">
          {block.content}
        </p>
      );
    case "divider":
      return <hr className="border-slate-200" />;
    case "page_break":
      return (
        <div className="flex items-center gap-2" aria-hidden>
          <div className="h-px flex-1 border-t border-dashed border-slate-300" />
        </div>
      );
    case "passage":
      return (
        <PassageView
          text={block.content}
          config={block.passageConfig}
          startLineNumber={startLineNumber}
        />
      );
    case "image":
      return <ImageBlock block={block} mode={mode} />;
    case "embedded_video":
      return <VideoBlock block={block} mode={mode} />;
    case "downloadable_resource":
      return <ResourceBlock block={block} />;
    case "teacher_review":
      if (block.review_only !== false) {
        return (
          <div className="border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {block.content || block.prompt || "Teacher review item"}
            <p className="mt-1 text-xs text-slate-400">
              Your teacher will review this.
            </p>
            {showGuidance ? (
              <TeacherGuidancePanel block={block} />
            ) : null}
          </div>
        );
      }
      break;
    default:
      break;
  }

  if (block.review_only) {
    return (
      <div className="border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        {block.content || block.prompt || "Review item"}
        {showGuidance ? <TeacherGuidancePanel block={block} /> : null}
      </div>
    );
  }

  if (
    block.block_type === "numbered_question" ||
    block.block_type === "extended_writing"
  ) {
    const text = (current as { type: "text"; text: string } | undefined)?.text ?? "";
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;

    return (
      <QuestionShell
        block={block}
        fieldId={fieldId}
        error={error}
        showGuidance={showGuidance}
      >
        {editable || previewControls ? (
          <>
            <Textarea
              id={fieldId}
              value={text}
              onChange={(e) =>
                onValueChange(qid, { type: "text", text: e.target.value })
              }
              disabled={!editable}
              className="min-h-32 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 disabled:opacity-100"
              placeholder="Write your answer here…"
              maxLength={block.char_limit ?? undefined}
              aria-required={block.required}
              aria-invalid={!!error}
            />
            <p className="text-xs text-slate-400">
              {block.word_limit != null
                ? `${words} / ${block.word_limit} words`
                : `${words} words`}
              {block.char_limit != null
                ? ` · ${text.length} / ${block.char_limit} characters`
                : ""}
            </p>
          </>
        ) : (
          <p className="whitespace-pre-wrap text-[1.02rem] leading-7 text-slate-700">
            {text.trim() ? text : "Not answered"}
          </p>
        )}
      </QuestionShell>
    );
  }

  if (block.block_type === "short_text") {
    const text = (current as { type: "text"; text: string } | undefined)?.text ?? "";
    return (
      <QuestionShell
        block={block}
        fieldId={fieldId}
        error={error}
        showGuidance={showGuidance}
      >
        {editable || previewControls ? (
          <Input
            id={fieldId}
            value={text}
            onChange={(e) =>
              onValueChange(qid, { type: "text", text: e.target.value })
            }
            disabled={!editable}
            placeholder="Short answer…"
            className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 disabled:opacity-100"
            maxLength={block.char_limit ?? undefined}
            aria-required={block.required}
            aria-invalid={!!error}
          />
        ) : (
          <p className="text-[1.02rem] leading-7 text-slate-700">
            {text.trim() ? text : "Not answered"}
          </p>
        )}
      </QuestionShell>
    );
  }

  if (block.block_type === "numeric") {
    const numericCfg = normalizeNumericConfig(block.numericConfig);
    const numeric =
      (current as { type: "numeric"; numeric: number | null } | undefined)
        ?.numeric ?? null;
    const step = numericStep(numericCfg.allow_decimals, numericCfg.decimal_places);
    const display =
      numeric != null
        ? `${numeric}${numericCfg.unit ? ` ${numericCfg.unit}` : ""}`
        : "Not answered";
    const reference =
      block.correct_answer ||
      (numericCfg.correct_min != null || numericCfg.correct_max != null
        ? `${numericCfg.correct_min ?? "…"}–${numericCfg.correct_max ?? "…"}`
        : null);

    return (
      <QuestionShell
        block={block}
        fieldId={fieldId}
        error={error}
        showGuidance={showGuidance}
      >
        {editable || previewControls ? (
          <div className="flex items-center gap-2">
            <Input
              id={fieldId}
              type="number"
              inputMode={numericCfg.allow_decimals ? "decimal" : "numeric"}
              value={numeric ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  onValueChange(qid, { type: "numeric", numeric: null });
                  return;
                }
                const next = Number(raw);
                if (!Number.isFinite(next)) return;
                if (!numericCfg.allow_decimals && !Number.isInteger(next)) return;
                onValueChange(qid, { type: "numeric", numeric: next });
              }}
              disabled={!editable}
              className="w-40 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 disabled:opacity-100"
              min={block.min_value ?? undefined}
              max={block.max_value ?? undefined}
              step={step}
              placeholder="0"
              aria-required={block.required}
              aria-invalid={!!error}
            />
            {numericCfg.unit ? (
              <span className="text-sm text-slate-600">{numericCfg.unit}</span>
            ) : null}
          </div>
        ) : (
          <p className="text-[1.02rem] leading-7 text-slate-700">{display}</p>
        )}
        {mode === "teacher_marking" ? (
          <MarkingAnswerMeta
            selected={display}
            reference={reference ?? "—"}
            automatic={block.marking_mode === "automatic"}
          />
        ) : null}
      </QuestionShell>
    );
  }

  if (block.block_type === "multiple_choice") {
    const labelStyle = getBlockOptionLabelStyle(block);
    const options = maybeShuffleOptions(
      studentVisibleMcqOptions(block),
      mode,
      block,
      qid,
    );
    const selectedIds =
      (current as { type: "mcq"; optionIds: string[] } | undefined)?.optionIds ??
      [];
    const selectedId = selectedIds[0] ?? "";
    const correctLabels = options
      .filter((o) => o.correct)
      .map((o) => getMcqOptionText(o));
    const selectedLabels = labelsForOptionIds(block, selectedIds);

    return (
      <QuestionShell
        block={block}
        fieldId={fieldId}
        error={error}
        showGuidance={showGuidance}
      >
        <div className="space-y-2" role="radiogroup" aria-labelledby={fieldId}>
          {options.map((option, index) => (
            <label
              key={option.id}
              className="flex items-start gap-3 text-[1.02rem] leading-7 text-slate-800"
            >
              <input
                type="radio"
                name={`mcq-${qid}`}
                value={option.id}
                className="mt-1.5"
                checked={selectedId === option.id}
                onChange={() =>
                  onValueChange(qid, { type: "mcq", optionIds: [option.id] })
                }
                disabled={!editable}
              />
              <span className="min-w-[1.25rem] font-semibold tabular-nums text-slate-700">
                {formatMcqOptionIdentifier(index, labelStyle)}
              </span>
              <span className="min-w-0 flex-1 whitespace-pre-wrap">
                {getMcqOptionText(option)}
              </span>
            </label>
          ))}
        </div>
        {mode === "teacher_marking" ? (
          <MarkingAnswerMeta
            selected={selectedLabels[0] || "Not answered"}
            reference={correctLabels[0] ?? block.correct_answer ?? "—"}
            automatic={block.marking_mode === "automatic"}
          />
        ) : null}
      </QuestionShell>
    );
  }

  if (block.block_type === "multiple_select") {
    const labelStyle = getBlockOptionLabelStyle(block);
    const options = maybeShuffleOptions(
      studentVisibleMcqOptions(block),
      mode,
      block,
      qid,
    );
    const selectedIds = new Set(
      (current as { type: "mcq"; optionIds: string[] } | undefined)?.optionIds ??
        [],
    );
    const correctLabels = options
      .filter((o) => o.correct)
      .map((o) => getMcqOptionText(o));
    const selectedLabels = labelsForOptionIds(block, Array.from(selectedIds));

    return (
      <QuestionShell
        block={block}
        fieldId={fieldId}
        error={error}
        showGuidance={showGuidance}
      >
        <div className="space-y-2" role="group" aria-labelledby={fieldId}>
          {options.map((option, index) => (
            <label
              key={option.id}
              className="flex items-start gap-3 text-[1.02rem] leading-7 text-slate-800"
            >
              <input
                type="checkbox"
                className="mt-1.5"
                checked={selectedIds.has(option.id)}
                onChange={(e) => {
                  if (e.target.checked) selectedIds.add(option.id);
                  else selectedIds.delete(option.id);
                  onValueChange(qid, {
                    type: "mcq",
                    optionIds: Array.from(selectedIds),
                  });
                }}
                disabled={!editable}
              />
              <span className="min-w-[1.25rem] font-semibold tabular-nums text-slate-700">
                {formatMcqOptionIdentifier(index, labelStyle)}
              </span>
              <span className="min-w-0 flex-1 whitespace-pre-wrap">
                {getMcqOptionText(option)}
              </span>
            </label>
          ))}
        </div>
        {mode === "teacher_marking" ? (
          <MarkingAnswerMeta
            selected={selectedLabels.join(", ") || "Not answered"}
            reference={correctLabels.join(", ") || block.correct_answer || "—"}
            automatic={block.marking_mode === "automatic"}
          />
        ) : null}
      </QuestionShell>
    );
  }

  if (block.block_type === "tick_box") {
    const checked =
      (current as { type: "bool"; bool: boolean } | undefined)?.bool ?? false;
    return (
      <div className="space-y-1">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) =>
              onValueChange(qid, { type: "bool", bool: e.target.checked })
            }
            disabled={!editable}
            aria-invalid={!!error}
          />
          <span className="font-medium text-slate-800">
            {block.prompt || block.content}
            {block.required && <span className="ml-1 text-rose-500">*</span>}
          </span>
        </label>
        {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        {showGuidance ? <TeacherGuidancePanel block={block} /> : null}
      </div>
    );
  }

  if (block.block_type === "file_upload") {
    const fileName =
      (current as { type: "text"; text: string } | undefined)?.text ?? "";
    return (
      <QuestionShell
        block={block}
        fieldId={fieldId}
        error={error}
        showGuidance={showGuidance}
      >
        {editable ? (
          <div className="space-y-2">
            <Input
              id={fieldId}
              type="file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                onValueChange(qid, {
                  type: "text",
                  text: file ? file.name : "",
                });
              }}
              aria-required={block.required}
            />
            <p className="text-xs text-slate-400">
              File name is saved with your progress. Full upload storage follows
              assignment resources.
            </p>
            {fileName ? (
              <p className="text-xs text-slate-600">Selected: {fileName}</p>
            ) : null}
          </div>
        ) : previewControls ? (
          <div className="space-y-2">
            <Input id={fieldId} type="file" disabled />
            <p className="text-xs text-slate-400">File upload (preview)</p>
          </div>
        ) : (
          <p className="bg-slate-50 p-3 text-sm text-slate-700">
            {fileName || "No file"}
          </p>
        )}
      </QuestionShell>
    );
  }

  if (block.block_type === "table" || block.block_type === "vocabulary_table") {
    return (
      <div className="space-y-1">
        <TableView
          block={block}
          current={
            current as
              | {
                  type: "table";
                  cells: Array<{
                    row_index: number;
                    col_index: number;
                    text: string;
                  }>;
                }
              | undefined
          }
          onChange={(v) => onValueChange(qid, v)}
          editable={editable}
          previewControls={previewControls}
          plainDisplay={plainDisplay}
        />
        {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        {showGuidance ? <TeacherGuidancePanel block={block} /> : null}
      </div>
    );
  }

  return null;
}

function QuestionShell({
  block,
  fieldId,
  error,
  showGuidance,
  children,
}: {
  block: BuilderBlock;
  fieldId: string;
  error?: string;
  showGuidance: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label
          htmlFor={fieldId}
          id={fieldId}
          className="block font-[family-name:var(--font-outfit)] text-[1.08rem] font-semibold leading-snug tracking-tight text-slate-900"
        >
          {block.content || block.prompt}
          {block.required && <span className="ml-1 text-rose-500">*</span>}
          {block.max_marks != null && (
            <span className="ml-2 align-middle text-xs font-normal tracking-normal text-slate-400">
              {formatMarkLabelBracketed(block.max_marks)}
            </span>
          )}
        </label>
        {block.content && block.prompt ? (
          <p className="whitespace-pre-wrap text-[0.95rem] leading-7 text-slate-600">
            {block.prompt}
          </p>
        ) : null}
      </div>
      <div className="answer-area space-y-2 border border-slate-200 bg-white px-3 py-3">
        {children}
      </div>
      {error ? (
        <p className="text-xs text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
      {showGuidance ? <TeacherGuidancePanel block={block} /> : null}
    </div>
  );
}

function TeacherGuidancePanel({ block }: { block: BuilderBlock }) {
  const note = block.teacher_note?.trim();
  const scheme = block.mark_scheme_note?.trim();
  if (!note && !scheme) return null;

  return (
    <details className="rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-amber-900">
        Teacher guidance
      </summary>
      <div className="mt-2 space-y-2 text-xs text-amber-950">
        {scheme ? (
          <div>
            <p className="font-medium">Mark-scheme note</p>
            <p className="whitespace-pre-wrap">{scheme}</p>
          </div>
        ) : null}
        {note ? (
          <div>
            <p className="font-medium">Teacher-only notes</p>
            <p className="whitespace-pre-wrap">{note}</p>
          </div>
        ) : null}
      </div>
    </details>
  );
}

function MarkingAnswerMeta({
  selected,
  reference,
  automatic,
}: {
  selected: string;
  reference: string;
  automatic: boolean;
}) {
  return (
    <div className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-600">
      <p>
        <span className="font-medium text-slate-700">Selected:</span> {selected}
      </p>
      <p>
        <span className="font-medium text-slate-700">Reference:</span> {reference}
      </p>
      <p>
        <span className="font-medium text-slate-700">Marking:</span>{" "}
        {automatic ? "Automatic (teacher override available)" : "Teacher reviewed"}
      </p>
    </div>
  );
}

function ImageBlock({
  block,
  mode,
}: {
  block: BuilderBlock;
  mode: WorksheetMode;
}) {
  const media = normalizeMediaConfig(getMediaConfig(block), {
    external_url: block.external_url,
    title: block.content,
    description: block.prompt ?? null,
  });
  const storagePath = media.storage_path?.trim() || null;
  const external =
    (media.external_url || "").trim() ||
    (block.content.startsWith("http") ? block.content.trim() : "");
  const sizeClass = displaySizeClass(media.display_size);
  const alignClass = alignmentClass(media.alignment);
  const alt = media.alt_text || block.prompt || block.content || "Homework image";

  if (!storagePath && !external) {
    if (mode === "teacher_preview") {
      return (
        <div className="border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          No image uploaded yet
        </div>
      );
    }
    return null;
  }

  return (
    <figure className={`space-y-1 ${alignClass} ${sizeClass}`}>
      {storagePath ? (
        <SignedImage
          path={storagePath}
          alt={alt}
          className="w-full object-contain"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={external} alt={alt} className="w-full object-contain" />
      )}
      {media.caption ? (
        <figcaption className="text-sm text-slate-500">{media.caption}</figcaption>
      ) : null}
    </figure>
  );
}

function VideoBlock({
  block,
  mode,
}: {
  block: BuilderBlock;
  mode: WorksheetMode;
}) {
  const media = normalizeMediaConfig(getMediaConfig(block), {
    external_url: block.external_url,
    transcript: block.captions_text,
    title: block.content,
    description: block.prompt ?? null,
    allow_download: block.allow_download,
  });
  const url = (media.external_url || block.external_url || "").trim();
  const storagePath = media.storage_path?.trim() || null;
  const transcript = media.transcript || block.captions_text || "";
  const title = media.title || block.prompt || block.content || "Video";
  const parsed = parseVideoUrl(url);

  if (!storagePath && !url) {
    if (mode === "teacher_preview") {
      return (
        <div className="border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          No video configured yet
        </div>
      );
    }
    return null;
  }

  return (
    <div className="space-y-2">
      {title && title !== url ? (
        <p className="font-[family-name:var(--font-outfit)] text-sm font-semibold text-slate-800">
          {title}
        </p>
      ) : null}
      {media.description ? (
        <p className="text-sm text-slate-600">{media.description}</p>
      ) : null}

      {storagePath ? (
        <div className="aspect-video overflow-hidden border border-slate-200 bg-black">
          <SignedVideo
            path={storagePath}
            className="h-full w-full"
            captions={transcript || null}
          />
        </div>
      ) : isEmbeddableVideo(parsed) ? (
        <div className="aspect-video overflow-hidden border border-slate-200 bg-black">
          {parsed.kind === "direct" ? (
            <video
              controls
              className="h-full w-full"
              src={parsed.embedUrl}
              playsInline
            >
              {transcript ? (
                <track kind="captions" srcLang="en" label="Captions" />
              ) : null}
            </video>
          ) : (
            <iframe
              title={title}
              src={parsed.embedUrl}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )}
        </div>
      ) : mode === "teacher_preview" ? (
        <div className="border border-dashed border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {parsed.reason}
        </div>
      ) : (
        <p className="text-sm text-slate-500">Video unavailable.</p>
      )}

      {transcript ? (
        <details className="text-xs text-slate-600">
          <summary>Transcript / captions</summary>
          <p className="mt-2 whitespace-pre-wrap">{transcript}</p>
        </details>
      ) : null}
    </div>
  );
}

function ResourceBlock({ block }: { block: BuilderBlock }) {
  const media = normalizeMediaConfig(getMediaConfig(block), {
    external_url: block.external_url,
    title: block.content,
    description: block.prompt ?? null,
    allow_download: block.allow_download,
  });
  const storagePath = media.storage_path?.trim() || null;
  const external =
    (media.external_url || "").trim() ||
    (block.content.startsWith("http") ? block.content.trim() : "");
  const title =
    media.title?.trim() ||
    media.file_name?.trim() ||
    (block.content && !block.content.startsWith("http")
      ? block.content.trim()
      : "") ||
    "Downloadable resource";
  const description = media.description || block.prompt || "";
  const allowDownload = media.allow_download !== false;
  const typeLabel = resourceTypeLabel(media.mime_type, media.file_name);

  if (!storagePath && !external) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border border-slate-200 bg-white px-4 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center border border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600"
          aria-hidden
        >
          {typeLabel.slice(0, 4)}
        </div>
        <div className="min-w-0 space-y-1">
          <p className="font-[family-name:var(--font-outfit)] font-semibold text-slate-900">
            {title}
          </p>
          {description ? (
            <p className="text-sm text-slate-600">{description}</p>
          ) : null}
          <p className="text-xs text-slate-400">
            {[
              typeLabel,
              media.file_size != null ? formatFileSize(media.file_size) : null,
              media.file_name && media.file_name !== title ? media.file_name : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>
      <div className="shrink-0">
        {storagePath && allowDownload ? (
          <DownloadButton
            bucket="assignment-resources"
            path={storagePath}
            label="Download"
          />
        ) : external ? (
          <a
            href={external}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-brand-700 underline"
          >
            Open / preview
          </a>
        ) : (
          <span className="text-xs text-slate-400">Preview only</span>
        )}
      </div>
    </div>
  );
}

function resourceTypeLabel(
  mime?: string | null,
  fileName?: string | null,
): string {
  const fromName = (fileName ?? "").split(".").pop()?.toUpperCase();
  if (fromName && fromName.length <= 5) return fromName;
  if (!mime) return "FILE";
  if (mime.includes("pdf")) return "PDF";
  if (mime.includes("word") || mime.includes("document")) return "DOCX";
  if (mime.includes("sheet") || mime.includes("excel")) return "XLSX";
  if (mime.includes("presentation") || mime.includes("powerpoint")) return "PPTX";
  if (mime.startsWith("image/")) return "IMG";
  if (mime.startsWith("audio/")) return "MP3";
  if (mime.startsWith("video/")) return "MP4";
  if (mime.includes("csv")) return "CSV";
  if (mime.includes("text")) return "TXT";
  return "FILE";
}

function TableView({
  block,
  current,
  onChange,
  editable,
  previewControls,
  plainDisplay,
}: {
  block: BuilderBlock;
  current:
    | {
        type: "table";
        cells: Array<{ row_index: number; col_index: number; text: string }>;
      }
    | undefined;
  onChange: (v: {
    type: "table";
    cells: Array<{ row_index: number; col_index: number; text: string }>;
  }) => void;
  editable: boolean;
  previewControls: boolean;
  plainDisplay: boolean;
}) {
  const cfg = block.tableConfig;
  if (!cfg) return null;

  const cells = block.cells ?? [];
  const startRow = cfg.header_row ? 1 : 0;
  const interactive = editable || previewControls;

  function getCellValue(ri: number, ci: number): string {
    return (
      current?.cells?.find((c) => c.row_index === ri && c.col_index === ci)
        ?.text ?? ""
    );
  }

  function setCellValue(ri: number, ci: number, text: string) {
    if (!editable) return;
    const prev = current?.cells ?? [];
    const next = prev.filter(
      (c) => !(c.row_index === ri && c.col_index === ci),
    );
    next.push({ row_index: ri, col_index: ci, text });
    onChange({ type: "table", cells: next });
  }

  return (
    <div className="space-y-3">
      {(block.prompt || block.content) && (
        <p className="font-[family-name:var(--font-outfit)] text-[1.08rem] font-semibold tracking-tight text-slate-900">
          {block.prompt || block.content}
        </p>
      )}
      <div className="overflow-x-auto border border-slate-200">
        <table className="min-w-full border-collapse text-[0.98rem]">
          {cfg.header_row && (
            <thead>
              <tr className="bg-slate-50">
                {Array.from({ length: cfg.cols }, (_, ci) => (
                  <th
                    key={ci}
                    scope="col"
                    className="border-b border-slate-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    {(cfg.col_labels ?? [])[ci] ?? `Column ${ci + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {Array.from({ length: Math.max(0, cfg.rows - startRow) }, (_, rowOffset) => {
              const ri = rowOffset + startRow;
              return (
                <tr key={ri} className="border-t border-slate-100">
                  {Array.from({ length: cfg.cols }, (_, ci) => {
                    const cellDef = cells.find(
                      (c) => c.row_index === ri && c.col_index === ci,
                    );
                    const isReadOnly =
                      cellDef?.cell_type === "readonly" || cellDef?.read_only;
                    const isTick = cellDef?.cell_type === "tick";
                    const isTeacherReview =
                      cellDef?.cell_type === "teacher_review";
                    const label = `${(cfg.col_labels ?? [])[ci] ?? `Column ${ci + 1}`}, row ${ri + 1}`;

                    if (isTeacherReview) {
                      return (
                        <td key={ci} className="px-4 py-3">
                          <span className="sr-only">Teacher review cell</span>
                          <span className="text-xs text-slate-300">—</span>
                        </td>
                      );
                    }

                    if (isReadOnly) {
                      return (
                        <td
                          key={ci}
                          className="bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600"
                        >
                          {cellDef?.label ?? ""}
                        </td>
                      );
                    }

                    if (isTick) {
                      return (
                        <td key={ci} className="px-4 py-3">
                          <input
                            type="checkbox"
                            aria-label={label}
                            checked={getCellValue(ri, ci) === "true"}
                            onChange={(e) =>
                              setCellValue(
                                ri,
                                ci,
                                e.target.checked ? "true" : "false",
                              )
                            }
                            disabled={!editable}
                          />
                        </td>
                      );
                    }

                    const value = getCellValue(ri, ci);

                    return (
                      <td key={ci} className="px-3 py-2">
                        {interactive && !plainDisplay ? (
                          cellDef?.cell_type === "student_numeric" ? (
                            <Input
                              type="number"
                              aria-label={label}
                              value={value}
                              onChange={(e) =>
                                setCellValue(ri, ci, e.target.value)
                              }
                              disabled={!editable}
                              className="h-8 text-xs disabled:opacity-100"
                              placeholder="—"
                            />
                          ) : (
                            <input
                              type="text"
                              aria-label={label}
                              value={value}
                              onChange={(e) =>
                                setCellValue(ri, ci, e.target.value)
                              }
                              disabled={!editable}
                              className="h-8 w-full border border-slate-200 px-2 text-xs outline-none focus:border-brand-400 disabled:bg-white disabled:opacity-100"
                              placeholder="—"
                            />
                          )
                        ) : (
                          <span className="text-sm text-slate-700">
                            {value.trim() ? value : "Not answered"}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function displaySizeClass(size?: MediaDisplaySize | null): string {
  switch (size) {
    case "small":
      return "max-w-xs";
    case "medium":
      return "max-w-md";
    case "full":
      return "w-full";
    case "large":
    default:
      return "max-w-2xl";
  }
}

function alignmentClass(alignment?: MediaAlignment | null): string {
  switch (alignment) {
    case "left":
      return "mr-auto";
    case "right":
      return "ml-auto";
    case "center":
    default:
      return "mx-auto";
  }
}

function numericStep(
  allowDecimals: boolean,
  decimalPlaces: number | null,
): number | "any" {
  if (!allowDecimals) return 1;
  if (decimalPlaces == null) return "any";
  return Math.pow(10, -decimalPlaces);
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic per-question option order (stable across renders). */
function maybeShuffleOptions(
  options: McqOption[],
  mode: WorksheetMode,
  block: BuilderBlock,
  questionId: string,
): McqOption[] {
  const studentFacing =
    mode === "student_editable" || mode === "student_readonly";
  if (!studentFacing || !block.shuffle_options) {
    return options;
  }
  return [...options].sort((a, b) => {
    const ha = hashSeed(`${questionId}:${a.id}:${getMcqOptionText(a)}`);
    const hb = hashSeed(`${questionId}:${b.id}:${getMcqOptionText(b)}`);
    return ha - hb || a.id.localeCompare(b.id);
  });
}
