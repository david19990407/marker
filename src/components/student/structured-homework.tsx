"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
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

  const canEditAnswers = editable && !reviewMode;

  const autosave = useVersionedAutosave<Record<string, ResponseValue>>({
    delayMs: 1200,
    enabled: canEditAnswers,
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
    if (!canEditAnswers) return;
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

  async function goToReview() {
    const ok = await autosave.flush();
    if (!ok && autosave.hasUnsavedChanges()) {
      setFlash({
        type: "error",
        msg: autosave.lastError ?? "Save your answers before reviewing",
      });
      return;
    }
    router.push(`/student/homework/${assignmentId}/review`);
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
      // Flush any pending edits first (review is read-only, but keep safe).
      await autosave.flush();
      const responses = collectResponses(valuesRef.current, sectionsRef.current);
      const result = await submitStructuredHomeworkAction(assignmentId, responses);
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
  const worksheetMode =
    canEditAnswers ? "student_editable" : "student_readonly";

  return (
    <div className="homework-worksheet mx-auto max-w-3xl space-y-8 px-1 sm:px-2">
      {canEditAnswers && (
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
          <Button variant="outline" size="sm" onClick={() => void goToReview()}>
            Review before submit
          </Button>
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

      {reviewMode ? (
        <div className="space-y-2 border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <p className="font-medium text-slate-900">
            {editable
              ? "Review your answers (read-only). Submit when every required question is complete."
              : "Submitted answers (read-only)."}
          </p>
          <p>
            Required answered: {completion.answeredRequiredCount}/
            {completion.requiredCount}
            {" · "}
            All questions: {completion.answeredAssessableCount}/
            {completion.assessableCount}
          </p>
          {completion.missingRequired.length > 0 ? (
            <p className="text-rose-700">
              Missing required:{" "}
              {completion.missingRequired
                .slice(0, 5)
                .map((q) => q.label)
                .join("; ")}
            </p>
          ) : null}
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
            ? { status: submissionStatus, submittedAt: submittedAt }
            : null
        }
      />

      {editable && (
        <div className="flex flex-wrap gap-3">
          {canEditAnswers ? (
            <>
              <Button onClick={handleSave} disabled={pending} variant="secondary">
                {pending || autosave.status === "saving" ? "Saving…" : "Save progress"}
              </Button>
              <Button onClick={() => void goToReview()} disabled={pending}>
                Review & submit
              </Button>
            </>
          ) : (
            <>
              <Link href={`/student/homework/${assignmentId}`}>
                <Button variant="outline">Back to edit</Button>
              </Link>
              <Button onClick={handleSubmit} disabled={pending}>
                {pending ? "Submitting…" : "Submit homework"}
              </Button>
            </>
          )}
        </div>
      )}

      {!editable && (
        <p className="text-sm text-slate-500">
          This submission is locked and read-only.
        </p>
      )}
    </div>
  );
}

