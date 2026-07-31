"use client";

import { useActionState, useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  adminAddClassTeacherAction,
  adminPromoteLeadTeacherAction,
  adminRemoveClassTeacherAction,
} from "@/lib/actions/admin-classes";
import type { ActionResult } from "@/lib/actions/auth";
import type { ClassTeacherRole } from "@/lib/types";

const initial: ActionResult = {};

const ROLE_LABELS: Record<ClassTeacherRole, string> = {
  lead_teacher: "Lead teacher",
  teacher: "Teacher",
  teaching_assistant: "Teaching assistant",
  cover_teacher: "Cover teacher",
};

export function AdminClassTeachersPanel({
  classId,
  teachers,
}: {
  classId: string;
  teachers: {
    id: string;
    teacher_id: string;
    display_name: string;
    email: string;
    membership_role: ClassTeacherRole;
  }[];
}) {
  const addAction = adminAddClassTeacherAction.bind(null, classId);
  const [state, action, pending] = useActionState(addAction, initial);
  const [busy, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {teachers.length > 0 ? (
        <ul className="space-y-2">
          {teachers.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium text-slate-900">{t.display_name}</p>
                <p className="text-xs text-slate-500">{t.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="brand">
                  {ROLE_LABELS[t.membership_role] ?? t.membership_role}
                </Badge>
                {t.membership_role !== "lead_teacher" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      startTransition(async () => {
                        const r = await adminPromoteLeadTeacherAction(
                          classId,
                          t.teacher_id,
                        );
                        setFlash(r.success || r.error || null);
                      })
                    }
                  >
                    Make lead
                  </Button>
                ) : null}
                {t.membership_role !== "lead_teacher" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      startTransition(async () => {
                        const r = await adminRemoveClassTeacherAction(
                          classId,
                          t.teacher_id,
                        );
                        setFlash(r.success || r.error || null);
                      })
                    }
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">No teachers assigned yet.</p>
      )}

      {flash ? <p className="text-sm text-slate-600">{flash}</p> : null}

      <div className="border-t border-slate-100 pt-4">
        <p className="mb-3 text-sm font-medium text-slate-700">Add a teacher</p>
        {state.error ? (
          <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
            {state.error}
          </div>
        ) : null}
        {state.success ? (
          <div className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
            {state.success}
          </div>
        ) : null}
        <form action={action} className="flex flex-wrap gap-3">
          <Input
            name="email"
            type="email"
            placeholder="teacher@school.edu"
            className="flex-1"
            required
          />
          <select
            name="role"
            defaultValue="teacher"
            className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="teacher">Teacher</option>
            <option value="lead_teacher">Lead teacher</option>
            <option value="teaching_assistant">Teaching assistant</option>
            <option value="cover_teacher">Cover teacher</option>
          </select>
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Adding…" : "Add teacher"}
          </Button>
        </form>
      </div>
    </div>
  );
}
