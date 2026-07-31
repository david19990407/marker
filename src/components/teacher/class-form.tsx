"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createTeacherClassAction,
  updateTeacherClassAction,
} from "@/lib/actions/teacher";
import type { ActionResult } from "@/lib/actions/auth";

const initial: ActionResult = {};

export function TeacherClassForm({
  classId,
  defaults,
  subjects,
  yearGroups,
  colours = [],
}: {
  classId?: string;
  defaults?: {
    name: string;
    subject: string;
    year_group: string | null;
    colour_hex?: string | null;
  };
  subjects: string[];
  yearGroups: string[];
  colours?: { name: string; hex: string }[];
}) {
  const actionFn = classId
    ? updateTeacherClassAction.bind(null, classId)
    : createTeacherClassAction;
  const [state, action, pending] = useActionState(actionFn, initial);
  const subjectOptions =
    defaults?.subject && !subjects.includes(defaults.subject)
      ? [defaults.subject, ...subjects]
      : subjects;
  const yearOptions =
    defaults?.year_group && !yearGroups.includes(defaults.year_group)
      ? [defaults.year_group, ...yearGroups]
      : yearGroups;

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
        <span className="mb-1.5 block text-slate-500">Class name</span>
        <Input name="name" required defaultValue={defaults?.name} />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-slate-500">Subject</span>
        <select
          name="subject"
          required
          defaultValue={defaults?.subject ?? subjectOptions[0] ?? ""}
          className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
        >
          {subjectOptions.length === 0 ? (
            <option value="" disabled>
              No active subjects configured
            </option>
          ) : null}
          {subjectOptions.map((subject) => (
            <option key={subject} value={subject}>
              {subject}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-slate-500">Year group</span>
        <select
          name="year_group"
          defaultValue={defaults?.year_group ?? ""}
          className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
        >
          <option value="">—</option>
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
      {colours.length > 0 ? (
        <label className="block text-sm">
          <span className="mb-1.5 block text-slate-500">Class colour</span>
          <select
            name="colour_hex"
            defaultValue={defaults?.colour_hex ?? colours[0]?.hex ?? ""}
            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
          >
            {colours.map((c) => (
              <option key={c.hex} value={c.hex}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <Button
        type="submit"
        disabled={pending || (!classId && subjectOptions.length === 0)}
      >
        {pending ? "Saving…" : classId ? "Save changes" : "Create class"}
      </Button>
      {!classId && subjectOptions.length === 0 ? (
        <p className="text-sm text-amber-700">
          Ask an administrator to add an active subject before creating a class.
        </p>
      ) : null}
    </form>
  );
}
