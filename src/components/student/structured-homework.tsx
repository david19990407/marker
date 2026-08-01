"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  StructuredWorksheetRenderer,
  buildValuesFromResponses,
  type WorksheetResponseValue,
} from "@/components/shared/structured-worksheet-renderer";
import {
  saveStudentStructuredResponsesAction,
  submitStructuredHomeworkAction,
  type StructuredResponseInput,
} from "@/lib/actions/homework-builder";
import { useVersionedAutosave } from "@/hooks/use-versioned-autosave";
import {
  evaluateStructuredCompletion,
  type ResponseSnapshot,
} from "@/lib/homework/completion";
import {
  flattenStudentBlocks,
  isResponseType,
  responseKey,
} from "@/lib/homework/structure";
import type { BuilderSection, StudentResponse } from "@/lib/types";

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
  reviewMode?: boolean;
  submissionStatus?: string | null;
  submittedAt?: string | null;
}

type ResponseValue = WorksheetResponseValue;

export function StructuredHomework({
  assignmentId,
  sections,
  existingResponses,
  editable,
  reviewMode = false,
  submissionStatus = null,
  submittedAt = null,
}: Props) {
  const [values, setValues] = useState<Record<string, ResponseValue>>(() =>
    buildValuesFromResponses(sections, existingResponses),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<{ type: "success" | "error"; msg: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();
  const sectionsRef = useRef(sections);
  const valuesRef = useRef(values);
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
      return result.error ? { ok: false, error: result.error } : { ok: true };
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

  function valuesToSnapshots(
    current: Record<string, ResponseValue>,
  ): ResponseSnapshot[] {
    return collectResponses(current, sectionsRef.current).map((resp) => ({
      question_id: resp.question_id,
      text_value: resp.text_value ?? null,
      numeric_value: resp.numeric_value ?? null,
      boolean_value: resp.boolean_value ?? null,
      json_value: resp.json_value ?? null,
      cells: resp.cells,
    }));
  }

  function validate(): boolean {
    const nextErrors: Record<string, string> = {};
    const completion = evaluateStructuredCompletion(
      sections,
      valuesToSnapshots(values),
    );

    for (const missing of completion.missingRequired) {
      nextErrors[responseKey(missing.block)] = "This question is required";
    }

    const blocks = flattenStudentBlocks(sections).filter(
      (b) => isResponseType(b.block_type) && !b.review_only,
    );
    for (const block of blocks) {
      const qid = responseKey(block);
      const value = values[qid];
      if (value?.type === "numeric" && value.numeric != null) {
        if (block.min_value != null && value.numeric < block.min_value) {
          nextErrors[qid] = `Minimum value is ${block.min_value}`;
        }
        if (block.max_value != null && value.numeric > block.max_value) {
          nextErrors[qid] = `Maximum value is ${block.max_value}`;
        }
        const numeric = block.numericConfig;
        if (numeric && !numeric.allow_decimals && !Number.isInteger(value.numeric)) {
          nextErrors[qid] = "Whole numbers only";
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
      setFlash({
        type: "error",
        msg: "Please complete required fields before submitting",
      });
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

      {reviewMode && editable && (
        <div className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Review your answers below. Submit only when every required question is
          complete.
        </div>
      )}

      <StructuredWorksheetRenderer
        sections={sections}
        mode={editable ? "student_editable" : "student_readonly"}
        values={values}
        errors={errors}
        onValueChange={setValue}
        submissionMeta={
          editable
            ? null
            : { status: submissionStatus, submittedAt: submittedAt }
        }
      />

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
          This submission is locked and read-only
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
