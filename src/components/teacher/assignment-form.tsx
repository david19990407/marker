"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveAssignmentAction } from "@/lib/actions/teacher";
import type { ActionResult } from "@/lib/actions/auth";
import { formatMarkLabel } from "@/lib/homework/marks";
import type { Assignment } from "@/lib/types";

const initial: ActionResult = {};

function toLocalInput(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AssignmentForm({
  classes,
  assignment,
}: {
  classes: { id: string; name: string }[];
  assignment?: Assignment;
}) {
  const bound = saveAssignmentAction.bind(null, assignment?.id ?? null);
  const [state, action, pending] = useActionState(bound, initial);

  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [perClassMode, setPerClassMode] = useState(false);
  const [perClassDates, setPerClassDates] = useState<Record<string, string>>({});
  const [scheduleRelease, setScheduleRelease] = useState(
    Boolean(assignment?.release_at),
  );
  const [showTemplateWarning, setShowTemplateWarning] = useState(false);

  const isEditing = Boolean(assignment);

  const toggleClass = (classId: string) => {
    setSelectedClassIds((prev) =>
      prev.includes(classId)
        ? prev.filter((id) => id !== classId)
        : [...prev, classId],
    );
  };

  return (
    <form action={action} className="space-y-5">
      {state.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </div>
      ) : null}
      {state.success ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {state.success}
        </div>
      ) : null}

      {isEditing ? (
        <>
          <input type="hidden" name="class_id" value={assignment!.class_id} />
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Editing deployment for{" "}
            <span className="font-medium text-slate-800">
              {classes.find((c) => c.id === assignment!.class_id)?.name ?? "Class"}
            </span>
            . Question marks are calculated in the homework builder.
          </div>
        </>
      ) : (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-slate-500">
              Classes ({selectedClassIds.length} selected)
            </span>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => setSelectedClassIds(classes.map((c) => c.id))}
                className="text-brand-600 hover:underline"
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setSelectedClassIds([])}
                className="text-slate-400 hover:underline"
              >
                None
              </button>
            </div>
          </div>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-2xl border border-slate-200 p-2">
            {classes.length === 0 ? (
              <p className="px-2 py-1 text-sm text-slate-400">No classes available</p>
            ) : (
              classes.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    name="class_ids"
                    value={c.id}
                    checked={selectedClassIds.includes(c.id)}
                    onChange={() => toggleClass(c.id)}
                    className="accent-brand-600"
                  />
                  {c.name}
                </label>
              ))
            )}
          </div>
        </div>
      )}

      <label className="block text-sm">
        <span className="mb-1.5 block text-slate-500">Title</span>
        <Input name="title" required defaultValue={assignment?.title} />
      </label>

      <label className="block text-sm">
        <span className="mb-1.5 block text-slate-500">Brief overview</span>
        <Textarea
          name="instructions"
          className="min-h-28"
          placeholder="Short overview for students (optional). Build the full worksheet next."
          defaultValue={assignment?.instructions}
        />
      </label>

      {/* Calculated marks — not primary source of truth on create */}
      <input type="hidden" name="maximum_mark" value={assignment?.maximum_mark ?? 0} />
      <input type="hidden" name="allow_text_submission" value="true" />
      <input type="hidden" name="allow_file_submission" value="true" />

      {isEditing && assignment?.template_id ? (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="update_template"
              checked={showTemplateWarning}
              onChange={(e) => setShowTemplateWarning(e.target.checked)}
              className="mt-0.5 accent-amber-600"
            />
            <span>
              Sync title and overview to all linked class deployments for this
              homework
            </span>
          </label>
        </div>
      ) : null}

      {!isEditing && perClassMode ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">Per-class due dates</p>
          {selectedClassIds.map((classId) => {
            const className = classes.find((c) => c.id === classId)?.name ?? classId;
            return (
              <label key={classId} className="block text-sm">
                <span className="mb-1 block text-slate-500">{className}</span>
                <Input
                  type="datetime-local"
                  value={perClassDates[classId] ?? ""}
                  onChange={(e) =>
                    setPerClassDates((prev) => ({
                      ...prev,
                      [classId]: e.target.value,
                    }))
                  }
                />
              </label>
            );
          })}
          <input
            type="hidden"
            name="per_class_due_at_json"
            value={JSON.stringify(
              Object.fromEntries(
                Object.entries(perClassDates)
                  .filter(([, v]) => v)
                  .map(([k, v]) => [k, new Date(v).toISOString()]),
              ),
            )}
          />
        </div>
      ) : (
        <label className="block text-sm">
          <span className="mb-1.5 block text-slate-500">Due date</span>
          <Input
            type="datetime-local"
            name="due_at"
            defaultValue={toLocalInput(assignment?.due_at)}
          />
        </label>
      )}

      {!isEditing && selectedClassIds.length > 1 ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={perClassMode}
            onChange={(e) => setPerClassMode(e.target.checked)}
            className="accent-brand-600"
          />
          <span className="text-slate-600">Set different due dates per class</span>
        </label>
      ) : null}

      {/* Status is managed by Publish homework — never a manual dropdown. */}
      <input
        type="hidden"
        name="status"
        value={assignment?.status ?? "draft"}
      />
      <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Status:{" "}
        <span className="font-medium text-slate-900">
          {assignment?.status === "published"
            ? "Published"
            : assignment?.status === "archived"
              ? "Archived"
              : "Draft"}
        </span>
        . Use <span className="font-medium">Publish homework</span> in Homework
        Studio when the worksheet is ready.
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={scheduleRelease}
          onChange={(e) => setScheduleRelease(e.target.checked)}
          className="accent-brand-600"
        />
        <span className="text-slate-600">Schedule release date</span>
      </label>
      {scheduleRelease ? (
        <label className="block text-sm">
          <span className="mb-1.5 block text-slate-500">Release date</span>
          <Input
            type="datetime-local"
            name="release_at"
            defaultValue={toLocalInput(assignment?.release_at)}
          />
        </label>
      ) : (
        <input
          type="hidden"
          name="release_at"
          value={assignment?.release_at ? toLocalInput(assignment.release_at) : ""}
        />
      )}

      {isEditing ? (
        <p className="text-xs text-slate-500">
          Maximum mark is calculated from questions in the homework builder
          {assignment?.maximum_mark != null
            ? ` (currently ${formatMarkLabel(Number(assignment.maximum_mark))}).`
            : "."}
        </p>
      ) : (
        <p className="text-xs text-slate-500">
          Total marks are calculated automatically from the questions you add in the
          builder.
        </p>
      )}

      <Button
        type="submit"
        disabled={
          pending ||
          (!isEditing && (classes.length === 0 || selectedClassIds.length === 0))
        }
      >
        {pending
          ? "Saving…"
          : assignment
            ? "Save details"
            : "Create and build homework"}
      </Button>

      {!isEditing && selectedClassIds.length === 0 && classes.length > 0 ? (
        <p className="text-sm text-amber-700">Select at least one class</p>
      ) : null}
    </form>
  );
}
