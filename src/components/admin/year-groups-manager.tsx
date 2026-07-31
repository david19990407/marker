"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  archiveYearGroupAction,
  createYearGroupAction,
  deleteYearGroupAction,
  moveYearGroupAction,
  toggleYearGroupActiveAction,
  updateYearGroupAction,
} from "@/lib/actions/school-settings";
import type { YearGroupOption } from "@/lib/school/settings";
import type { ActionResult } from "@/lib/actions/auth";

const initial: ActionResult = {};

export function YearGroupsManager({
  yearGroups,
}: {
  yearGroups: YearGroupOption[];
}) {
  const [createState, createAction, createPending] = useActionState(
    createYearGroupAction,
    initial,
  );
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<ActionResult>({});
  const [editingId, setEditingId] = useState<string | null>(null);

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      const result = await action();
      setFlash(result);
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Manage the year groups available in user, class and import forms. Archive
        instead of deleting when classes or users still use a year group.
      </p>

      {(createState.error || flash.error) && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {createState.error ?? flash.error}
        </div>
      )}
      {(createState.success || flash.success) && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {createState.success ?? flash.success}
        </div>
      )}

      <form action={createAction} className="grid gap-3 sm:grid-cols-[1.4fr_1fr_auto]">
        <Input name="name" required placeholder="Display name, e.g. Year 9" />
        <Input name="code" placeholder="Short code, e.g. Y9" />
        <Button type="submit" disabled={createPending || pending}>
          {createPending ? "Adding…" : "Add year group"}
        </Button>
      </form>

      <ul className="space-y-2">
        {yearGroups.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
            No year groups yet. Add Year 7–13 or your school’s own structure.
          </li>
        ) : null}
        {yearGroups.map((yg, index) => (
          <li
            key={yg.id}
            className="rounded-2xl border border-slate-100 px-4 py-3 text-sm"
          >
            {editingId === yg.id ? (
              <YearGroupEditForm
                yearGroup={yg}
                onDone={() => setEditingId(null)}
              />
            ) : (
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="font-medium text-slate-800">
                    {yg.name}
                    {yg.code ? (
                      <span className="ml-2 text-xs font-normal text-slate-400">
                        {yg.code}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-slate-500">
                    Order {yg.display_order}
                    {yg.archived_at ? " · Archived" : ""}
                    {!yg.is_active ? " · Inactive" : " · Active"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending || index === 0}
                    onClick={() =>
                      run(() => moveYearGroupAction(yg.id, "up"))
                    }
                  >
                    Move up
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending || index === yearGroups.length - 1}
                    onClick={() =>
                      run(() => moveYearGroupAction(yg.id, "down"))
                    }
                  >
                    Move down
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => setEditingId(yg.id)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        toggleYearGroupActiveAction(yg.id, !yg.is_active),
                      )
                    }
                  >
                    {yg.is_active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        archiveYearGroupAction(yg.id, !yg.archived_at),
                      )
                    }
                  >
                    {yg.archived_at ? "Restore" : "Archive"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => run(() => deleteYearGroupAction(yg.id))}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function YearGroupEditForm({
  yearGroup,
  onDone,
}: {
  yearGroup: YearGroupOption;
  onDone: () => void;
}) {
  const bound = updateYearGroupAction.bind(null, yearGroup.id);
  const [state, action, pending] = useActionState(bound, initial);

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1.4fr_1fr_auto_auto]">
      {state.error ? (
        <div className="sm:col-span-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700">
          {state.error}
        </div>
      ) : null}
      {state.success ? (
        <div className="sm:col-span-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">
          {state.success}
        </div>
      ) : null}
      <Input name="name" required defaultValue={yearGroup.name} />
      <Input name="code" defaultValue={yearGroup.code ?? ""} />
      <Button type="submit" size="sm" disabled={pending}>
        Save
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={onDone}>
        Done
      </Button>
    </form>
  );
}
