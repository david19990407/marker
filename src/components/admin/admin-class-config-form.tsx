"use client";

import { useActionState, useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  adminArchiveClassAction,
  adminRestoreClassAction,
  adminUpdateClassAction,
} from "@/lib/actions/admin-classes";
import type { ActionResult } from "@/lib/actions/auth";

const initial: ActionResult = {};

export function AdminClassConfigForm({
  classId,
  defaults,
  subjects,
  yearGroups,
  colours,
  teachers,
  archived,
}: {
  classId: string;
  defaults: {
    name: string;
    subject: string;
    year_group: string | null;
    colour_hex: string | null;
    teacher_id: string;
  };
  subjects: string[];
  yearGroups: string[];
  colours: { name: string; hex: string }[];
  teachers: { id: string; display_name: string }[];
  archived: boolean;
}) {
  const bound = adminUpdateClassAction.bind(null, classId);
  const [state, action, pending] = useActionState(bound, initial);
  const [busy, startTransition] = useTransition();
  const [archiveMsg, setArchiveMsg] = useState<string | null>(null);

  const subjectOptions =
    defaults.subject && !subjects.includes(defaults.subject)
      ? [defaults.subject, ...subjects]
      : subjects;
  const yearOptions =
    defaults.year_group && !yearGroups.includes(defaults.year_group)
      ? [defaults.year_group, ...yearGroups]
      : yearGroups;

  return (
    <div className="space-y-4">
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
          <Input name="name" required defaultValue={defaults.name} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-slate-500">Subject</span>
          <select
            name="subject"
            required
            defaultValue={defaults.subject}
            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
          >
            {subjectOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-slate-500">Year group</span>
          <select
            name="year_group"
            defaultValue={defaults.year_group ?? ""}
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
        <label className="block text-sm">
          <span className="mb-1.5 block text-slate-500">Class colour</span>
          <select
            name="colour_hex"
            defaultValue={defaults.colour_hex ?? colours[0]?.hex ?? "#7C3AED"}
            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
          >
            {colours.map((c) => (
              <option key={c.hex} value={c.hex}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-slate-500">Lead teacher</span>
          <select
            name="teacher_id"
            required
            defaultValue={defaults.teacher_id}
            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
          >
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.display_name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save class settings"}
        </Button>
      </form>

      <div className="border-t border-slate-100 pt-4">
        {archiveMsg ? (
          <p className="mb-3 text-sm text-slate-600">{archiveMsg}</p>
        ) : null}
        {archived ? (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              startTransition(async () => {
                const r = await adminRestoreClassAction(classId);
                setArchiveMsg(r.success || r.error || null);
              })
            }
          >
            Restore class
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() =>
              startTransition(async () => {
                const r = await adminArchiveClassAction(classId);
                setArchiveMsg(r.success || r.error || null);
              })
            }
          >
            Archive class
          </Button>
        )}
      </div>
    </div>
  );
}
