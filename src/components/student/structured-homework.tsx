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
import {
  collectResponses,
  collectUnpersistableAnswerLabels,
  valuesToCompletionSnapshots,
} from "@/lib/homework/response-collect";
import { maxClientVersionFromRows } from "@/lib/homework/response-protect";
import {
  flattenStudentBlocks,
  isResponseType,
  responseKey,
} from "@/lib/homework/structure";
import { SubmissionStatusBanner } from "@/components/student/submission-status-banner";
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
  submissionId: string | null;
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
  submissionId,
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

  const missingQuestionIds = flattenStudentBlocks(sections).filter(
    (b) => isResponseType(b.block_type) && !b.review_only && !b.question_id,
  );

  // After submit/unsubmit reload, seed from DB so edits are not rejected as stale.
  const initialAutosaveVersion = maxClientVersionFromRows(
    Object.values(existingResponses),
  );

  const autosave = useVersionedAutosave<Record<string, ResponseValue>>({
    delayMs: 1200,
    enabled: editable,
    initialVersion: initialAutosaveVersion,
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
          error: `Save failed for: ${unpersistable.slice(0, 2).join("; ")}. Questions are missing database IDs — ask your teacher to re-open and save the homework.`,
        };
      }
      const result = await saveStudentStructuredResponsesAction(
        assignmentId,
        responses,
      );
      if (result.error) {
        return { ok: false, error: result.error };
      }
      if (
        responses.length > 0 &&
        typeof result.savedCount === "number" &&
        result.savedCount === 0
      ) {
        // Server skipped every row (e.g. identical stale content). Treat as ok.
        return { ok: true };
      }
      return { ok: true };
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

  function validateLocal(): { ok: boolean; message?: string } {
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
      setErrors(nextErrors);
      return {
        ok: false,
        message: `Cannot submit: answers are not linked to saved questions (${unpersistable.slice(0, 2).join("; ")}). Ask your teacher to re-save the homework.`,
      };
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
    if (Object.keys(nextErrors).length > 0) {
      return {
        ok: false,
        message: "Please complete required fields before submitting",
      };
    }
    return { ok: true };
  }

  function handleSave() {
    startTransition(async () => {
      const result = await autosave.flush();
      setFlash(
        result.ok
          ? { type: "success", msg: "Progress saved" }
          : {
              type: "error",
              msg: result.error ?? autosave.getLastError() ?? "Save failed",
            },
      );
      setTimeout(() => setFlash(null), 5000);
    });
  }

  function handleSubmit() {
    const local = validateLocal();
    if (!local.ok) {
      setFlash({ type: "error", msg: local.message ?? "Cannot submit" });
      setConfirmSubmit(false);
      return;
    }
    startTransition(async () => {
      const flushResult = await autosave.flush();
      if (!flushResult.ok || autosave.hasUnsavedChanges()) {
        setFlash({
          type: "error",
          msg:
            flushResult.error ??
            autosave.getLastError() ??
            "Save your answers before submitting",
        });
        return;
      }

      // Final sync of the flushed snapshot, then status-only submit.
      // Server reloads authoritative rows and re-validates completion.
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
      window.location.href = `/student/homework/assignments/${assignmentId}`;
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
      window.location.href = `/student/homework/assignments/${assignmentId}`;
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
      <SubmissionStatusBanner
        status={submissionStatus}
        submittedAt={submittedAt}
        answeredCount={completion.answeredAssessableCount}
        assessableCount={completion.assessableCount}
      />

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
          </span>
        </div>
      ) : null}

      {missingQuestionIds.length > 0 && editable ? (
        <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          This worksheet is missing question database IDs for{" "}
          {missingQuestionIds.length} item
          {missingQuestionIds.length === 1 ? "" : "s"}. Answers cannot be saved
          until your teacher re-opens and saves the homework.
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
          <p>{flash.msg}</p>
          {flash.type === "error" && editable ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={handleSave}
              disabled={pending}
            >
              Retry save
            </Button>
          ) : null}
        </div>
      ) : null}

      <StructuredWorksheetRenderer
        sections={sections}
        mode={worksheetMode}
        values={values}
        errors={errors}
        onValueChange={setValue}
        submissionMeta={null}
        submissionId={submissionId}
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
