"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  saveStudentStructuredResponsesAction,
  type StructuredResponseInput,
} from "@/lib/actions/homework-builder";
import type { BuilderSection, BuilderBlock, StudentResponse } from "@/lib/types";

interface Props {
  assignmentId: string;
  sections: BuilderSection[];
  existingResponses: Record<string, StudentResponse>;
  editable: boolean;
}

export function StructuredHomework({
  assignmentId,
  sections,
  existingResponses,
  editable,
}: Props) {
  // keyed by question_id
  const [values, setValues] = useState<Record<string, ResponseValue>>(
    buildInitialValues(sections, existingResponses),
  );
  const [flash, setFlash] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function setValue(questionId: string, value: ResponseValue) {
    setValues((prev) => ({ ...prev, [questionId]: value }));
  }

  function handleSave() {
    startTransition(async () => {
      const responses = collectResponses(values);
      const result = await saveStudentStructuredResponsesAction(assignmentId, responses);
      setFlash(
        result.error
          ? { type: "error", msg: result.error }
          : { type: "success", msg: "Responses saved" },
      );
      setTimeout(() => setFlash(null), 4000);
    });
  }

  return (
    <div className="space-y-6">
      {flash && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            flash.type === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {flash.msg}
        </div>
      )}

      {sections.map((section) => (
        <SectionView
          key={section._id}
          section={section}
          values={values}
          onValueChange={setValue}
          editable={editable}
        />
      ))}

      {editable && (
        <Button onClick={handleSave} disabled={pending}>
          {pending ? "Saving…" : "Save answers"}
        </Button>
      )}
    </div>
  );
}

// ── Section render ────────────────────────────────────────────────────────────

function SectionView({
  section,
  values,
  onValueChange,
  editable,
}: {
  section: BuilderSection;
  values: Record<string, ResponseValue>;
  onValueChange: (qid: string, v: ResponseValue) => void;
  editable: boolean;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-slate-800">{section.title}</h3>
      {section.blocks
        .filter((b) => !b.teacher_only && b.block_type !== "mark_scheme")
        .map((block) => (
          <BlockView
            key={block._id}
            block={block}
            values={values}
            onValueChange={onValueChange}
            editable={editable}
          />
        ))}
      {section.subsections.map((sub) => (
        <div key={sub._id} className="ml-4 space-y-4 border-l-2 border-slate-100 pl-4">
          <h4 className="text-sm font-semibold text-slate-700">{sub.title}</h4>
          {sub.blocks
            .filter((b) => !b.teacher_only && b.block_type !== "mark_scheme")
            .map((block) => (
              <BlockView
                key={block._id}
                block={block}
                values={values}
                onValueChange={onValueChange}
                editable={editable}
              />
            ))}
        </div>
      ))}
    </div>
  );
}

// ── Block render ──────────────────────────────────────────────────────────────

function BlockView({
  block,
  values,
  onValueChange,
  editable,
}: {
  block: BuilderBlock;
  values: Record<string, ResponseValue>;
  onValueChange: (qid: string, v: ResponseValue) => void;
  editable: boolean;
}) {
  const qid = block._id;
  const current = values[qid];

  switch (block.block_type) {
    case "heading":
      return <h2 className="text-xl font-bold text-slate-900">{block.content}</h2>;
    case "subheading":
      return <h3 className="text-base font-semibold text-slate-800">{block.content}</h3>;
    case "instruction":
    case "rich_text":
      return (
        <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{block.content}</p>
      );
    case "page_break":
      return (
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 border-t border-dashed border-slate-300" />
        </div>
      );

    case "numbered_question":
    case "extended_writing":
      return (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-800">
            {block.prompt || block.content}
            {block.required && <span className="ml-1 text-rose-500">*</span>}
            {block.max_marks != null && (
              <span className="ml-2 text-xs font-normal text-slate-400">
                [{block.max_marks} marks]
              </span>
            )}
          </p>
          {editable ? (
            <Textarea
              value={(current as TextValue)?.text ?? ""}
              onChange={(e) => onValueChange(qid, { type: "text", text: e.target.value })}
              className="min-h-28"
              placeholder="Write your answer here…"
            />
          ) : (
            <p className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
              {(current as TextValue)?.text || "—"}
            </p>
          )}
        </div>
      );

    case "short_text":
      return (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-800">
            {block.prompt || block.content}
            {block.required && <span className="ml-1 text-rose-500">*</span>}
          </p>
          {editable ? (
            <Input
              value={(current as TextValue)?.text ?? ""}
              onChange={(e) => onValueChange(qid, { type: "text", text: e.target.value })}
              placeholder="Short answer…"
            />
          ) : (
            <p className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
              {(current as TextValue)?.text || "—"}
            </p>
          )}
        </div>
      );

    case "numeric":
      return (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-800">
            {block.prompt || block.content}
            {block.required && <span className="ml-1 text-rose-500">*</span>}
          </p>
          {editable ? (
            <Input
              type="number"
              value={(current as NumericValue)?.numeric ?? ""}
              onChange={(e) =>
                onValueChange(qid, {
                  type: "numeric",
                  numeric: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="w-40"
              placeholder="0"
            />
          ) : (
            <p className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
              {(current as NumericValue)?.numeric ?? "—"}
            </p>
          )}
        </div>
      );

    case "multiple_choice":
      return (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-800">
            {block.prompt || block.content}
            {block.required && <span className="ml-1 text-rose-500">*</span>}
          </p>
          <div className="space-y-1">
            {(block.choices ?? []).map((choice, i) => (
              <label key={i} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`mcq-${qid}`}
                  value={choice}
                  checked={(current as TextValue)?.text === choice}
                  onChange={() => onValueChange(qid, { type: "text", text: choice })}
                  disabled={!editable}
                />
                {choice}
              </label>
            ))}
          </div>
        </div>
      );

    case "tick_box":
      return (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={(current as BoolValue)?.bool ?? false}
            onChange={(e) => onValueChange(qid, { type: "bool", bool: e.target.checked })}
            disabled={!editable}
          />
          <span className="font-medium text-slate-800">{block.prompt || block.content}</span>
        </label>
      );

    case "table":
    case "vocabulary_table":
      return (
        <TableView
          block={block}
          current={current as TableCellValues | undefined}
          onChange={(v) => onValueChange(qid, v)}
          editable={editable}
        />
      );

    default:
      return null;
  }
}

// ── Table view ────────────────────────────────────────────────────────────────

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
    <div className="space-y-2">
      {(block.prompt || block.content) && (
        <p className="text-sm font-medium text-slate-800">{block.prompt || block.content}</p>
      )}
      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="min-w-full text-sm">
          {cfg.header_row && (
            <thead>
              <tr className="bg-slate-50">
                {Array.from({ length: cfg.cols }, (_, ci) => (
                  <th key={ci} className="px-4 py-2 text-left text-xs font-semibold text-slate-600">
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
                    const isReadOnly = cellDef?.cell_type === "readonly" || cellDef?.read_only;
                    const isTick = cellDef?.cell_type === "tick";
                    const isTeacherReview = cellDef?.cell_type === "teacher_review";

                    if (isTeacherReview) {
                      return (
                        <td key={ci} className="px-4 py-2">
                          <span className="text-xs text-slate-400">[Teacher review]</span>
                        </td>
                      );
                    }

                    if (isReadOnly) {
                      return (
                        <td key={ci} className="bg-slate-50 px-4 py-2 text-xs text-slate-600">
                          {cellDef?.label ?? ""}
                        </td>
                      );
                    }

                    if (isTick) {
                      return (
                        <td key={ci} className="px-4 py-2">
                          <input
                            type="checkbox"
                            checked={getCellValue(ri, ci) === "true"}
                            onChange={(e) => setCellValue(ri, ci, e.target.checked ? "true" : "false")}
                            disabled={!editable}
                          />
                        </td>
                      );
                    }

                    return (
                      <td key={ci} className="px-2 py-1">
                        {editable ? (
                          cellDef?.cell_type === "student_numeric" ? (
                            <Input
                              type="number"
                              value={getCellValue(ri, ci)}
                              onChange={(e) => setCellValue(ri, ci, e.target.value)}
                              className="h-8 text-xs"
                              placeholder="—"
                            />
                          ) : (
                            <input
                              type="text"
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

// ── Value types ───────────────────────────────────────────────────────────────

type TextValue = { type: "text"; text: string };
type NumericValue = { type: "numeric"; numeric: number | null };
type BoolValue = { type: "bool"; bool: boolean };
type TableCellValues = {
  type: "table";
  cells: Array<{ row_index: number; col_index: number; text: string }>;
};
type ResponseValue = TextValue | NumericValue | BoolValue | TableCellValues;

function buildInitialValues(
  sections: BuilderSection[],
  existing: Record<string, StudentResponse>,
): Record<string, ResponseValue> {
  const result: Record<string, ResponseValue> = {};

  function processSection(section: BuilderSection) {
    for (const block of section.blocks) {
      const resp = existing[block._id];
      if (!resp) continue;
      if (block.block_type === "numeric") {
        result[block._id] = { type: "numeric", numeric: resp.numeric_value };
      } else if (block.block_type === "tick_box") {
        result[block._id] = { type: "bool", bool: resp.boolean_value ?? false };
      } else {
        result[block._id] = { type: "text", text: resp.text_value ?? "" };
      }
    }
    for (const sub of section.subsections) {
      processSection(sub);
    }
  }

  for (const section of sections) {
    processSection(section);
  }

  return result;
}

function collectResponses(
  values: Record<string, ResponseValue>,
): StructuredResponseInput[] {
  return Object.entries(values).map(([question_id, value]) => {
    if (value.type === "text") {
      return { question_id, text_value: value.text || null };
    }
    if (value.type === "numeric") {
      return { question_id, numeric_value: value.numeric };
    }
    if (value.type === "bool") {
      return { question_id, boolean_value: value.bool };
    }
    // table
    return {
      question_id,
      cells: value.cells.map((c) => ({
        row_index: c.row_index,
        col_index: c.col_index,
        text_value: c.text || null,
      })),
    };
  });
}
