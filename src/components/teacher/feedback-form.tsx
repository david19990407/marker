"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CommentBankPanel } from "@/components/teacher/comment-bank-panel";
import {
  reopenSubmissionAction,
  saveFeedbackAction,
} from "@/lib/actions/teacher";
import type { ActionResult } from "@/lib/actions/auth";
import {
  appendCommentWithoutDuplicate,
  generateDeterministicComment,
} from "@/lib/feedback/comment-templates";
import { evaluateFeedbackCompletion } from "@/lib/feedback/completion";
import type {
  AssignmentFeedbackField,
  CommentBankItem,
  FeedbackFieldValue,
} from "@/lib/feedback/types";
import type { Feedback } from "@/lib/types";

const initial: ActionResult = {};

type FieldState = Record<
  string,
  {
    text_value: string;
    numeric_value: string;
    boolean_value: boolean;
    json_value: unknown;
  }
>;

function buildInitialState(
  fields: AssignmentFeedbackField[],
  feedback?: Feedback | null,
  values?: FeedbackFieldValue[],
): FieldState {
  const byKey = new Map((values ?? []).map((v) => [v.field_key, v]));
  const legacy: Record<string, string | null | undefined> = {
    strengths: feedback?.strengths,
    improvements: feedback?.improvements,
    next_steps: feedback?.next_steps,
    private_notes: feedback?.private_notes,
  };
  const state: FieldState = {};
  for (const field of fields) {
    const existing = byKey.get(field.field_key);
    state[field.field_key] = {
      text_value: String(
        existing?.text_value ?? legacy[field.field_key] ?? "",
      ),
      numeric_value:
        existing?.numeric_value != null ? String(existing.numeric_value) : "",
      boolean_value: Boolean(existing?.boolean_value),
      json_value: existing?.json_value ?? null,
    };
  }
  return state;
}

export function FeedbackForm({
  submissionId,
  maximumMark,
  feedback,
  fields = [],
  fieldValues = [],
  commentItems = [],
  studentName = "",
  assignmentTitle = "",
}: {
  submissionId: string;
  maximumMark: number;
  feedback?: Feedback | null;
  fields?: AssignmentFeedbackField[];
  fieldValues?: FeedbackFieldValue[];
  commentItems?: CommentBankItem[];
  studentName?: string;
  assignmentTitle?: string;
}) {
  const effectiveFields = useMemo(() => {
    if (fields.length) return [...fields].sort((a, b) => a.sort_order - b.sort_order);
    // Pre-migration fallback: classic three + private notes.
    return [
      {
        id: "legacy-strengths",
        template_id: "",
        field_key: "strengths",
        label: "Strengths",
        description: null,
        field_type: "rich_text" as const,
        sort_order: 10,
        is_required: false,
        student_visible: true,
        teacher_only: false,
        max_length: 5000,
        tracks_completion: true,
        allow_comment_bank: true,
        config: {},
      },
      {
        id: "legacy-improvements",
        template_id: "",
        field_key: "improvements",
        label: "Improvements",
        description: null,
        field_type: "rich_text" as const,
        sort_order: 20,
        is_required: false,
        student_visible: true,
        teacher_only: false,
        max_length: 5000,
        tracks_completion: true,
        allow_comment_bank: true,
        config: {},
      },
      {
        id: "legacy-next_steps",
        template_id: "",
        field_key: "next_steps",
        label: "Next steps",
        description: null,
        field_type: "rich_text" as const,
        sort_order: 30,
        is_required: false,
        student_visible: true,
        teacher_only: false,
        max_length: 5000,
        tracks_completion: true,
        allow_comment_bank: true,
        config: {},
      },
      {
        id: "legacy-private_notes",
        template_id: "",
        field_key: "private_notes",
        label: "Teacher notes",
        description: "Not shown to student",
        field_type: "teacher_only_note" as const,
        sort_order: 40,
        is_required: false,
        student_visible: false,
        teacher_only: true,
        max_length: 5000,
        tracks_completion: false,
        allow_comment_bank: false,
        config: {},
      },
    ];
  }, [fields]);

  const [values, setValues] = useState<FieldState>(() =>
    buildInitialState(effectiveFields, feedback, fieldValues),
  );
  const [activeFieldKey, setActiveFieldKey] = useState<string | null>(
    effectiveFields.find((f) => f.allow_comment_bank)?.field_key ?? null,
  );
  const [mark, setMark] = useState(feedback?.mark != null ? String(feedback.mark) : "");
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [criteriaText, setCriteriaText] = useState({
    strengths: "",
    improvements: "",
    nextSteps: "",
  });
  const [insertFlash, setInsertFlash] = useState<string | null>(null);

  const draftButtonRef = useRef<HTMLButtonElement>(null);
  const [draftState, draftAction, draftPending] = useActionState(
    saveFeedbackAction.bind(null, submissionId, "draft"),
    initial,
  );
  useEffect(() => {
    function onSaveBeforeNav() {
      draftButtonRef.current?.click();
    }
    window.addEventListener("marking:save-before-nav", onSaveBeforeNav);
    return () =>
      window.removeEventListener("marking:save-before-nav", onSaveBeforeNav);
  }, []);
  const [releaseState, releaseAction, releasePending] = useActionState(
    saveFeedbackAction.bind(null, submissionId, "release"),
    initial,
  );
  const [returnState, returnAction, returnPending] = useActionState(
    saveFeedbackAction.bind(null, submissionId, "return_unmarked"),
    initial,
  );
  const [isPending, startTransition] = useTransition();
  const [reopenFlash, setReopenFlash] = useState<ActionResult>({});

  const completion = evaluateFeedbackCompletion(
    effectiveFields,
    effectiveFields.map((field) => ({
      field_id: field.id,
      field_key: field.field_key,
      text_value: values[field.field_key]?.text_value ?? "",
      numeric_value: values[field.field_key]?.numeric_value
        ? Number(values[field.field_key].numeric_value)
        : null,
      boolean_value: values[field.field_key]?.boolean_value ?? null,
      json_value: values[field.field_key]?.json_value ?? null,
    })),
  );

  const fieldValuesPayload = effectiveFields.map((field) => {
    const state = values[field.field_key] ?? {
      text_value: "",
      numeric_value: "",
      boolean_value: false,
      json_value: null,
    };
    return {
      field_id: field.id,
      field_key: field.field_key,
      text_value: state.text_value || null,
      numeric_value: state.numeric_value === "" ? null : Number(state.numeric_value),
      boolean_value:
        field.field_type === "tick_box" ? state.boolean_value : null,
      json_value: state.json_value,
    };
  });

  const message =
    draftState.success ||
    draftState.error ||
    releaseState.success ||
    releaseState.error ||
    returnState.success ||
    returnState.error ||
    reopenFlash.success ||
    reopenFlash.error ||
    insertFlash;

  function updateField(
    fieldKey: string,
    patch: Partial<FieldState[string]>,
  ) {
    setValues((prev) => ({
      ...prev,
      [fieldKey]: { ...prev[fieldKey], ...patch },
    }));
  }

  function insertIntoActiveField(text: string) {
    if (!activeFieldKey) {
      setInsertFlash("Select a feedback field first");
      return;
    }
    const field = effectiveFields.find((f) => f.field_key === activeFieldKey);
    if (!field?.allow_comment_bank) {
      setInsertFlash("Comment banks are disabled for this field");
      return;
    }
    const current = values[activeFieldKey]?.text_value ?? "";
    const { next, inserted } = appendCommentWithoutDuplicate(current, text);
    if (!inserted) {
      setInsertFlash("That comment is already in this field");
      return;
    }
    updateField(activeFieldKey, { text_value: next });
    setInsertFlash("Comment inserted");
    window.setTimeout(() => setInsertFlash(null), 2500);
  }

  function applyGenerated() {
    const generated = generateDeterministicComment({
      strengths: criteriaText.strengths
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      improvements: criteriaText.improvements
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      nextSteps: criteriaText.nextSteps
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      studentName,
      assignmentTitle,
    });
    for (const [key, text] of Object.entries({
      strengths: generated.strengths,
      improvements: generated.improvements,
      next_steps: generated.next_steps,
    })) {
      if (values[key] !== undefined) {
        updateField(key, { text_value: text });
      }
    }
    setGeneratorOpen(false);
    setInsertFlash("Deterministic comments applied from your criteria");
  }

  return (
    <div className="space-y-4">
      {message ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {message}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>
          Feedback completion: {completion.completedTrackedCount}/
          {completion.trackedCount}
        </span>
        {completion.requiredCount > 0 ? (
          <span>
            Required: {completion.completedRequiredCount}/
            {completion.requiredCount}
          </span>
        ) : null}
      </div>

      <form className="space-y-4" data-marking-feedback="true">
        <input
          type="hidden"
          name="field_values_json"
          value={JSON.stringify(fieldValuesPayload)}
        />
        {/* Legacy names for older parsers / fallbacks */}
        <input
          type="hidden"
          name="strengths"
          value={values.strengths?.text_value ?? ""}
        />
        <input
          type="hidden"
          name="improvements"
          value={values.improvements?.text_value ?? ""}
        />
        <input
          type="hidden"
          name="next_steps"
          value={values.next_steps?.text_value ?? ""}
        />
        <input
          type="hidden"
          name="private_notes"
          value={values.private_notes?.text_value ?? ""}
        />

        <label className="block text-sm">
          <span className="mb-1.5 block text-slate-500">
            Mark (out of {maximumMark})
          </span>
          <Input
            name="mark"
            type="number"
            min={0}
            max={maximumMark}
            step="0.5"
            value={mark}
            onChange={(e) => setMark(e.target.value)}
          />
        </label>

        {effectiveFields.map((field) => {
          const state = values[field.field_key] ?? {
            text_value: "",
            numeric_value: "",
            boolean_value: false,
            json_value: null,
          };
          const active = activeFieldKey === field.field_key;
          return (
            <div
              key={field.id}
              className={`space-y-1.5 rounded-2xl border p-3 ${
                active ? "border-brand-300 bg-brand-50/40" : "border-slate-100"
              }`}
              onFocusCapture={() => setActiveFieldKey(field.field_key)}
              onClick={() => setActiveFieldKey(field.field_key)}
              onDragOver={(e) => {
                if (field.allow_comment_bank) e.preventDefault();
              }}
              onDrop={(e) => {
                if (!field.allow_comment_bank) return;
                e.preventDefault();
                const raw = e.dataTransfer.getData(
                  "application/x-comment-bank-item",
                );
                if (!raw) return;
                try {
                  const payload = JSON.parse(raw) as { text?: string };
                  if (payload.text) {
                    setActiveFieldKey(field.field_key);
                    const current = values[field.field_key]?.text_value ?? "";
                    const { next, inserted } = appendCommentWithoutDuplicate(
                      current,
                      payload.text,
                    );
                    if (!inserted) {
                      setInsertFlash("That comment is already in this field");
                      return;
                    }
                    updateField(field.field_key, { text_value: next });
                    setInsertFlash("Comment dropped into field");
                  }
                } catch {
                  // ignore bad drag payloads
                }
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {field.label}
                    {field.is_required ? (
                      <span className="text-rose-500"> *</span>
                    ) : null}
                  </p>
                  {field.description ? (
                    <p className="text-xs text-slate-500">{field.description}</p>
                  ) : null}
                  <p className="text-[11px] text-slate-400">
                    {field.teacher_only
                      ? "Teacher only"
                      : field.student_visible
                        ? "Visible to student"
                        : "Hidden from student"}
                  </p>
                </div>
              </div>

              {field.field_type === "tick_box" ? (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={state.boolean_value}
                    onChange={(e) =>
                      updateField(field.field_key, {
                        boolean_value: e.target.checked,
                      })
                    }
                  />
                  Tick when complete
                </label>
              ) : null}

              {field.field_type === "numeric_score" ? (
                <Input
                  type="number"
                  value={state.numeric_value}
                  min={field.config.min}
                  max={field.config.max ?? maximumMark}
                  onChange={(e) =>
                    updateField(field.field_key, {
                      numeric_value: e.target.value,
                    })
                  }
                />
              ) : null}

              {field.field_type === "grade" || field.field_type === "dropdown" ? (
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={state.text_value}
                  onChange={(e) =>
                    updateField(field.field_key, { text_value: e.target.value })
                  }
                >
                  <option value="">Select…</option>
                  {(
                    field.config.grades ??
                    field.config.options ??
                    ["A", "B", "C", "D", "E", "U"]
                  ).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : null}

              {field.field_type === "rubric" ? (
                <div className="space-y-2">
                  {(field.config.rubric_criteria ?? []).map((criterion) => {
                    const rubric =
                      (state.json_value as Record<string, number> | null) ?? {};
                    return (
                      <label key={criterion.id} className="block text-xs">
                        <span className="mb-1 block text-slate-500">
                          {criterion.label}
                        </span>
                        <Input
                          type="number"
                          min={0}
                          max={criterion.max_score ?? maximumMark}
                          value={rubric[criterion.id] ?? ""}
                          onChange={(e) => {
                            const next = {
                              ...rubric,
                              [criterion.id]: Number(e.target.value),
                            };
                            updateField(field.field_key, {
                              json_value: next,
                              text_value: JSON.stringify(next),
                            });
                          }}
                        />
                      </label>
                    );
                  })}
                  {(field.config.rubric_criteria ?? []).length === 0 ? (
                    <Textarea
                      value={state.text_value}
                      maxLength={field.max_length ?? undefined}
                      onChange={(e) =>
                        updateField(field.field_key, {
                          text_value: e.target.value,
                        })
                      }
                      placeholder="Enter rubric notes"
                    />
                  ) : null}
                </div>
              ) : null}

              {[
                "rich_text",
                "plain_text",
                "teacher_only_note",
                "comment_bank_selector",
              ].includes(field.field_type) ? (
                <Textarea
                  value={state.text_value}
                  maxLength={field.max_length ?? undefined}
                  onChange={(e) =>
                    updateField(field.field_key, { text_value: e.target.value })
                  }
                  placeholder={
                    field.allow_comment_bank
                      ? "Type feedback or insert from the comment bank"
                      : "Enter notes"
                  }
                />
              ) : null}
            </div>
          );
        })}

        <div className="flex flex-wrap gap-2">
          <Button
            ref={draftButtonRef}
            formAction={draftAction}
            disabled={draftPending}
            data-marking-save-draft="true"
          >
            {draftPending ? "Saving…" : "Save draft"}
          </Button>
          <Button
            formAction={releaseAction}
            variant="secondary"
            disabled={releasePending}
          >
            {releasePending ? "Releasing…" : "Release mark & feedback"}
          </Button>
          <Button
            formAction={returnAction}
            variant="outline"
            disabled={returnPending}
          >
            {returnPending ? "Returning…" : "Return without mark"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setGeneratorOpen((v) => !v)}
          >
            Template comments
          </Button>
        </div>
      </form>

      {generatorOpen ? (
        <div className="space-y-2 rounded-2xl border border-slate-200 p-3">
          <p className="text-sm font-medium text-slate-800">
            Deterministic comment builder
          </p>
          <p className="text-xs text-slate-500">
            Enter one criterion per line. No AI services are used — comments are
            built from fixed templates.
          </p>
          <Textarea
            placeholder="Strength criteria"
            value={criteriaText.strengths}
            onChange={(e) =>
              setCriteriaText((prev) => ({ ...prev, strengths: e.target.value }))
            }
          />
          <Textarea
            placeholder="Improvement criteria"
            value={criteriaText.improvements}
            onChange={(e) =>
              setCriteriaText((prev) => ({
                ...prev,
                improvements: e.target.value,
              }))
            }
          />
          <Textarea
            placeholder="Next-step criteria"
            value={criteriaText.nextSteps}
            onChange={(e) =>
              setCriteriaText((prev) => ({ ...prev, nextSteps: e.target.value }))
            }
          />
          <Button type="button" onClick={applyGenerated}>
            Apply generated comments
          </Button>
        </div>
      ) : null}

      <CommentBankPanel
        items={commentItems}
        activeFieldKey={activeFieldKey}
        mark={mark === "" ? null : Number(mark)}
        onInsert={(text) => insertIntoActiveField(text)}
      />

      <Button
        type="button"
        variant="ghost"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setReopenFlash(await reopenSubmissionAction(submissionId));
          })
        }
      >
        Reopen submission
      </Button>
    </div>
  );
}
