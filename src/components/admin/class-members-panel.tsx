"use client";

import { useActionState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  adminAssignStudentAction,
  adminRemoveStudentAction,
} from "@/lib/actions/admin-classes";
import type { ActionResult } from "@/lib/actions/auth";

const initial: ActionResult = {};

export function ClassMembersPanel({
  classId,
  members,
  availableStudents,
}: {
  classId: string;
  members: { id: string; display_name: string; email: string }[];
  availableStudents: { id: string; display_name: string; email: string }[];
}) {
  const bound = adminAssignStudentAction.bind(null, classId);
  const [state, action, pending] = useActionState(bound, initial);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <form action={action} className="flex flex-col gap-3 sm:flex-row">
        <select
          name="student_id"
          required
          className="h-11 flex-1 rounded-2xl border border-slate-200 bg-white px-3 text-sm"
          defaultValue=""
        >
          <option value="" disabled>
            Select student
          </option>
          {availableStudents.map((s) => (
            <option key={s.id} value={s.id}>
              {s.display_name} ({s.email})
            </option>
          ))}
        </select>
        <Button type="submit" disabled={pending || availableStudents.length === 0}>
          Assign
        </Button>
      </form>
      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
      {state.success ? (
        <p className="text-sm text-emerald-600">{state.success}</p>
      ) : null}

      {!members.length ? (
        <p className="text-sm text-slate-500">No students in this class yet</p>
      ) : (
        <ul className="space-y-2">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium text-slate-900">{m.display_name}</p>
                <p className="text-slate-500">{m.email}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await adminRemoveStudentAction(classId, m.id);
                  })
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
