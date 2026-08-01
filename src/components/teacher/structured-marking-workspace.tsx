"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { DownloadButton } from "@/components/shared/download-button";
import {
  StructuredWorksheetRenderer,
  buildValuesFromResponses,
} from "@/components/shared/structured-worksheet-renderer";
import { FeedbackForm } from "@/components/teacher/feedback-form";
import {
  evaluateStructuredCompletion,
  isAssessableStudentBlock,
  isStructuredResponseAnswered,
  type ResponseSnapshot,
} from "@/lib/homework/completion";
import {
  labelsForOptionIds,
  selectedMcqOptionIds,
} from "@/lib/homework/mcq-answers";
import {
  flattenStudentBlocks,
  resolveMcqOptions,
  responseKey,
} from "@/lib/homework/structure";
import type {
  BuilderBlock,
  BuilderSection,
  Feedback,
  StudentResponse,
} from "@/lib/types";

export type MarkingResponse = StudentResponse & {
  cells?: Array<{
    row_index: number;
    col_index: number;
    text_value: string | null;
    numeric_value: number | null;
    boolean_value: boolean | string | null;
  }>;
};

type ResourceFile = {
  id: string;
  file_name: string;
  storage_path: string;
};

type MarkSchemeFile = {
  id: string;
  title: string;
  file_name: string;
  storage_path: string;
};

type CommentBankSummary = {
  id: string;
  name: string;
};

type NavItem = {
  id: string;
  kind: "section" | "question";
  label: string;
  answered?: boolean;
  required?: boolean;
  maxMarks?: number | null;
};

export function StructuredMarkingWorkspace({
  submissionId,
  maximumMark,
  feedback,
  sections,
  responses,
  resources = [],
  markSchemes = [],
  commentBanks = [],
  legacyWrittenResponse = null,
  legacyFileName = null,
  legacyStoragePath = null,
}: {
  submissionId: string;
  maximumMark: number;
  feedback: Feedback | null;
  sections: BuilderSection[];
  responses: MarkingResponse[];
  resources?: ResourceFile[];
  markSchemes?: MarkSchemeFile[];
  commentBanks?: CommentBankSummary[];
  legacyWrittenResponse?: string | null;
  legacyFileName?: string | null;
  legacyStoragePath?: string | null;
}) {
  const responseMap = useMemo(() => {
    const map = new Map<string, MarkingResponse>();
    for (const response of responses) map.set(response.question_id, response);
    return map;
  }, [responses]);

  const snapshots: ResponseSnapshot[] = useMemo(
    () =>
      responses.map((r) => ({
        question_id: r.question_id,
        text_value: r.text_value,
        numeric_value: r.numeric_value,
        boolean_value: r.boolean_value,
        json_value: r.json_value,
        file_name: r.file_name,
        storage_path: r.storage_path,
        cells: r.cells,
      })),
    [responses],
  );

  const completion = useMemo(
    () => evaluateStructuredCompletion(sections, snapshots),
    [sections, snapshots],
  );

  const assessable = useMemo(
    () => flattenStudentBlocks(sections).filter(isAssessableStudentBlock),
    [sections],
  );

  const worksheetValues = useMemo(
    () => buildValuesFromResponses(sections, responses),
    [sections, responses],
  );

  const navItems = useMemo(() => {
    const items: NavItem[] = [];
    function walk(section: BuilderSection, depth = 0) {
      items.push({
        id: `section-${section._id}`,
        kind: "section",
        label: `${depth > 0 ? "↳ " : ""}${section.title}`,
      });
      for (const block of section.blocks) {
        if (!isAssessableStudentBlock(block) && block.block_type !== "teacher_review") {
          continue;
        }
        const qid = responseKey(block);
        const response = responseMap.get(block.question_id ?? qid);
        items.push({
          id: `block-${block._id}`,
          kind: "question",
          label: block.content || block.prompt || "Question",
          required: Boolean(block.required),
          answered: isStructuredResponseAnswered(block, response ?? null),
          maxMarks: block.max_marks,
        });
      }
      for (const sub of section.subsections) walk(sub, depth + 1);
    }
    for (const section of sections) walk(section);
    return items;
  }, [sections, responseMap]);

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(
    assessable[0]?._id ?? null,
  );

  const selectedBlock =
    assessable.find((b) => b._id === selectedBlockId) ??
    assessable[0] ??
    null;
  const selectedResponse = selectedBlock?.question_id
    ? responseMap.get(selectedBlock.question_id)
    : undefined;

  const responseFiles = responses.filter((r) => r.storage_path && r.file_name);

  return (
    <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)_320px]">
      {/* Left pane */}
      <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <Card className="space-y-3">
          <CardTitle>Worksheet navigation</CardTitle>
          <p className="text-xs text-slate-500">
            {completion.answeredAssessableCount}/{completion.assessableCount}{" "}
            answered
            {completion.missingRequired.length > 0
              ? ` · ${completion.missingRequired.length} required missing`
              : ""}
          </p>
          <nav className="max-h-[28rem] space-y-1 overflow-auto text-sm">
            {navItems.map((item) =>
              item.kind === "section" ? (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="block rounded-xl px-2 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
                >
                  {item.label}
                </a>
              ) : (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedBlockId(item.id.replace(/^block-/, ""));
                    document
                      .getElementById(item.id)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className={`flex w-full items-start justify-between gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-slate-50 ${
                    selectedBlock && item.id === `block-${selectedBlock._id}`
                      ? "bg-brand-50 text-brand-900"
                      : "text-slate-600"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400">
                    {item.answered ? "done" : item.required ? "req" : "opt"}
                  </span>
                </button>
              ),
            )}
          </nav>
        </Card>

        <Card className="space-y-3">
          <CardTitle>Files & resources</CardTitle>
          <FileList
            title="Student uploads"
            empty="No response files"
            files={responseFiles.map((f) => ({
              id: f.id,
              name: f.file_name || "File",
              path: f.storage_path!,
              bucket: "student-submissions",
            }))}
          />
          {legacyStoragePath && legacyFileName ? (
            <FileList
              title="Assignment-level upload"
              empty=""
              files={[
                {
                  id: "legacy-file",
                  name: legacyFileName,
                  path: legacyStoragePath,
                  bucket: "student-submissions",
                },
              ]}
            />
          ) : null}
          <FileList
            title="Assignment resources"
            empty="No resources"
            files={resources.map((r) => ({
              id: r.id,
              name: r.file_name,
              path: r.storage_path,
              bucket: "assignment-resources",
            }))}
          />
          <FileList
            title="Mark schemes"
            empty="No mark-scheme PDFs"
            files={markSchemes.map((m) => ({
              id: m.id,
              name: m.title || m.file_name,
              path: m.storage_path,
              bucket: "assignment-resources",
            }))}
          />
        </Card>
      </aside>

      {/* Centre pane — primary worksheet */}
      <main className="min-w-0 space-y-4">
        <Card className="space-y-2">
          <CardTitle>Submitted worksheet</CardTitle>
          <p className="text-sm text-slate-500">
            Student answers appear in context, in the same order the student saw.
          </p>
        </Card>

        <div className="border border-slate-200 bg-white px-4 py-6 sm:px-6">
          <StructuredWorksheetRenderer
            sections={sections}
            mode="teacher_marking"
            values={worksheetValues}
            showTeacherGuidance
          />
        </div>

        {legacyWrittenResponse?.trim() ? (
          <Card>
            <CardTitle className="mb-2">Additional written response</CardTitle>
            <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
              {legacyWrittenResponse}
            </p>
          </Card>
        ) : null}
      </main>

      {/* Right pane */}
      <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <Card className="space-y-3">
          <CardTitle>Current question</CardTitle>
          {selectedBlock ? (
            <div className="space-y-3 text-sm">
              <p className="font-[family-name:var(--font-outfit)] text-base font-semibold text-slate-900">
                {selectedBlock.content || selectedBlock.prompt || "Question"}
              </p>
              <div className="flex flex-wrap gap-2">
                {selectedBlock.max_marks != null ? (
                  <Badge tone="brand">{selectedBlock.max_marks} marks</Badge>
                ) : (
                  <Badge tone="neutral">No marks</Badge>
                )}
                {selectedBlock.required ? (
                  <Badge tone="warning">Required</Badge>
                ) : (
                  <Badge tone="neutral">Optional</Badge>
                )}
                <Badge
                  tone={
                    isStructuredResponseAnswered(
                      selectedBlock,
                      selectedResponse ?? null,
                    )
                      ? "success"
                      : "neutral"
                  }
                >
                  {isStructuredResponseAnswered(
                    selectedBlock,
                    selectedResponse ?? null,
                  )
                    ? "Answered"
                    : "Unanswered"}
                </Badge>
              </div>
              <div className="border border-slate-100 bg-slate-50 px-3 py-2">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Student answer
                </p>
                <StudentAnswerSummary
                  block={selectedBlock}
                  response={selectedResponse}
                />
              </div>
              <TeacherGuidance block={selectedBlock} commentBanks={commentBanks} />
              <p className="text-xs text-slate-400">
                Overall mark and written feedback are saved below. Per-question
                scoring arrives in a later marking phase.
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No assessable questions.</p>
          )}
        </Card>

        <Card>
          <CardTitle className="mb-4">Assignment feedback</CardTitle>
          <FeedbackForm
            submissionId={submissionId}
            maximumMark={maximumMark}
            feedback={feedback}
          />
        </Card>
      </aside>
    </div>
  );
}

function FileList({
  title,
  empty,
  files,
}: {
  title: string;
  empty: string;
  files: Array<{
    id: string;
    name: string;
    path: string;
    bucket: "assignment-resources" | "student-submissions";
  }>;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </p>
      {files.length === 0 ? (
        empty ? <p className="text-xs text-slate-500">{empty}</p> : null
      ) : (
        <ul className="space-y-2">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 px-2 py-1.5 text-xs"
            >
              <span className="truncate">{file.name}</span>
              <DownloadButton bucket={file.bucket} path={file.path} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TeacherGuidance({
  block,
  commentBanks,
}: {
  block: BuilderBlock;
  commentBanks: CommentBankSummary[];
}) {
  const linked = commentBanks.filter((bank) =>
    (block.linked_comment_bank_ids ?? []).includes(bank.id),
  );
  const hasGuidance =
    Boolean(block.teacher_note) ||
    Boolean(block.mark_scheme_note) ||
    linked.length > 0;

  if (!hasGuidance) {
    return (
      <p className="text-xs text-slate-400">No teacher guidance for this question.</p>
    );
  }

  return (
    <details className="rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-amber-900">
        Teacher guidance
      </summary>
      <div className="mt-2 space-y-2 text-xs text-amber-950">
        {block.mark_scheme_note ? (
          <div>
            <p className="font-medium">Mark-scheme note</p>
            <p className="whitespace-pre-wrap">{block.mark_scheme_note}</p>
          </div>
        ) : null}
        {block.teacher_note ? (
          <div>
            <p className="font-medium">Teacher-only notes</p>
            <p className="whitespace-pre-wrap">{block.teacher_note}</p>
          </div>
        ) : null}
        {linked.length > 0 ? (
          <div>
            <p className="font-medium">Linked comment sets</p>
            <ul className="list-disc pl-4">
              {linked.map((bank) => (
                <li key={bank.id}>{bank.name}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </details>
  );
}


function StudentAnswerSummary({
  block,
  response,
}: {
  block: BuilderBlock;
  response?: MarkingResponse;
}) {
  if (block.review_only || block.block_type === "teacher_review") {
    return <p className="text-sm text-slate-500">Teacher review item — no student answer.</p>;
  }
  if (!response) {
    return <p className="text-sm text-slate-500">No response saved.</p>;
  }

  if (block.block_type === "multiple_choice" || block.block_type === "multiple_select") {
    const options = resolveMcqOptions(block);
    const selectedIds = new Set(selectedMcqOptionIds(block, response));
    const selectedLabels = labelsForOptionIds(block, Array.from(selectedIds));
    if (selectedIds.size === 0 && !response.text_value?.trim()) {
      return <p className="text-sm text-slate-500">No response saved.</p>;
    }
    return (
      <div className="space-y-2">
        <ul className="space-y-1 text-sm text-slate-800">
          {options.map((option) => (
            <li key={option.id} className="flex items-center gap-2">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  selectedIds.has(option.id) ? "bg-brand-600" : "bg-slate-300"
                }`}
              />
              <span className={selectedIds.has(option.id) ? "font-medium" : ""}>
                {option.label}
              </span>
              {selectedIds.has(option.id) ? (
                <span className="text-xs text-slate-400">selected</span>
              ) : null}
            </li>
          ))}
        </ul>
        {selectedLabels.length ? (
          <p className="text-xs text-slate-500">
            Selected: {selectedLabels.join(", ")}
          </p>
        ) : null}
      </div>
    );
  }

  if (block.block_type === "numeric") {
    return (
      <p className="text-sm text-slate-800">
        {response.numeric_value ?? "—"}
      </p>
    );
  }

  if (block.block_type === "tick_box") {
    return (
      <p className="text-sm text-slate-800">
        {response.boolean_value ? "Ticked" : "Not ticked"}
      </p>
    );
  }

  if (block.block_type === "file_upload") {
    if (response.storage_path && response.file_name) {
      return (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span>{response.file_name}</span>
          <DownloadButton
            bucket="student-submissions"
            path={response.storage_path}
          />
        </div>
      );
    }
    return (
      <p className="text-sm text-slate-800">
        {response.text_value || "No file uploaded for this question"}
      </p>
    );
  }

  if (block.block_type === "table" || block.block_type === "vocabulary_table") {
    const cfg = block.tableConfig;
    if (!cfg) return <p className="text-sm text-slate-500">No table config.</p>;
    const startRow = cfg.header_row ? 1 : 0;
    const cellMap = new Map(
      (response.cells ?? []).map((c) => [`${c.row_index}:${c.col_index}`, c]),
    );
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          {cfg.header_row ? (
            <thead>
              <tr>
                {Array.from({ length: cfg.cols }, (_, ci) => (
                  <th
                    key={ci}
                    className="border-b border-slate-200 px-2 py-1 text-left text-xs text-slate-500"
                  >
                    {(cfg.col_labels ?? [])[ci] ?? `Col ${ci + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {Array.from({ length: Math.max(0, cfg.rows - startRow) }, (_, offset) => {
              const ri = offset + startRow;
              return (
                <tr key={ri} className="border-t border-slate-100">
                  {Array.from({ length: cfg.cols }, (_, ci) => {
                    const cell = cellMap.get(`${ri}:${ci}`);
                    const text =
                      cell?.text_value ??
                      (cell?.numeric_value != null
                        ? String(cell.numeric_value)
                        : cell?.boolean_value != null
                          ? String(cell.boolean_value)
                          : "");
                    return (
                      <td key={ci} className="px-2 py-1 text-slate-800">
                        {text || "—"}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <p className="whitespace-pre-wrap text-sm leading-7 text-slate-800">
      {response.text_value || "—"}
    </p>
  );
}

/** Unused helper kept for future rich previews */
export function MarkingEmptyState({ children }: { children: ReactNode }) {
  return <div className="text-sm text-slate-500">{children}</div>;
}

export function LegacyMarkingPanels({
  writtenResponse,
  fileName,
  storagePath,
}: {
  writtenResponse: string | null;
  fileName: string | null;
  storagePath: string | null;
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardTitle className="mb-2">Written response</CardTitle>
        <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
          {writtenResponse || "No written response."}
        </p>
      </Card>
      <Card>
        <CardTitle className="mb-3">Uploaded file</CardTitle>
        {storagePath && fileName ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm">{fileName}</p>
            <DownloadButton bucket="student-submissions" path={storagePath} />
          </div>
        ) : (
          <p className="text-sm text-slate-500">No file uploaded</p>
        )}
      </Card>
    </div>
  );
}
