"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveAssignmentAction } from "@/lib/actions/teacher";
import type { ActionResult } from "@/lib/actions/auth";
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

  // Multi-class create state
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [perClassMode, setPerClassMode] = useState(false);
  const [perClassDates, setPerClassDates] = useState<Record<string, string>>({});
  const [scheduleRelease, setScheduleRelease] = useState(false);
  const [showTemplateWarning, setShowTemplateWarning] = useState(false);

  const isEditing = Boolean(assignment);

  const toggleClass = (classId: string) => {
    setSelectedClassIds((prev) =>
      prev.includes(classId)
        ? prev.filter((id) => id !== classId)
        : [...prev, classId],
    );
  };

  const selectAll = () =>
    setSelectedClassIds(classes.map((c) => c.id));

  const clearAll = () => setSelectedClassIds([]);

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

      {/* Class selection */}
      {isEditing ? (
        <>
          <input type="hidden" name="class_id" value={assignment!.class_id} />
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Editing a single class deployment.{" "}
            <span className="font-medium text-slate-800">
              {classes.find((c) => c.id === assignment!.class_id)?.name ??
                "Class"}
            </span>
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
                onClick={selectAll}
                className="text-brand-600 hover:underline"
              >
                All
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="text-slate-400 hover:underline"
              >
                None
              </button>
            </div>
          </div>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-2xl border border-slate-200 p-2">
            {classes.length === 0 ? (
              <p className="px-2 py-1 text-sm text-slate-400">
                No classes available
              </p>
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
              Sync title, instructions and submission settings to all linked
              deployments (other classes sharing this assignment template)
            </span>
          </label>
        </div>
      ) : null}

      <label className="block text-sm">
        <span className="mb-1.5 block text-slate-500">Instructions</span>
        <Textarea
          name="instructions"
          className="min-h-40"
          defaultValue={assignment?.instructions}
        />
      </label>

      {/* Due dates */}
      {!isEditing && perClassMode ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">Per-class due dates</p>
          {selectedClassIds.length === 0 ? (
            <p className="text-sm text-slate-400">Select classes above first</p>
          ) : (
            selectedClassIds.map((classId) => {
              const className =
                classes.find((c) => c.id === classId)?.name ?? classId;
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
            })
          )}
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
          <span className="text-slate-600">
            Set different due dates per class
          </span>
        </label>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1.5 block text-slate-500">Maximum mark</span>
          <Input
            type="number"
            name="maximum_mark"
            min={1}
            step="0.5"
            defaultValue={assignment?.maximum_mark ?? 30}
            required
          />
        </label>
        <label className="text-sm">
          <span className="mb-1.5 block text-slate-500">Status</span>
          <select
            name="status"
            defaultValue={assignment?.status ?? "draft"}
            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            {isEditing ? <option value="archived">Archived</option> : null}
          </select>
        </label>
      </div>

      {/* Schedule release */}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={scheduleRelease}
          onChange={(e) => setScheduleRelease(e.target.checked)}
          className="accent-brand-600"
        />
        <span className="text-slate-600">Schedule publishing (release at)</span>
      </label>
      {scheduleRelease ? (
        <label className="block text-sm">
          <span className="mb-1.5 block text-slate-500">Release at</span>
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
          value={
            assignment?.release_at ? toLocalInput(assignment.release_at) : ""
          }
        />
      )}

      <div className="space-y-2 rounded-2xl border border-slate-100 p-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="allow_text_submission"
            defaultChecked={assignment?.allow_text_submission ?? true}
          />
          Allow written response
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="allow_file_submission"
            defaultChecked={assignment?.allow_file_submission ?? true}
          />
          Allow file upload (PDF/DOCX)
        </label>
      </div>

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
            ? "Save assignment"
            : "Create assignment"}
      </Button>

      {!isEditing && selectedClassIds.length === 0 && classes.length > 0 ? (
        <p className="text-sm text-amber-700">Select at least one class</p>
      ) : null}
    </form>
  );
}
