"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createClassColourAction,
  moveClassColourAction,
  toggleClassColourActiveAction,
} from "@/lib/actions/school-settings";
import type { ClassColourOption } from "@/lib/school/settings";
import type { ActionResult } from "@/lib/actions/auth";

const initial: ActionResult = {};

export function ClassColoursManager({
  colours,
}: {
  colours: ClassColourOption[];
}) {
  const [createState, createAction, createPending] = useActionState(
    createClassColourAction,
    initial,
  );
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<ActionResult>({});

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      setFlash(await action());
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Palette used when assigning colours to subjects and classes.
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

      <form
        action={createAction}
        className="grid gap-3 sm:grid-cols-[1.2fr_1fr_auto]"
      >
        <Input name="name" required placeholder="Colour name" />
        <Input name="hex" required placeholder="#7C3AED" defaultValue="#7C3AED" />
        <Button type="submit" disabled={createPending || pending}>
          Add colour
        </Button>
      </form>

      <ul className="space-y-2">
        {colours.map((colour, index) => (
          <li
            key={colour.id}
            className="flex flex-col gap-3 rounded-2xl border border-slate-100 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-3">
              <span
                className="h-8 w-8 rounded-xl border border-slate-200"
                style={{ backgroundColor: colour.hex }}
              />
              <div>
                <p className="font-medium text-slate-800">{colour.name}</p>
                <p className="text-xs text-slate-500">
                  {colour.hex}
                  {colour.is_active ? " · Active" : " · Inactive"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending || index === 0}
                onClick={() => run(() => moveClassColourAction(colour.id, "up"))}
              >
                Move up
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending || index === colours.length - 1}
                onClick={() =>
                  run(() => moveClassColourAction(colour.id, "down"))
                }
              >
                Move down
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    toggleClassColourActiveAction(colour.id, !colour.is_active),
                  )
                }
              >
                {colour.is_active ? "Deactivate" : "Activate"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
