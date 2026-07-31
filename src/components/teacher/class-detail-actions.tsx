"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  regenerateJoinCodeAction,
  removeStudentFromTeacherClassAction,
  addStudentByEmailAction,
} from "@/lib/actions/teacher";
import { JoinCodePanel } from "@/components/shared/join-code-panel";

export function ClassDetailActions({
  classId,
  members,
  joinCode,
  archived = false,
  canManageStudents = true,
  canRegenerateJoinCode = true,
}: {
  classId: string;
  members: { id: string; display_name: string; email: string }[];
  joinCode: string;
  archived?: boolean;
  canManageStudents?: boolean;
  canRegenerateJoinCode?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  return (
    <div className="space-y-6">
      {canRegenerateJoinCode ? (
        <JoinCodePanel
          joinCode={joinCode}
          archived={archived}
          onRegenerate={() => regenerateJoinCodeAction(classId)}
        />
      ) : (
        <div>
          <p className="text-sm text-slate-500">Join code</p>
          <p className="mt-1 font-mono text-2xl font-semibold">{joinCode}</p>
        </div>
      )}

      {message ? <p className="text-sm text-slate-600">{message}</p> : null}

      {canManageStudents ? (
        <>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              type="email"
              placeholder="Student email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button
              type="button"
              disabled={!email || pending || archived}
              onClick={() =>
                startTransition(async () => {
                  const r = await addStudentByEmailAction(classId, email);
                  setMessage(r.success || r.error || null);
                  if (r.success) setEmail("");
                })
              }
            >
              Add student
            </Button>
          </div>
          <p className="text-xs text-slate-400">
            Students can also join themselves using the class join code.
          </p>
        </>
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
                <p className="font-medium">{m.display_name}</p>
                <p className="text-slate-500">{m.email}</p>
              </div>
              {canManageStudents ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await removeStudentFromTeacherClassAction(
                        classId,
                        m.id,
                      );
                      setMessage(r.success || r.error || null);
                    })
                  }
                >
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
