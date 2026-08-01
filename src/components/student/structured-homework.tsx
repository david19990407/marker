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
import { evaluateStructuredCompletion } from "@/lib/homework/completion";
import { formatMarkLabel } from "@/lib/homework/marks";
import {
  collectResponses,
  collectUnpersistableAnswerLabels,
  valuesToCompletionSnapshots,
} from "@/lib/homework/response-collect";
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

  // Submit/unsubmit use a full navigation reload so values rehydrate from
  // existingResponses via useState initialiser (no effect setState).

  const autosave = useVersionedAutosave<Record<string, ResponseValue>>({
    delayMs: 1200,
    enabled: editable,
    save: async (current, version) => {
      const responses = collectResponses(
        current,
        sectionsRef.current,
        version,
      );
      const unpersistable = collectUnpersistableAnswerLabels(
        current,
        sectionsRef.current,
      );
      if (unpersistable.length > 0 && responses.length === 0) {
        return {
          ok: false,
          error:
            "Some answers could not be saved because questions are missing database IDs. Ask your teacher to re-open and save the homework.",
        };
      }
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

  function validate(): boolean {
    const nextErrors: Record<string, string> = {};
    const completion = evaluateStructuredCompletion(
      sections,
      valuesToCompletionSnapshots(values, sections),
    );
    for (const missing of completion.missingRequired) {
      nextErrors[responseKey(missing.block)] = "This question is required";
    }

    const unpersistable = collectUnpersistableAnswerLabels(values, sections);
    if (unpersistable.length) {
      setFlash({
        type: "error",
        msg: `Cannot submit: answers are not linked to saved questions (${unpersistable.slice(0, 2).join("; ")}). Ask your teacher to re-save the homework.`,
      });
      setConfirmSubmit(false);
      setErrors(nextErrors);
      return false;
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
      if (!ok || autosave.hasUnsavedChanges()) {
        setFlash({
          type: "error",
          msg: autosave.lastError ?? "Save your answers before submitting",
        });
        return;
      }

      // Final sync of the same flushed snapshot, then status-only submit.
      const responses = collectResponses(
        valuesRef.current,
        sectionsRef.current,
        Math.max(autosave.getVersion(), 1),
      );
      const result = await submitStructuredHomeworkAction(
        assignmentId,
        responses,
      );
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
    valuesToCompletionSnapshots(values, sections),
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
            Questions {completion.answeredAssessableCount}/
            {completion.assessableCount}
            {completion.requiredCount > 0
              ? ` · Required ${completion.answeredRequiredCount}/${completion.requiredCount}`
              : ""}
            {completion.totalMarks > 0
              ? ` · ${formatMarkLabel(completion.answeredMarks)} of ${formatMarkLabel(completion.totalMarks)} attempted`
              : ""}
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">
            Questions answered {completion.answeredAssessableCount}/
            {completion.assessableCount}
            {completion.totalMarks > 0
              ? ` · ${formatMarkLabel(completion.answeredMarks)} of ${formatMarkLabel(completion.totalMarks)} attempted`
              : ""}
          </span>
        </div>
      )}

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
