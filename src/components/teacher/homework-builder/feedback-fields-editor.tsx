"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveFeedbackFieldsAction } from "@/lib/actions/feedback-fields";
import { newId } from "@/lib/homework/structure";
import {
  FEEDBACK_FIELD_TYPE_LABELS,
  type AssignmentFeedbackField,
  type FeedbackFieldType,
} from "@/lib/feedback/types";

type DraftField = AssignmentFeedbackField & { _localId: string };

export function FeedbackFieldsEditor({
  templateId,
  initialFields,
}: {
  templateId: string;
  initialFields: AssignmentFeedbackField[];
}) {
  const [fields, setFields] = useState<DraftField[]>(() =>
    initialFields.map((field) => ({ ...field, _localId: field.id })),
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    fields[0]?._localId ?? null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = useMemo(
    () => fields.find((f) => f._localId === selectedId) ?? fields[0] ?? null,
    [fields, selectedId],
  );

  function addField() {
    const localId = newId();
    const created: DraftField = {
      _localId: localId,
      id: localId,
      template_id: templateId,
      field_key: `custom_${fields.length + 1}`,
      label: "New feedback field",
      description: "",
      field_type: "plain_text",
      sort_order: (fields.at(-1)?.sort_order ?? 0) + 10,
      is_required: false,
      student_visible: true,
      teacher_only: false,
      max_length: 5000,
      tracks_completion: true,
      allow_comment_bank: true,
      config: {},
    };
    setFields((prev) => [...prev, created]);
    setSelectedId(localId);
  }

  function updateSelected(patch: Partial<DraftField>) {
    if (!selected) return;
    setFields((prev) =>
      prev.map((field) =>
        field._localId === selected._localId
          ? {
              ...field,
              ...patch,
              ...(patch.field_type === "teacher_only_note"
                ? {
                    teacher_only: true,
                    student_visible: false,
                    allow_comment_bank: false,
                  }
                : {}),
              ...(patch.teacher_only
                ? { student_visible: false }
                : {}),
            }
          : field,
      ),
    );
  }

  function removeSelected() {
    if (!selected) return;
    if (
      ["strengths", "improvements", "next_steps", "private_notes"].includes(
        selected.field_key,
      )
    ) {
      setMessage("Classic migrated fields cannot be deleted — hide or rename instead.");
      return;
    }
    const next = fields.filter((f) => f._localId !== selected._localId);
    setFields(next);
    setSelectedId(next[0]?._localId ?? null);
  }

  function save() {
    startTransition(async () => {
      const payload = fields.map((field, index) => ({
        id: field.id.startsWith("legacy-") ? undefined : field.id,
        field_key: field.field_key,
        label: field.label,
        description: field.description,
        field_type: field.field_type,
        sort_order: field.sort_order || (index + 1) * 10,
        is_required: field.is_required,
        student_visible: field.student_visible,
        teacher_only: field.teacher_only,
        max_length: field.max_length,
        tracks_completion: field.tracks_completion,
        allow_comment_bank: field.allow_comment_bank,
        config: field.config ?? {},
      }));
      const result = await saveFeedbackFieldsAction(templateId, payload);
      setMessage(result.error ?? result.success ?? null);
    });
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <CardTitle>Assignment feedback fields</CardTitle>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={addField}>
            Add field
          </Button>
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save fields"}
          </Button>
        </div>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        Define the feedback structure for this assignment. Labels are flexible —
        Strengths / Improvements / Next steps are only defaults migrated from
        existing work.
      </p>
      {message ? (
        <p className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          {message}
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <ul className="space-y-1">
          {fields.map((field) => (
            <li key={field._localId}>
              <button
                type="button"
                className={`w-full rounded-xl px-3 py-2 text-left text-sm ${
                  selected?._localId === field._localId
                    ? "bg-brand-50 text-brand-800"
                    : "hover:bg-slate-50"
                }`}
                onClick={() => setSelectedId(field._localId)}
              >
                {field.label}
              </button>
            </li>
          ))}
        </ul>
        {selected ? (
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-500">Label</span>
              <Input
                value={selected.label}
                onChange={(e) => updateSelected({ label: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-500">Field key</span>
              <Input
                value={selected.field_key}
                onChange={(e) =>
                  updateSelected({
                    field_key: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9_]/g, "_"),
                  })
                }
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-500">Description</span>
              <Textarea
                value={selected.description ?? ""}
                onChange={(e) => updateSelected({ description: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-500">Type</span>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={selected.field_type}
                onChange={(e) =>
                  updateSelected({
                    field_type: e.target.value as FeedbackFieldType,
                  })
                }
              >
                {Object.entries(FEEDBACK_FIELD_TYPE_LABELS).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.is_required}
                  onChange={(e) =>
                    updateSelected({ is_required: e.target.checked })
                  }
                />
                Required
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.student_visible}
                  disabled={selected.teacher_only}
                  onChange={(e) =>
                    updateSelected({ student_visible: e.target.checked })
                  }
                />
                Student visible
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.teacher_only}
                  onChange={(e) =>
                    updateSelected({
                      teacher_only: e.target.checked,
                      student_visible: e.target.checked
                        ? false
                        : selected.student_visible,
                    })
                  }
                />
                Teacher only
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.tracks_completion}
                  onChange={(e) =>
                    updateSelected({ tracks_completion: e.target.checked })
                  }
                />
                Track completion
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.allow_comment_bank}
                  disabled={selected.teacher_only}
                  onChange={(e) =>
                    updateSelected({ allow_comment_bank: e.target.checked })
                  }
                />
                Comment-bank insertion
              </label>
              <label className="block">
                <span className="mb-1 block text-slate-500">Max length</span>
                <Input
                  type="number"
                  min={1}
                  value={selected.max_length ?? ""}
                  onChange={(e) =>
                    updateSelected({
                      max_length: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-slate-500">Order</span>
                <Input
                  type="number"
                  value={selected.sort_order}
                  onChange={(e) =>
                    updateSelected({ sort_order: Number(e.target.value) || 0 })
                  }
                />
              </label>
            </div>
            {(selected.field_type === "dropdown" ||
              selected.field_type === "grade") && (
              <label className="block text-sm">
                <span className="mb-1 block text-slate-500">
                  Options (one per line)
                </span>
                <Textarea
                  value={(
                    selected.config.options ??
                    selected.config.grades ??
                    []
                  ).join("\n")}
                  onChange={(e) => {
                    const options = e.target.value
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean);
                    updateSelected({
                      config: {
                        ...selected.config,
                        options,
                        grades:
                          selected.field_type === "grade" ? options : undefined,
                      },
                    });
                  }}
                />
              </label>
            )}
            <Button type="button" variant="outline" onClick={removeSelected}>
              Remove field
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
