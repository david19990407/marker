"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createTeacherClassAction,
  updateTeacherClassAction,
} from "@/lib/actions/teacher";
import type { ActionResult } from "@/lib/actions/auth";
import { YEAR_GROUPS } from "@/lib/types";

const initial: ActionResult = {};

export function TeacherClassForm({
  classId,
  defaults,
}: {
  classId?: string;
  defaults?: { name: string; subject: string; year_group: string | null };
}) {
  const actionFn = classId
    ? updateTeacherClassAction.bind(null, classId)
    : createTeacherClassAction;
  const [state, action, pending] = useActionState(actionFn, initial);

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
        <Input name="subject" required defaultValue={defaults?.subject ?? "English"} />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-slate-500">Year group</span>
        <select
          name="year_group"
          defaultValue={defaults?.year_group ?? ""}
          className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
        >
          <option value="">—</option>
          {YEAR_GROUPS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : classId ? "Save changes" : "Create class"}
      </Button>
    </form>
  );
}
