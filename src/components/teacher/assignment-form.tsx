"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveAssignmentAction } from "@/lib/actions/teacher";
import type { ActionResult } from "@/lib/actions/auth";
import type { Assignment } from "@/lib/types";

const initial: ActionResult = {};

function toLocalInput(value: string | null) {
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

  return (
    <form action={action} className="space-y-4">
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
      <label className="block text-sm">
        <span className="mb-1.5 block text-slate-500">Class</span>
        <select
          name="class_id"
          required
          defaultValue={assignment?.class_id ?? ""}
          className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
        >
          <option value="" disabled>
            Select class
          </option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-slate-500">Title</span>
        <Input name="title" required defaultValue={assignment?.title} />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-slate-500">Instructions</span>
        <Textarea
          name="instructions"
          className="min-h-40"
          defaultValue={assignment?.instructions}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1.5 block text-slate-500">Due date</span>
          <Input
            type="datetime-local"
            name="due_at"
            defaultValue={toLocalInput(assignment?.due_at ?? null)}
          />
        </label>
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
      </div>
      <label className="block text-sm">
        <span className="mb-1.5 block text-slate-500">Status</span>
        <select
          name="status"
          defaultValue={assignment?.status ?? "draft"}
          className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
        >
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </label>
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
      <Button type="submit" disabled={pending || classes.length === 0}>
        {pending ? "Saving…" : assignment ? "Save assignment" : "Create assignment"}
      </Button>
    </form>
  );
}
