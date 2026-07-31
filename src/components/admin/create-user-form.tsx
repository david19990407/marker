"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createUserAction } from "@/lib/actions/admin";
import type { ActionResult } from "@/lib/actions/auth";

const initial: ActionResult = {};

export function CreateUserForm({
  classes,
  yearGroups,
}: {
  classes: { id: string; name: string }[];
  yearGroups: string[];
}) {
  const [state, action, pending] = useActionState(createUserAction, initial);

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
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1.5 block text-slate-500">First name</span>
          <Input name="first_name" required />
        </label>
        <label className="text-sm">
          <span className="mb-1.5 block text-slate-500">Last name</span>
          <Input name="last_name" required />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1.5 block text-slate-500">Email</span>
        <Input name="email" type="email" required />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1.5 block text-slate-500">Role</span>
          <select
            name="role"
            required
            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
            defaultValue="student"
          >
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label className="text-sm">
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
      </div>
      {classes.length > 0 ? (
        <fieldset className="rounded-2xl border border-slate-100 p-4">
          <legend className="px-1 text-sm font-medium text-slate-700">
            Assign to classes (students)
          </legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {classes.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="class_ids" value={c.id} />
                {c.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <input type="hidden" name="send_invite" value="true" />
      <Button type="submit" disabled={pending}>
        {pending ? "Sending invitation…" : "Create & send invitation"}
      </Button>
    </form>
  );
}
