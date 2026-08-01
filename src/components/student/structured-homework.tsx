"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
  unsubmitStructuredHomeworkAction,
} from "@/lib/actions/homework-builder";
import { useVersionedAutosave } from "@/hooks/use-versioned-autosave";
import {
  evaluateStructuredCompletion,
  type ResponseSnapshot,
} from "@/lib/homework/completion";
import { collectResponses } from "@/lib/homework/response-collect";
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
  submissionStatus?: string | null;
  submittedAt?: string | null;
  allowUnsubmit?: boolean;
}

type ResponseValue = WorksheetResponseValue;

export function StructuredHomework({
  assignmentId,
  sections,
  existingResponses,
  editable,
  submissionStatus = null,
  submittedAt = null,
  allowUnsubmit = true,
}: Props) {
  const [values, setValues] = useState<Record<string, ResponseValue>>(() =>
    buildValuesFromResponses(sections, existingResponses),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<{ type: "success" | "error"; msg: string } | null>(
    null,
  );
  const [confirmSubmit, setConfirmSubmit] = useState(false);
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

  function valuesToSnapshots(
    current: Record<string, ResponseValue>,
    sectionTree: BuilderSection[] = sections,
  ): ResponseSnapshot[] {
    return collectResponses(current, sectionTree).map((resp) => ({
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
      valuesToSnapshots(values, sections),
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
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
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

  function handleSubmit() {
    if (!validate()) {
      setFlash({
        type: "error",
        msg: "Please complete required fields before submitting",
      });
      setConfirmSubmit(false);
      return;
    }
    startTransition(async () => {
      const ok = await autosave.flush();
      if (!ok && autosave.hasUnsavedChanges()) {
        setFlash({
          type: "error",
          msg: autosave.lastError ?? "Save your answers before submitting",
        });
        return;
      }
      // Status-only after flush — do not rewrite answer rows on submit.
      const result = await submitStructuredHomeworkAction(assignmentId);
      if (result.error) {
        setFlash({ type: "error", msg: result.error });
        setConfirmSubmit(false);
        return;
      }
      window.location.href = `/student/homework/${assignmentId}`;
    });
  }

  function handleUnsubmit() {
    if (
      !window.confirm(
        "Unsubmit and continue editing? Your answers will be kept.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await unsubmitStructuredHomeworkAction(assignmentId);
      if (result.error) {
        setFlash({ type: "error", msg: result.error });
        return;
      }
      window.location.href = `/student/homework/${assignmentId}`;
    });
  }

  const completion = evaluateStructuredCompletion(
    sections,
    valuesToSnapshots(values, sections),
  );
  const worksheetMode = editable ? "student_editable" : "student_readonly";
  const canUnsubmit =
    allowUnsubmit &&
    !editable &&
    (submissionStatus === "submitted" || submissionStatus === "late");

  return (
    <div className="homework-worksheet mx-auto max-w-3xl space-y-8 px-1 sm:px-2">
      {editable ? (
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
          <span className="text-xs text-slate-500">
            Required {completion.answeredRequiredCount}/{completion.requiredCount}
            {" · "}
            Answered {completion.answeredAssessableCount}/{completion.assessableCount}
          </span>
        </div>
      ) : null}

      {flash ? (
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
      ) : null}

      {!editable && submittedAt ? (
        <div className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Submitted{" "}
          {new Date(submittedAt).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
          {" · "}
          status {submissionStatus ?? "submitted"} · read-only
        </div>
      ) : null}

      <StructuredWorksheetRenderer
        sections={sections}
        mode={worksheetMode}
        values={values}
        errors={errors}
        onValueChange={setValue}
        submissionMeta={
          worksheetMode === "student_readonly"
            ? { status: submissionStatus, submittedAt }
            : null
        }
      />

      {editable ? (
        <div className="space-y-3">
          {confirmSubmit ? (
            <div className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p className="font-medium text-slate-900">Submit homework?</p>
              <p className="mt-1">
                Required answered: {completion.answeredRequiredCount}/
                {completion.requiredCount}. Your answers stay saved; this only
                marks the work as submitted.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={handleSubmit} disabled={pending}>
                  {pending ? "Submitting…" : "Confirm submit"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setConfirmSubmit(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Button onClick={handleSave} disabled={pending} variant="secondary">
                {pending || autosave.status === "saving" ? "Saving…" : "Save progress"}
              </Button>
              <Button onClick={() => setConfirmSubmit(true)} disabled={pending}>
                Submit homework
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <p className="w-full text-sm text-slate-500">
            This submission is locked and read-only.
          </p>
          {canUnsubmit ? (
            <Button
              variant="outline"
              onClick={handleUnsubmit}
              disabled={pending}
            >
              {pending ? "Working…" : "Unsubmit and continue editing"}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
