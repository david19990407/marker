"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveFeedbackFieldsAction } from "@/lib/actions/feedback-fields";
import {
  FEEDBACK_FIELD_TYPE_LABELS,
  type AssignmentFeedbackField,
  type FeedbackFieldConfig,
  type FeedbackFieldType,
} from "@/lib/feedback/types";
import { newId } from "@/lib/homework/structure";
import { cn } from "@/lib/utils";

type DraftField = AssignmentFeedbackField & { _localId: string };
type SaveState = "saved" | "saving" | "failed" | "invalid";
type VisibilityOption = "student" | "teacher";
type QuickFieldSeed = {
  label: string;
  field_type: FeedbackFieldType;
  is_required: boolean;
  visibility: VisibilityOption;
  allow_comment_bank: boolean;
  description?: string;
  config?: FeedbackFieldConfig;
};

type QuickTemplateKey =
  | "single_overall"
  | "exam_question"
  | "coursework"
  | "practical"
  | "homework";

const QUICK_TEMPLATES: Record<
  QuickTemplateKey,
  { label: string; fields: QuickFieldSeed[] }
> = {
  single_overall: {
    label: "Single overall feedback",
    fields: [
      {
        label: "Overall feedback",
        description: "A flexible space for the main feedback message.",
        field_type: "rich_text",
        is_required: true,
        visibility: "student",
        allow_comment_bank: true,
      },
      {
        label: "Teacher notes",
        description: "Private context for the teacher.",
        field_type: "teacher_only_note",
        is_required: false,
        visibility: "teacher",
        allow_comment_bank: false,
      },
    ],
  },
  exam_question: {
    label: "Exam-question feedback",
    fields: [
      {
        label: "Question-by-question feedback",
        field_type: "rich_text",
        is_required: true,
        visibility: "student",
        allow_comment_bank: true,
      },
      {
        label: "Marking focus",
        field_type: "dropdown",
        is_required: false,
        visibility: "student",
        allow_comment_bank: false,
        config: { options: ["Accuracy", "Method", "Explanation", "Timing"] },
      },
      {
        label: "Revision action",
        field_type: "plain_text",
        is_required: false,
        visibility: "student",
        allow_comment_bank: true,
      },
      {
        label: "Internal moderation note",
        field_type: "teacher_only_note",
        is_required: false,
        visibility: "teacher",
        allow_comment_bank: false,
      },
    ],
  },
  coursework: {
    label: "Coursework feedback",
    fields: [
      {
        label: "Draft feedback",
        field_type: "rich_text",
        is_required: true,
        visibility: "student",
        allow_comment_bank: true,
      },
      {
        label: "Evidence to improve",
        field_type: "plain_text",
        is_required: false,
        visibility: "student",
        allow_comment_bank: true,
      },
      {
        label: "Criteria status",
        field_type: "dropdown",
        is_required: false,
        visibility: "student",
        allow_comment_bank: false,
        config: { options: ["Not yet met", "Partly met", "Met", "Exceeded"] },
      },
      {
        label: "Deadline follow-up needed",
        field_type: "tick_box",
        is_required: false,
        visibility: "teacher",
        allow_comment_bank: false,
      },
    ],
  },
  practical: {
    label: "Practical assessment",
    fields: [
      {
        label: "Technique observations",
        field_type: "rich_text",
        is_required: true,
        visibility: "student",
        allow_comment_bank: true,
      },
      {
        label: "Safety and setup",
        field_type: "dropdown",
        is_required: false,
        visibility: "student",
        allow_comment_bank: false,
        config: { options: ["Needs support", "Secure", "Confident"] },
      },
      {
        label: "Result quality",
        field_type: "grade",
        is_required: false,
        visibility: "student",
        allow_comment_bank: false,
        config: { grades: ["Emerging", "Developing", "Secure", "Excellent"] },
      },
      {
        label: "Equipment / room note",
        field_type: "teacher_only_note",
        is_required: false,
        visibility: "teacher",
        allow_comment_bank: false,
      },
    ],
  },
  homework: {
    label: "Homework review",
    fields: [
      {
        label: "Summary feedback",
        field_type: "rich_text",
        is_required: true,
        visibility: "student",
        allow_comment_bank: true,
      },
      {
        label: "Completion check",
        field_type: "dropdown",
        is_required: false,
        visibility: "student",
        allow_comment_bank: false,
        config: { options: ["Incomplete", "Part complete", "Complete"] },
      },
      {
        label: "Follow-up task",
        field_type: "plain_text",
        is_required: false,
        visibility: "student",
        allow_comment_bank: true,
      },
      {
        label: "Parent / tutor note",
        field_type: "teacher_only_note",
        is_required: false,
        visibility: "teacher",
        allow_comment_bank: false,
      },
    ],
  },
};

const FEEDBACK_FIELD_TYPES = Object.keys(
  FEEDBACK_FIELD_TYPE_LABELS,
) as FeedbackFieldType[];

export function FeedbackFieldsEditor({
  templateId,
  initialFields,
}: {
  templateId: string;
  initialFields: AssignmentFeedbackField[];
}) {
  const [fields, setFields] = useState<DraftField[]>(() =>
    withDisplayOrder(
      initialFields
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((field) => ({ ...field, _localId: field.id })),
    ),
  );
  const [expandedId, setExpandedId] = useState<string | null>(
    fields[0]?._localId ?? null,
  );
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveMessage, setSaveMessage] = useState("Saved");
  const [lastSavedSignature, setLastSavedSignature] = useState(() =>
    JSON.stringify(
      toPayload(
        withDisplayOrder(
          initialFields
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((field) => ({ ...field, _localId: field.id })),
        ),
      ),
    ),
  );
  const saveCounter = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const validationErrors = useMemo(() => validateFields(fields), [fields]);
  const payloadSignature = useMemo(
    () => JSON.stringify(toPayload(fields)),
    [fields],
  );
  const canSave = validationErrors.length === 0;
  const displayedSaveState: SaveState = !canSave
    ? "invalid"
    : payloadSignature === lastSavedSignature && saveState !== "saving"
      ? "saved"
      : saveState;
  const displayedSaveMessage = !canSave
    ? validationErrors[0] ?? "Fix validation errors to save"
    : payloadSignature === lastSavedSignature && displayedSaveState === "saved"
      ? "Saved"
      : saveMessage;

  const saveNow = useCallback(
    async (nextFields = fields, mode: "auto" | "manual" = "manual") => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);

      const errors = validateFields(nextFields);
      if (errors.length) {
        setSaveState("invalid");
        setSaveMessage(errors[0]);
        return;
      }

      const signature = JSON.stringify(toPayload(nextFields));
      if (mode === "auto" && signature === lastSavedSignature) return;

      const requestId = saveCounter.current + 1;
      saveCounter.current = requestId;
      setSaveState("saving");
      setSaveMessage("Saving...");

      const result = await saveFeedbackFieldsAction(
        templateId,
        toPayload(nextFields),
      );

      if (requestId !== saveCounter.current) return;
      if (result.error) {
        setSaveState("failed");
        setSaveMessage(result.error);
        return;
      }

      setLastSavedSignature(signature);
      setSaveState("saved");
      setSaveMessage(result.success ?? "Saved");
    },
    [fields, lastSavedSignature, templateId],
  );

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (!canSave || payloadSignature === lastSavedSignature) return;

    debounceTimer.current = setTimeout(() => {
      void saveNow(fields, "auto");
    }, 800);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [
    canSave,
    fields,
    lastSavedSignature,
    payloadSignature,
    saveNow,
  ]);

  function replaceFields(updater: (current: DraftField[]) => DraftField[]) {
    setFields((current) => withDisplayOrder(updater(current)));
  }

  function addField() {
    const created = createFieldFromSeed(
      {
        label: "New feedback field",
        field_type: "plain_text",
        is_required: false,
        visibility: "student",
        allow_comment_bank: true,
      },
      templateId,
      fields,
    );
    replaceFields((current) => [...current, created]);
    setExpandedId(created._localId);
  }

  function updateField(id: string, patch: Partial<DraftField>) {
    replaceFields((current) =>
      current.map((field) =>
        field._localId === id ? normaliseField({ ...field, ...patch }) : field,
      ),
    );
  }

  function updateOrderValue(id: string, sortOrder: number) {
    replaceFields((current) =>
      current
        .map((field) =>
          field._localId === id
            ? { ...field, sort_order: clampSortOrder(sortOrder) }
            : field,
        )
        .sort((a, b) => a.sort_order - b.sort_order),
    );
  }

  function moveField(id: string, direction: -1 | 1) {
    replaceFields((current) => {
      const index = current.findIndex((field) => field._localId === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function deleteField(id: string) {
    const field = fields.find((item) => item._localId === id);
    if (!field) return;
    if (
      !window.confirm(
        `Delete "${field.label || "this field"}"? Existing saved feedback for this field may no longer appear in this template.`,
      )
    ) {
      return;
    }
    replaceFields((current) => current.filter((item) => item._localId !== id));
    if (expandedId === id) {
      const next = fields.filter((item) => item._localId !== id);
      setExpandedId(next[0]?._localId ?? null);
    }
  }

  function duplicateField(id: string) {
    const field = fields.find((item) => item._localId === id);
    if (!field) return;

    const localId = newId();
    const duplicate = normaliseField({
      ...field,
      _localId: localId,
      id: localId,
      field_key: uniqueFieldKey(slugify(`${field.label}_copy`), fields),
      label: `${field.label || "Feedback field"} copy`,
      sort_order: field.sort_order + 1,
      config: cloneConfig(field.config),
    });

    replaceFields((current) => {
      const index = current.findIndex((item) => item._localId === id);
      const next = [...current];
      next.splice(index + 1, 0, duplicate);
      return next;
    });
    setExpandedId(duplicate._localId);
  }

  function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      return;
    }

    replaceFields((current) => {
      const from = current.findIndex((field) => field._localId === draggedId);
      const to = current.findIndex((field) => field._localId === targetId);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDraggedId(null);
  }

  function applyQuickFields(seeds: QuickFieldSeed[]) {
    if (!seeds.length) return;
    const created: DraftField[] = [];
    for (const seed of seeds) {
      created.push(createFieldFromSeed(seed, templateId, [...fields, ...created]));
    }
    replaceFields((current) => [...current, ...created]);
    setExpandedId(created[0]?._localId ?? null);
    setQuickOpen(false);
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>Assignment feedback fields</CardTitle>
          <p className="mt-1 text-sm text-slate-500">
            Build any feedback structure you need. Labels can be renamed, cards
            can be reordered or removed, and there is no fixed Strengths /
            Improvements / Next steps layout.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SaveStatus
            state={displayedSaveState}
            message={displayedSaveMessage}
          />
          {displayedSaveState === "failed" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void saveNow(fields, "manual")}
            >
              Retry
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void saveNow(fields, "manual")}
            disabled={displayedSaveState === "saving" || !canSave}
          >
            Save now
          </Button>
          <Button type="button" size="sm" onClick={addField}>
            + Add field
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setQuickOpen((open) => !open)}
          >
            Quick Generate
          </Button>
        </div>
      </div>

      {validationErrors.length ? (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">Fix these before saving:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {validationErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {displayedSaveState === "failed" ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <span>Save failed: {displayedSaveMessage}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void saveNow(fields, "manual")}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {quickOpen ? (
        <QuickGenerateFields
          onApply={applyQuickFields}
          onClose={() => setQuickOpen(false)}
        />
      ) : null}

      <div className="space-y-3">
        {fields.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
            <p className="text-sm font-medium text-slate-700">
              No feedback fields yet.
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Add a field or use Quick Generate to create a flexible structure.
            </p>
          </div>
        ) : null}

        {fields.map((field, index) => {
          const expanded = expandedId === field._localId;
          return (
            <div
              key={field._localId}
              draggable
              onDragStart={(event) => {
                setDraggedId(field._localId);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", field._localId);
              }}
              onDragEnd={() => setDraggedId(null)}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={() => handleDrop(field._localId)}
              className={cn(
                "rounded-2xl border bg-white shadow-sm transition",
                expanded ? "border-brand-200" : "border-slate-100",
                draggedId === field._localId ? "opacity-50" : "opacity-100",
              )}
            >
              <div className="flex flex-wrap items-start gap-3 px-4 py-3">
                <button
                  type="button"
                  className="mt-1 cursor-grab rounded-lg px-2 py-1 text-xs font-medium text-slate-400 hover:bg-slate-50 hover:text-slate-600 active:cursor-grabbing"
                  title="Drag to reorder"
                  onClick={(event) => event.stopPropagation()}
                >
                  ::
                </button>
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() =>
                    setExpandedId(expanded ? null : field._localId)
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="max-w-full truncate font-medium text-slate-900">
                      {field.label || "Untitled field"}
                    </span>
                    <Badge tone="neutral">
                      {FEEDBACK_FIELD_TYPE_LABELS[field.field_type]}
                    </Badge>
                    <Badge tone={field.student_visible ? "success" : "warning"}>
                      {field.student_visible
                        ? "Student-visible"
                        : "Teacher-only"}
                    </Badge>
                    <Badge tone={field.is_required ? "brand" : "neutral"}>
                      {field.is_required ? "Required" : "Optional"}
                    </Badge>
                    <Badge tone={field.allow_comment_bank ? "brand" : "neutral"}>
                      {field.allow_comment_bank ? "Bank on" : "No bank"}
                    </Badge>
                    <Badge tone={field.tracks_completion ? "success" : "neutral"}>
                      {field.tracks_completion
                        ? "Tracks completion"
                        : "No completion"}
                    </Badge>
                    <Badge tone="neutral">
                      #{index + 1} / order {field.sort_order}
                    </Badge>
                  </div>
                  {field.description ? (
                    <p className="mt-1 line-clamp-1 text-sm text-slate-500">
                      {field.description}
                    </p>
                  ) : null}
                </button>
                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => moveField(field._localId, -1)}
                    disabled={index === 0}
                  >
                    Up
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => moveField(field._localId, 1)}
                    disabled={index === fields.length - 1}
                  >
                    Down
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => duplicateField(field._localId)}
                  >
                    Duplicate
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    onClick={() => deleteField(field._localId)}
                  >
                    Delete
                  </Button>
                </div>
              </div>

              {expanded ? (
                <FieldSettings
                  field={field}
                  index={index}
                  onChange={(patch) => updateField(field._localId, patch)}
                  onOrderChange={(sortOrder) =>
                    updateOrderValue(field._localId, sortOrder)
                  }
                />
              ) : null}
            </div>
          );
        })}

        <button
          type="button"
          onClick={addField}
          className="w-full rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
        >
          + Add another feedback field
        </button>
      </div>
    </Card>
  );
}

function FieldSettings({
  field,
  index,
  onChange,
  onOrderChange,
}: {
  field: DraftField;
  index: number;
  onChange: (patch: Partial<DraftField>) => void;
  onOrderChange: (sortOrder: number) => void;
}) {
  const optionText = fieldOptions(field).join("\n");

  return (
    <div className="border-t border-slate-100 px-4 pb-4 pt-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Label
          </span>
          <Input
            value={field.label}
            onChange={(event) => onChange({ label: event.target.value })}
            placeholder="Feedback field label"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Field type
          </span>
          <select
            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            value={field.field_type}
            onChange={(event) =>
              onChange({
                field_type: event.target.value as FeedbackFieldType,
                config: defaultConfigForType(
                  event.target.value as FeedbackFieldType,
                  field.config,
                ),
              })
            }
          >
            {FEEDBACK_FIELD_TYPES.map((type) => (
              <option key={type} value={type}>
                {FEEDBACK_FIELD_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-xs font-medium text-slate-500">
          Description
        </span>
        <Textarea
          value={field.description ?? ""}
          onChange={(event) => onChange({ description: event.target.value })}
          className="min-h-20"
          placeholder="Optional prompt or guidance shown with this field"
        />
      </label>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Checkbox
          label="Required"
          checked={field.is_required}
          onChange={(is_required) => onChange({ is_required })}
        />
        <Checkbox
          label="Student visible"
          checked={field.student_visible}
          disabled={field.teacher_only}
          onChange={(student_visible) =>
            onChange({
              student_visible,
              teacher_only: student_visible ? false : true,
              allow_comment_bank: student_visible
                ? field.allow_comment_bank
                : false,
            })
          }
        />
        <Checkbox
          label="Teacher-only"
          checked={field.teacher_only}
          onChange={(teacher_only) =>
            onChange({
              teacher_only,
              student_visible: teacher_only ? false : true,
              allow_comment_bank: teacher_only
                ? false
                : field.allow_comment_bank,
            })
          }
        />
        <Checkbox
          label="Track completion"
          checked={field.tracks_completion}
          onChange={(tracks_completion) => onChange({ tracks_completion })}
        />
        <Checkbox
          label="Comment-bank insertion"
          checked={field.allow_comment_bank}
          disabled={field.teacher_only}
          onChange={(allow_comment_bank) => onChange({ allow_comment_bank })}
        />
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Max length
          </span>
          <Input
            type="number"
            min={1}
            max={20000}
            value={field.max_length ?? ""}
            onChange={(event) =>
              onChange({
                max_length: event.target.value
                  ? Number(event.target.value)
                  : null,
              })
            }
            placeholder="No limit"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Display order
          </span>
          <Input
            type="number"
            min={0}
            max={10000}
            value={field.sort_order}
            onChange={(event) => onOrderChange(Number(event.target.value) || 0)}
          />
          <span className="mt-1 block text-xs text-slate-400">
            Currently shown as card #{index + 1}
          </span>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Field key
          </span>
          <Input
            value={field.field_key}
            onChange={(event) =>
              onChange({ field_key: slugify(event.target.value) })
            }
          />
        </label>
      </div>

      {field.field_type === "dropdown" || field.field_type === "grade" ? (
        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            {field.field_type === "grade" ? "Grade options" : "Dropdown options"}{" "}
            (one per line)
          </span>
          <Textarea
            value={optionText}
            onChange={(event) => {
              const options = event.target.value
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean);
              onChange({
                config:
                  field.field_type === "grade"
                    ? { ...field.config, grades: options, options: undefined }
                    : { ...field.config, options, grades: undefined },
              });
            }}
            className="min-h-24"
          />
        </label>
      ) : null}
    </div>
  );
}

function QuickGenerateFields({
  onApply,
  onClose,
}: {
  onApply: (fields: QuickFieldSeed[]) => void;
  onClose: () => void;
}) {
  const [template, setTemplate] = useState<QuickTemplateKey>("single_overall");
  const [includeTemplate, setIncludeTemplate] = useState(true);
  const [pastedRows, setPastedRows] = useState("");
  const [preview, setPreview] = useState<QuickFieldSeed[]>([]);
  const [error, setError] = useState<string | null>(null);

  function buildPreview() {
    const next: QuickFieldSeed[] = [];
    if (includeTemplate) {
      next.push(...QUICK_TEMPLATES[template].fields.map((field) => ({ ...field })));
    }
    const parsed = parseQuickRows(pastedRows);
    next.push(...parsed.fields);
    setPreview(next);
    setError(parsed.error);
  }

  return (
    <div className="rounded-2xl border border-brand-100 bg-brand-50/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold text-slate-900">Quick Generate fields</h4>
          <p className="mt-1 text-sm text-slate-600">
            Starters are examples only. Preview them, then apply, rename,
            reorder, duplicate, or remove anything.
          </p>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Template starter
            </span>
            <select
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              value={template}
              onChange={(event) =>
                setTemplate(event.target.value as QuickTemplateKey)
              }
            >
              {Object.entries(QUICK_TEMPLATES).map(([key, item]) => (
                <option key={key} value={key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <Checkbox
            label="Include selected template in preview"
            checked={includeTemplate}
            onChange={setIncludeTemplate}
          />
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Paste/add rows
          </span>
          <Textarea
            value={pastedRows}
            onChange={(event) => setPastedRows(event.target.value)}
            className="min-h-28"
            placeholder="One field per row: Label | type | required|optional | student|teacher | bank|nobank"
          />
          <span className="mt-1 block text-xs text-slate-500">
            Example: Marking summary | rich_text | required | student | bank
          </span>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={buildPreview}>
          Preview fields
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => onApply(preview)}
          disabled={!preview.length || Boolean(error)}
        >
          Apply preview
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setPreview([]);
            setError(null);
          }}
        >
          Clear preview
        </Button>
      </div>

      {error ? (
        <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {error}
        </p>
      ) : null}

      {preview.length ? (
        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-100 bg-white">
          <div className="grid grid-cols-[1fr_130px_100px_110px_90px] gap-2 border-b border-slate-100 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            <span>Label</span>
            <span>Type</span>
            <span>Required</span>
            <span>Visibility</span>
            <span>Bank</span>
          </div>
          {preview.map((field, index) => (
            <div
              key={`${field.label}-${index}`}
              className="grid grid-cols-[1fr_130px_100px_110px_90px] gap-2 px-3 py-2 text-sm text-slate-700 odd:bg-slate-50/70"
            >
              <span className="truncate">{field.label}</span>
              <span>{FEEDBACK_FIELD_TYPE_LABELS[field.field_type]}</span>
              <span>{field.is_required ? "Required" : "Optional"}</span>
              <span>
                {field.visibility === "student" ? "Student" : "Teacher"}
              </span>
              <span>{field.allow_comment_bank ? "Bank" : "No bank"}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SaveStatus({
  state,
  message,
}: {
  state: SaveState;
  message: string;
}) {
  const label =
    state === "saving"
      ? "Saving"
      : state === "failed"
        ? "Save failed"
        : state === "invalid"
          ? "Needs fixes"
          : "Saved";
  return (
    <Badge
      tone={
        state === "failed"
          ? "danger"
          : state === "invalid"
            ? "warning"
            : state === "saving"
              ? "brand"
              : "success"
      }
      title={message}
    >
      {label}
    </Badge>
  );
}

function Checkbox({
  label,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-2xl border border-slate-100 bg-white px-3 text-sm text-slate-700",
        disabled && "opacity-60",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="rounded border-slate-300"
      />
      {label}
    </label>
  );
}

function withDisplayOrder(fields: DraftField[]) {
  return fields.map((field, index) => ({
    ...field,
    sort_order: (index + 1) * 10,
  }));
}

function normaliseField(field: DraftField): DraftField {
  if (
    field.field_type === "teacher_only_note" ||
    field.teacher_only ||
    !field.student_visible
  ) {
    return {
      ...field,
      teacher_only: true,
      student_visible: false,
      allow_comment_bank: false,
    };
  }
  return field;
}

function createFieldFromSeed(
  seed: QuickFieldSeed,
  templateId: string,
  existing: Array<Pick<DraftField, "field_key">>,
): DraftField {
  const localId = newId();
  const teacherOnly =
    seed.visibility === "teacher" || seed.field_type === "teacher_only_note";
  return normaliseField({
    _localId: localId,
    id: localId,
    template_id: templateId,
    field_key: uniqueFieldKey(slugify(seed.label), existing),
    label: seed.label,
    description: seed.description ?? "",
    field_type: seed.field_type,
    sort_order: 0,
    is_required: seed.is_required,
    student_visible: !teacherOnly,
    teacher_only: teacherOnly,
    max_length: defaultMaxLength(seed.field_type),
    tracks_completion: !teacherOnly,
    allow_comment_bank: teacherOnly ? false : seed.allow_comment_bank,
    config: defaultConfigForType(seed.field_type, seed.config ?? {}),
  });
}

function toPayload(fields: DraftField[]) {
  return fields.map((field, index) => ({
    id: field.id.startsWith("legacy-") ? undefined : field.id,
    field_key: field.field_key,
    label: field.label,
    description: field.description || null,
    field_type: field.field_type,
    sort_order: field.sort_order || (index + 1) * 10,
    is_required: field.is_required,
    student_visible: field.teacher_only ? false : field.student_visible,
    teacher_only: field.teacher_only,
    max_length: field.max_length,
    tracks_completion: field.tracks_completion,
    allow_comment_bank: field.teacher_only ? false : field.allow_comment_bank,
    config: field.config ?? {},
  }));
}

function validateFields(fields: DraftField[]) {
  const errors: string[] = [];
  const keys = new Map<string, number>();

  fields.forEach((field, index) => {
    const label = field.label.trim();
    if (!label) errors.push(`Field #${index + 1} needs a label.`);
    if (label.length > 120) {
      errors.push(`${label || `Field #${index + 1}`}: label is too long.`);
    }
    if (!/^[a-z][a-z0-9_]*$/.test(field.field_key)) {
      errors.push(
        `${label || `Field #${index + 1}`}: field key must be snake_case starting with a letter.`,
      );
    }
    if (field.max_length != null && (field.max_length < 1 || field.max_length > 20000)) {
      errors.push(`${label || `Field #${index + 1}`}: max length must be 1-20000.`);
    }
    keys.set(field.field_key, (keys.get(field.field_key) ?? 0) + 1);
  });

  for (const [key, count] of keys.entries()) {
    if (count > 1) errors.push(`Field key "${key}" is used more than once.`);
  }

  return errors;
}

function parseQuickRows(raw: string): {
  fields: QuickFieldSeed[];
  error: string | null;
} {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const fields: QuickFieldSeed[] = [];

  for (const [index, line] of lines.entries()) {
    const parts = line.split("|").map((part) => part.trim());
    const label = parts[0];
    if (!label) {
      return { fields, error: `Row ${index + 1} needs a label.` };
    }

    const fieldType = parseFieldType(parts[1]);
    if (!fieldType) {
      return {
        fields,
        error: `Row ${index + 1}: unknown field type "${parts[1] || ""}".`,
      };
    }

    const requirement = (parts[2] || "optional").toLowerCase();
    const visibility = (parts[3] || "student").toLowerCase();
    const bank = (parts[4] || "bank").toLowerCase();
    const teacherOnly =
      visibility === "teacher" || fieldType === "teacher_only_note";

    fields.push({
      label,
      field_type: fieldType,
      is_required: requirement === "required" || requirement === "req",
      visibility: teacherOnly ? "teacher" : "student",
      allow_comment_bank: !teacherOnly && bank !== "nobank" && bank !== "no bank",
      config: defaultConfigForType(fieldType, {}),
    });
  }

  return { fields, error: null };
}

function parseFieldType(value: string | undefined): FeedbackFieldType | null {
  const normalised = (value || "rich_text")
    .toLowerCase()
    .replace(/[-\s]+/g, "_");
  const aliases: Record<string, FeedbackFieldType> = {
    text: "rich_text",
    rich: "rich_text",
    rich_text: "rich_text",
    plain: "plain_text",
    plain_text: "plain_text",
    number: "numeric_score",
    numeric: "numeric_score",
    numeric_score: "numeric_score",
    score: "numeric_score",
    grade: "grade",
    tick: "tick_box",
    checkbox: "tick_box",
    tick_box: "tick_box",
    dropdown: "dropdown",
    select: "dropdown",
    rubric: "rubric",
    bank_selector: "comment_bank_selector",
    comment_bank_selector: "comment_bank_selector",
    teacher: "teacher_only_note",
    teacher_only: "teacher_only_note",
    teacher_only_note: "teacher_only_note",
  };

  return aliases[normalised] ?? null;
}

function defaultMaxLength(type: FeedbackFieldType) {
  return type === "tick_box" || type === "numeric_score" || type === "dropdown"
    ? null
    : 5000;
}

function defaultConfigForType(
  type: FeedbackFieldType,
  current: FeedbackFieldConfig,
): FeedbackFieldConfig {
  if (type === "dropdown") {
    return {
      ...current,
      options: current.options?.length ? current.options : ["Option 1", "Option 2"],
      grades: undefined,
    };
  }
  if (type === "grade") {
    return {
      ...current,
      grades: current.grades?.length ? current.grades : ["A", "B", "C", "D"],
      options: undefined,
    };
  }
  return { ...current, options: undefined, grades: undefined };
}

function fieldOptions(field: DraftField) {
  if (field.field_type === "grade") return field.config.grades ?? [];
  if (field.field_type === "dropdown") return field.config.options ?? [];
  return [];
}

function cloneConfig(config: FeedbackFieldConfig): FeedbackFieldConfig {
  return {
    ...config,
    options: config.options ? [...config.options] : undefined,
    grades: config.grades ? [...config.grades] : undefined,
    rubric_criteria: config.rubric_criteria
      ? config.rubric_criteria.map((criterion) => ({ ...criterion }))
      : undefined,
  };
}

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  return /^[a-z]/.test(slug) ? slug : `field_${slug || "feedback"}`;
}

function uniqueFieldKey(
  baseKey: string,
  existing: Array<Pick<DraftField, "field_key">>,
) {
  const used = new Set(existing.map((field) => field.field_key));
  let key = baseKey || "feedback_field";
  let index = 2;
  while (used.has(key)) {
    key = `${baseKey}_${index}`;
    index += 1;
  }
  return key;
}

function clampSortOrder(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(10000, Math.round(value)));
}
