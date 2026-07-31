"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deactivateUserAction,
  resetUserPasswordAction,
  updateUserAction,
} from "@/lib/actions/admin";
import type { ActionResult } from "@/lib/actions/auth";
import type { Profile } from "@/lib/types";
import { YEAR_GROUPS } from "@/lib/types";

const initial: ActionResult = {};

export function EditUserForm({
  user,
  classes,
  memberClassIds,
  canEditRole = true,
}: {
  user: Profile;
  classes: { id: string; name: string }[];
  memberClassIds: string[];
  /** False when editing your own account — self-role changes are blocked. */
  canEditRole?: boolean;
}) {
  const boundUpdate = updateUserAction.bind(null, user.id);
  const [state, action, pending] = useActionState(boundUpdate, initial);
  const [isPending, startTransition] = useTransition();
  const [flash, setFlash] = useState<ActionResult>({});

  return (
    <div className="space-y-6">
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
            <Input name="first_name" defaultValue={user.first_name} required />
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block text-slate-500">Last name</span>
            <Input name="last_name" defaultValue={user.last_name} required />
          </label>
        </div>
        <label className="block text-sm">
          <span className="mb-1.5 block text-slate-500">Email</span>
          <Input value={user.email} readOnly />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1.5 block text-slate-500">Role</span>
            {!canEditRole ? (
              <input type="hidden" name="role" value={user.role} />
            ) : null}
            <select
              name={canEditRole ? "role" : undefined}
              defaultValue={user.role}
              disabled={!canEditRole}
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-50 disabled:text-slate-500"
            >
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
            </select>
            {!canEditRole ? (
              <p className="mt-1.5 text-xs text-slate-500">
                You cannot change your own role.
              </p>
            ) : null}
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block text-slate-500">Year group</span>
            <select
              name="year_group"
              defaultValue={user.year_group ?? ""}
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
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="hidden" name="is_active" value="false" />
          <input
            type="checkbox"
            name="is_active"
            value="true"
            defaultChecked={user.is_active}
          />
          Account active
        </label>
        {classes.length > 0 ? (
          <fieldset className="rounded-2xl border border-slate-100 p-4">
            <legend className="px-1 text-sm font-medium">Classes</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {classes.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="class_ids"
                    value={c.id}
                    defaultChecked={memberClassIds.includes(c.id)}
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </form>

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await resetUserPasswordAction(user.id);
              setFlash(result);
            })
          }
        >
          Send password reset
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={isPending || !user.is_active}
          onClick={() =>
            startTransition(async () => {
              const result = await deactivateUserAction(user.id);
              setFlash(result);
            })
          }
        >
          Deactivate user
        </Button>
      </div>
      {flash.success || flash.error ? (
        <p className="text-sm text-slate-600">{flash.success || flash.error}</p>
      ) : null}
    </div>
  );
}
