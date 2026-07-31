"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClassAction } from "@/lib/actions/admin";
import type { ActionResult } from "@/lib/actions/auth";

const initial: ActionResult = {};

export function CreateClassForm({
  teachers,
  subjects,
  yearGroups,
  colours = [],
}: {
  teachers: { id: string; display_name: string }[];
  subjects: string[];
  yearGroups: string[];
  colours?: { name: string; hex: string }[];
}) {
  const [state, action, pending] = useActionState(createClassAction, initial);

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
        <Input name="name" required placeholder="11A English" />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-slate-500">Subject</span>
        <select
          name="subject"
          required
          defaultValue={subjects[0] ?? ""}
          className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
        >
          {subjects.length === 0 ? (
            <option value="" disabled>
              No active subjects configured
            </option>
          ) : null}
          {subjects.map((subject) => (
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
          className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
          defaultValue=""
        >
          <option value="">—</option>
          {yearGroups.map((y) => (
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
            defaultValue={colours[0]?.hex ?? ""}
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
      <label className="block text-sm">
        <span className="mb-1.5 block text-slate-500">Lead teacher</span>
        <select
          name="teacher_id"
          required
          className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
          defaultValue=""
        >
          <option value="" disabled>
            Select teacher
          </option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.display_name}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="rounded-2xl border border-slate-100 p-4">
        <legend className="px-1 text-sm font-medium text-slate-700">
          Additional teachers (optional)
        </legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {teachers.map((t) => (
            <label key={`extra-${t.id}`} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="additional_teacher_ids" value={t.id} />
              {t.display_name}
            </label>
          ))}
        </div>
      </fieldset>
      <Button
        type="submit"
        disabled={pending || teachers.length === 0 || subjects.length === 0}
      >
        {pending ? "Creating…" : "Create class"}
      </Button>
      {teachers.length === 0 ? (
        <p className="text-sm text-amber-700">
          Create a teacher account before adding classes.
        </p>
      ) : null}
      {subjects.length === 0 ? (
        <p className="text-sm text-amber-700">
          Add an active subject in School settings before creating a class.
        </p>
      ) : null}
    </form>
  );
}
