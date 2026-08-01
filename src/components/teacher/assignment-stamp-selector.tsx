"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { StampImage } from "@/components/shared/stamp-image";
import { saveAssignmentStampSelectionsAction } from "@/lib/actions/marking-annotations";
import type { MarkingStamp } from "@/lib/marking/annotation-types";

export function AssignmentStampSelector({
  assignmentId,
  stamps,
  selectedStampIds,
}: {
  assignmentId: string;
  stamps: MarkingStamp[];
  selectedStampIds: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(selectedStampIds),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Choose which school stamps are available in the document marking
        workspace for this assignment. Stamp files are not copied.
      </p>
      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </p>
      ) : null}
      {!stamps.length ? (
        <p className="text-sm text-slate-500">
          No active stamps are available. Ask an administrator to upload stamps.
        </p>
      ) : (
        <ul className="space-y-2">
          {stamps.map((stamp) => (
            <li key={stamp.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-100 px-3 py-2 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={selected.has(stamp.id)}
                  onChange={() => toggle(stamp.id)}
                />
                <StampImage
                  storagePath={stamp.storage_path}
                  alt={stamp.accessible_label}
                  className="h-8 w-8 object-contain"
                />
                <span className="text-sm">
                  <span className="font-medium text-slate-900">{stamp.name}</span>
                  <span className="block text-xs text-slate-500">
                    {stamp.accessible_label}
                    {stamp.subject_restriction
                      ? ` · ${stamp.subject_restriction}`
                      : ""}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <Button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          setMessage(null);
          startTransition(async () => {
            const result = await saveAssignmentStampSelectionsAction(
              assignmentId,
              Array.from(selected),
            );
            if (result.error) setError(result.error);
            else setMessage(result.success ?? "Stamps updated");
          });
        }}
      >
        {pending ? "Saving…" : "Save stamp selection"}
      </Button>
    </div>
  );
}
