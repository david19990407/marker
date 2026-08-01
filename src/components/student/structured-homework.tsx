"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PassageView } from "@/components/shared/passage-view";
import {
  saveStudentStructuredResponsesAction,
  submitStructuredHomeworkAction,
  type StructuredResponseInput,
} from "@/lib/actions/homework-builder";
import { useVersionedAutosave } from "@/hooks/use-versioned-autosave";
import { computePassageStartLines } from "@/lib/homework/passage-numbering";
import {
  flattenStudentBlocks,
  isResponseType,
  resolveMcqOptions,
  responseKey,
} from "@/lib/homework/structure";
import type { BuilderSection, BuilderBlock, StudentResponse } from "@/lib/types";

export type ResponseWithCells = StudentResponse & {
  cells?: Array<{
    row_index: number;
    col_index: number;
    text_value: string | null;
    numeric_value: number | null;
    boolean_value: boolean | null;
  }>;
};

interface Props {
  assignmentId: string;
  sections: BuilderSection[];
  existingResponses: Record<string, ResponseWithCells>;
  editable: boolean;
  /** When true, show review summary UI before final submit */
  reviewMode?: boolean;
}

type TextValue = { type: "text"; text: string };
type NumericValue = { type: "numeric"; numeric: number | null };
type BoolValue = { type: "bool"; bool: boolean };
type TableCellValues = {
  type: "table";
  cells: Array<{ row_index: number; col_index: number; text: string }>;
};
type ResponseValue = TextValue | NumericValue | BoolValue | TableCellValues;

export function StructuredHomework({
  assignmentId,
  sections,
  existingResponses,
  editable,
  reviewMode = false,
}: Props) {
  const [values, setValues] = useState<Record<string, ResponseValue>>(() =>
    buildInitialValues(sections, existingResponses),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const sectionsRef = useRef(sections);
  const valuesRef = useRef(values);
  const passageStarts = computePassageStartLines(sections, { studentFacing: true });
  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);
  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  const autosave = useVersionedAutosave<Record<string, ResponseValue>>({
    delayMs: 1200,
    enabled: editable,
    save: async (current) => {
      const responses = collectResponses(current, sectionsRef.current);
      const result = await saveStudentStructuredResponsesAction(
        assignmentId,
        responses,
      );
      // Never overwrite local `values` from the server — local-first.
      return result.error
        ? { ok: false, error: result.error }
        : { ok: true };
    },
  });

  function setValue(questionId: string, value: ResponseValue) {
    if (!editable) return;
    setValues((prev) => {
      const next = { ...prev, [questionId]: value };
      autosave.markDirty(next);
      return next;
    });
    setErrors((prev) => {
      if (!prev[questionId]) return prev;
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  }

  function handleSave() {
    startTransition(async () => {
      const ok = await autosave.flush();
      setFlash(
        ok
          ? { type: "success", msg: "Progress saved" }
          : { type: "error", msg: autosave.lastError ?? "Save failed" },
      );
      setTimeout(() => setFlash(null), 3000);
    });
  }

  function validate(): boolean {
    const nextErrors: Record<string, string> = {};
    const blocks = flattenStudentBlocks(sections).filter(
      (b) => isResponseType(b.block_type) && !b.review_only,
    );

    for (const block of blocks) {
      const qid = responseKey(block);
      if (!block.question_id) continue;
      const value = values[qid];

      if (block.required) {
        if (!value) {
          nextErrors[qid] = "This question is required";
          continue;
        }
        if (value.type === "text" && !value.text.trim()) {
          nextErrors[qid] = "This question is required";
        } else if (value.type === "numeric" && value.numeric == null) {
          nextErrors[qid] = "Enter a number";
        } else if (value.type === "bool" && !value.bool) {
          nextErrors[qid] = "Please tick this box";
        } else if (value.type === "table") {
          const hasAny = value.cells.some((c) => c.text.trim());
          if (!hasAny) nextErrors[qid] = "Complete at least one cell";
        }
      }

      if (value?.type === "numeric" && value.numeric != null) {
        if (block.min_value != null && value.numeric < block.min_value) {
          nextErrors[qid] = `Minimum value is ${block.min_value}`;
        }
        if (block.max_value != null && value.numeric > block.max_value) {
          nextErrors[qid] = `Maximum value is ${block.max_value}`;
        }
      }

      if (value?.type === "text" && block.word_limit != null) {
        const words = value.text.trim() ? value.text.trim().split(/\s+/).length : 0;
        if (words > block.word_limit) {
          nextErrors[qid] = `Word limit is ${block.word_limit}`;
        }
      }
      if (value?.type === "text" && block.char_limit != null) {
        if (value.text.length > block.char_limit) {
          nextErrors[qid] = `Character limit is ${block.char_limit}`;
        }
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function handleSubmit() {
    if (!validate()) {
      setFlash({ type: "error", msg: "Please complete required fields before submitting" });
      return;
    }
    startTransition(async () => {
      const responses = collectResponses(valuesRef.current, sectionsRef.current);
      const result = await submitStructuredHomeworkAction(assignmentId, responses);
      if (result.error) {
        setFlash({ type: "error", msg: result.error });
        return;
      }
      window.location.href = `/student/homework/${assignmentId}`;
    });
  }

  return (
    <div className="homework-worksheet mx-auto max-w-3xl space-y-8 px-1 sm:px-2">
      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            tone={
              autosave.status === "dirty" || autosave.status === "error"
                ? "warning"
                : "neutral"
            }
          >
            {autosave.label}
          </Badge>
          {!reviewMode && (
            <Link href={`/student/homework/${assignmentId}/review`}>
              <Button variant="outline" size="sm">
                Review before submit
              </Button>
            </Link>
          )}
        </div>
      )}

      {flash && (
        <div
          className={`border px-4 py-3 text-sm ${
            flash.type === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
          role="status"
        >
          {flash.msg}
        </div>
      )}

      {reviewMode && (
        <div className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Review your answers below. Submit only when every required question is complete.
        </div>
      )}

      <div className="space-y-10 border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#fafafa_100%)] px-4 py-8 shadow-sm sm:px-8 sm:py-10">
        {sections.map((section) => (
          <SectionView
            key={section._id}
            section={section}
            values={values}
            errors={errors}
            onValueChange={setValue}
            editable={editable}
            reviewMode={reviewMode}
            passageStarts={passageStarts}
          />
        ))}
      </div>

      {editable && (
        <div className="flex flex-wrap gap-3">
          <Button onClick={handleSave} disabled={pending} variant="secondary">
            {pending || autosave.status === "saving" ? "Saving…" : "Save progress"}
          </Button>
          {reviewMode ? (
            <Button onClick={handleSubmit} disabled={pending}>
              {pending ? "Submitting…" : "Submit homework"}
            </Button>
          ) : (
            <Link href={`/student/homework/${assignmentId}/review`}>
              <Button>Review & submit</Button>
            </Link>
          )}
        </div>
      )}

      {!editable && (
        <p className="text-sm text-slate-500">
          This homework is read-only after submission
          {!reviewMode ? (
            <>
              .{" "}
              <Link
                href={`/student/homework/${assignmentId}/review`}
                className="text-brand-700 underline"
              >
                View review
              </Link>
            </>
          ) : null}
          .
        </p>
      )}
    </div>
  );
}

function SectionView({
  section,
  values,
  errors,
  onValueChange,
  editable,
  reviewMode,
  passageStarts,
}: {
  section: BuilderSection;
  values: Record<string, ResponseValue>;
  errors: Record<string, string>;
  onValueChange: (qid: string, v: ResponseValue) => void;
  editable: boolean;
  reviewMode: boolean;
  passageStarts: Map<string, number>;
}) {
  return (
    <section className="space-y-7" aria-labelledby={`section-${section._id}`}>
      <h3
        id={`section-${section._id}`}
        className="font-[family-name:var(--font-outfit)] text-xl font-semibold tracking-tight text-slate-900"
      >
        {section.title}
      </h3>
      {section.blocks
        .filter((b) => !b.teacher_only && b.block_type !== "mark_scheme")
        .map((block) => (
          <BlockView
            key={block._id}
            block={block}
            values={values}
            error={errors[responseKey(block)]}
            onValueChange={onValueChange}
            editable={editable}
            reviewMode={reviewMode}
            startLineNumber={passageStarts.get(block._id)}
          />
        ))}
      {section.subsections.map((sub) => (
        <div
          key={sub._id}
          className="space-y-7 border-l border-slate-200 pl-5"
          aria-labelledby={`subsection-${sub._id}`}
        >
          <h4
            id={`subsection-${sub._id}`}
            className="font-[family-name:var(--font-outfit)] text-lg font-semibold tracking-tight text-slate-800"
          >
            {sub.title}
          </h4>
          {sub.blocks
            .filter((b) => !b.teacher_only && b.block_type !== "mark_scheme")
            .map((block) => (
              <BlockView
                key={block._id}
                block={block}
                values={values}
                error={errors[responseKey(block)]}
                onValueChange={onValueChange}
                editable={editable}
                reviewMode={reviewMode}
                startLineNumber={passageStarts.get(block._id)}
              />
            ))}
        </div>
      ))}
    </section>
  );
}

function BlockView({
  block,
  values,
  error,
  onValueChange,
  editable,
  reviewMode,
  startLineNumber,
}: {
  block: BuilderBlock;
  values: Record<string, ResponseValue>;
  error?: string;
  onValueChange: (qid: string, v: ResponseValue) => void;
  editable: boolean;
  reviewMode: boolean;
  startLineNumber?: number;
}) {
  const qid = responseKey(block);
  const current = values[qid];
  const fieldId = `q-${qid}`;

  // Never show teacher notes / mark scheme to students
  void block.teacher_note;
  void block.mark_scheme_note;

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
    case "passage":
      return (
        <PassageView
          text={block.content}
          config={block.passageConfig}
          startLineNumber={startLineNumber}
        />
      );
    case "embedded_video": {
      const url = block.external_url || block.content;
      if (!url) return null;
      const yt = url.match(
        /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/,
      );
      return (
        <div className="space-y-2">
          {(block.prompt || block.content) && !url.startsWith("http") ? (
            <p className="text-sm font-medium text-slate-800">{block.prompt || block.content}</p>
          ) : null}
          <div className="aspect-video overflow-hidden rounded-2xl border border-slate-200 bg-black">
            {yt ? (
              <iframe
                title={block.content || "Video"}
                src={`https://www.youtube-nocookie.com/embed/${yt[1]}`}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <video
                controls
                className="h-full w-full"
                src={url}
                playsInline
              >
                {block.captions_text ? (
                  <track kind="captions" srcLang="en" label="Captions" />
                ) : null}
              </video>
            )}
          </div>
          {block.captions_text ? (
            <details className="text-xs text-slate-600">
              <summary>Transcript / captions</summary>
              <p className="mt-2 whitespace-pre-wrap">{block.captions_text}</p>
            </details>
          ) : null}
        </div>
      );
    }
    case "page_break":
      return (
        <div className="flex items-center gap-2" aria-hidden>
          <div className="h-px flex-1 border-t border-dashed border-slate-300" />
        </div>
      );
    case "image":
      return (
        <figure className="space-y-1">
          {block.content.startsWith("http") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={block.content}
              alt={block.prompt || "Homework image"}
              className="max-h-80 w-full rounded-2xl object-contain"
            />
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              {block.content || "Image"}
            </div>
          )}
        </figure>
      );
    case "downloadable_resource":
      return (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
          {block.content.startsWith("http") ? (
            <a
              href={block.content}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-brand-700 underline"
            >
              Download resource
            </a>
          ) : (
            <span className="text-slate-700">{block.content || "Resource"}</span>
          )}
        </div>
      );

    case "teacher_review":
      if (block.review_only !== false) {
        return (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {block.content || block.prompt || "Teacher review item"}
            <p className="mt-1 text-xs text-slate-400">Your teacher will review this.</p>
          </div>
        );
      }
      break;

    default:
      break;
  }

  if (block.review_only) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        {block.content || block.prompt || "Review item"}
      </div>
    );
  }

  if (
    block.block_type === "numbered_question" ||
    block.block_type === "extended_writing"
  ) {
    const text = (current as TextValue)?.text ?? "";
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;

    return (
      <QuestionShell
        block={block}
        fieldId={fieldId}
        error={error}
        reviewMode={reviewMode}
      >
        {editable ? (
          <>
            <Textarea
              id={fieldId}
              value={text}
              onChange={(e) => onValueChange(qid, { type: "text", text: e.target.value })}
              className="min-h-32 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
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
            {text || "—"}
          </p>
        )}
      </QuestionShell>
    );
  }

  if (block.block_type === "short_text") {
    return (
      <QuestionShell block={block} fieldId={fieldId} error={error} reviewMode={reviewMode}>
        {editable ? (
          <Input
            id={fieldId}
            value={(current as TextValue)?.text ?? ""}
            onChange={(e) => onValueChange(qid, { type: "text", text: e.target.value })}
            placeholder="Short answer…"
            className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            maxLength={block.char_limit ?? undefined}
            aria-required={block.required}
            aria-invalid={!!error}
          />
        ) : (
          <p className="text-[1.02rem] leading-7 text-slate-700">
            {(current as TextValue)?.text || "—"}
          </p>
        )}
      </QuestionShell>
    );
  }

  if (block.block_type === "numeric") {
    return (
      <QuestionShell block={block} fieldId={fieldId} error={error} reviewMode={reviewMode}>
        {editable ? (
          <Input
            id={fieldId}
            type="number"
            value={(current as NumericValue)?.numeric ?? ""}
            onChange={(e) =>
              onValueChange(qid, {
                type: "numeric",
                numeric: e.target.value !== "" ? Number(e.target.value) : null,
              })
            }
            className="w-40 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            min={block.min_value ?? undefined}
            max={block.max_value ?? undefined}
            placeholder="0"
            aria-required={block.required}
            aria-invalid={!!error}
          />
        ) : (
          <p className="text-[1.02rem] leading-7 text-slate-700">
            {(current as NumericValue)?.numeric ?? "—"}
          </p>
        )}
      </QuestionShell>
    );
  }

  if (block.block_type === "multiple_choice") {
    const options = resolveMcqOptions(block);
    return (
      <QuestionShell block={block} fieldId={fieldId} error={error} reviewMode={reviewMode}>
        <div className="space-y-2" role="radiogroup" aria-labelledby={fieldId}>
          {options.map((option) => (
            <label
              key={option.id}
              className="flex items-start gap-3 text-[1.02rem] leading-7 text-slate-800"
            >
              <input
                type="radio"
                name={`mcq-${qid}`}
                value={option.label}
                className="mt-1.5"
                checked={(current as TextValue)?.text === option.label}
                onChange={() => onValueChange(qid, { type: "text", text: option.label })}
                disabled={!editable}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </QuestionShell>
    );
  }

  if (block.block_type === "multiple_select") {
    const options = resolveMcqOptions(block);
    const selected = new Set(
      ((current as TextValue)?.text ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    return (
      <QuestionShell block={block} fieldId={fieldId} error={error} reviewMode={reviewMode}>
        <div className="space-y-2" role="group" aria-labelledby={fieldId}>
          {options.map((option) => (
            <label
              key={option.id}
              className="flex items-start gap-3 text-[1.02rem] leading-7 text-slate-800"
            >
              <input
                type="checkbox"
                className="mt-1.5"
                checked={selected.has(option.label)}
                onChange={(e) => {
                  if (e.target.checked) selected.add(option.label);
                  else selected.delete(option.label);
                  onValueChange(qid, {
                    type: "text",
                    text: Array.from(selected).join("\n"),
                  });
                }}
                disabled={!editable}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </QuestionShell>
    );
  }

  if (block.block_type === "tick_box") {
    return (
      <div className="space-y-1">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={(current as BoolValue)?.bool ?? false}
            onChange={(e) => onValueChange(qid, { type: "bool", bool: e.target.checked })}
            disabled={!editable}
            aria-invalid={!!error}
          />
          <span className="font-medium text-slate-800">
            {block.prompt || block.content}
            {block.required && <span className="ml-1 text-rose-500">*</span>}
          </span>
        </label>
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </div>
    );
  }

  if (block.block_type === "file_upload") {
    return (
      <QuestionShell block={block} fieldId={fieldId} error={error} reviewMode={reviewMode}>
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
              File name is saved with your progress. Full upload storage follows assignment resources.
            </p>
            {(current as TextValue)?.text && (
              <p className="text-xs text-slate-600">Selected: {(current as TextValue).text}</p>
            )}
          </div>
        ) : (
          <p className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
            {(current as TextValue)?.text || "No file"}
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
          current={current as TableCellValues | undefined}
          onChange={(v) => onValueChange(qid, v)}
          editable={editable}
        />
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </div>
    );
  }

  return null;
}

function QuestionShell({
  block,
  fieldId,
  error,
  reviewMode,
  children,
}: {
  block: BuilderBlock;
  fieldId: string;
  error?: string;
  reviewMode: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`space-y-3 ${reviewMode ? "border border-slate-200 bg-white p-4" : ""}`}
    >
      <div className="space-y-1.5">
        <label
          htmlFor={fieldId}
          className="block font-[family-name:var(--font-outfit)] text-[1.08rem] font-semibold leading-snug tracking-tight text-slate-900"
        >
          {block.content || block.prompt}
          {block.required && <span className="ml-1 text-rose-500">*</span>}
          {block.max_marks != null && (
            <span className="ml-2 align-middle text-xs font-normal tracking-normal text-slate-400">
              [{block.max_marks} marks]
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
      {error && (
        <p className="text-xs text-rose-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function TableView({
  block,
  current,
  onChange,
  editable,
}: {
  block: BuilderBlock;
  current: TableCellValues | undefined;
  onChange: (v: TableCellValues) => void;
  editable: boolean;
}) {
  const cfg = block.tableConfig;
  if (!cfg) return null;

  const cells = block.cells ?? [];
  const startRow = cfg.header_row ? 1 : 0;

  function getCellValue(ri: number, ci: number): string {
    return current?.cells?.find((c) => c.row_index === ri && c.col_index === ci)?.text ?? "";
  }

  function setCellValue(ri: number, ci: number, text: string) {
    const prev = current?.cells ?? [];
    const next = prev.filter((c) => !(c.row_index === ri && c.col_index === ci));
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
            {Array.from({ length: cfg.rows - startRow }, (_, rowOffset) => {
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
                    const isTeacherReview = cellDef?.cell_type === "teacher_review";
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
                              setCellValue(ri, ci, e.target.checked ? "true" : "false")
                            }
                            disabled={!editable}
                          />
                        </td>
                      );
                    }

                    return (
                      <td key={ci} className="px-3 py-2">
                        {editable ? (
                          cellDef?.cell_type === "student_numeric" ? (
                            <Input
                              type="number"
                              aria-label={label}
                              value={getCellValue(ri, ci)}
                              onChange={(e) => setCellValue(ri, ci, e.target.value)}
                              className="h-8 text-xs"
                              placeholder="—"
                            />
                          ) : (
                            <input
                              type="text"
                              aria-label={label}
                              value={getCellValue(ri, ci)}
                              onChange={(e) => setCellValue(ri, ci, e.target.value)}
                              className="h-8 w-full rounded-xl border border-slate-200 px-2 text-xs outline-none focus:border-brand-400"
                              placeholder="—"
                            />
                          )
                        ) : (
                          <span className="text-sm text-slate-700">
                            {getCellValue(ri, ci) || "—"}
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

function buildInitialValues(
  sections: BuilderSection[],
  existing: Record<string, ResponseWithCells>,
): Record<string, ResponseValue> {
  const result: Record<string, ResponseValue> = {};

  function processSection(section: BuilderSection) {
    for (const block of section.blocks) {
      if (!isResponseType(block.block_type)) continue;
      const qid = responseKey(block);
      const resp = existing[qid] ?? (block.question_id ? existing[block.question_id] : undefined);
      if (!resp) continue;

      if (block.block_type === "numeric") {
        result[qid] = { type: "numeric", numeric: resp.numeric_value };
      } else if (block.block_type === "tick_box") {
        result[qid] = { type: "bool", bool: resp.boolean_value ?? false };
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
        result[qid] = { type: "text", text: resp.text_value ?? "" };
      }
    }
    for (const sub of section.subsections) processSection(sub);
  }

  for (const section of sections) processSection(section);
  return result;
}

function collectResponses(
  values: Record<string, ResponseValue>,
  sections: BuilderSection[],
): StructuredResponseInput[] {
  const blocks = flattenStudentBlocks(sections).filter(
    (b) => isResponseType(b.block_type) && b.question_id,
  );
  const out: StructuredResponseInput[] = [];

  for (const block of blocks) {
    const qid = block.question_id!;
    const value = values[responseKey(block)];
    if (!value) continue;

    if (value.type === "text") {
      out.push({ question_id: qid, text_value: value.text || null });
    } else if (value.type === "numeric") {
      out.push({ question_id: qid, numeric_value: value.numeric });
    } else if (value.type === "bool") {
      out.push({ question_id: qid, boolean_value: value.bool });
    } else {
      out.push({
        question_id: qid,
        cells: value.cells.map((c) => ({
          row_index: c.row_index,
          col_index: c.col_index,
          text_value: c.text || null,
        })),
      });
    }
  }

  return out;
}
