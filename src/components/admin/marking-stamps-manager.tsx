"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StampImage } from "@/components/shared/stamp-image";
import {
  archiveMarkingStampAction,
  deleteUnusedMarkingStampAction,
  reorderMarkingStampAction,
  updateMarkingStampAction,
  uploadMarkingStampAction,
} from "@/lib/actions/marking-stamps";
import type { ActionResult } from "@/lib/actions/auth";
import type { MarkingStamp } from "@/lib/marking/annotation-types";

const initial: ActionResult = {};

export function MarkingStampsManager({
  stamps: initialStamps,
  subjects,
}: {
  stamps: MarkingStamp[];
  subjects: string[];
}) {
  const [stamps, setStamps] = useState(initialStamps);
  const [state, action, pending] = useActionState(
    uploadMarkingStampAction,
    initial,
  );
  const [, startTransition] = useTransition();

  return (
    <div className="space-y-8">
      <form action={action} className="space-y-4 rounded-2xl border border-slate-100 p-4">
        <h3 className="text-sm font-semibold text-slate-900">Upload stamp</h3>
        {state.error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {state.success}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">Name</span>
            <Input name="name" required />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">Accessible label</span>
            <Input name="accessible_label" required />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">Category</span>
            <Input name="category" defaultValue="general" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">Default size (%)</span>
            <Input
              name="default_size_pct"
              type="number"
              min={2}
              max={40}
              defaultValue={8}
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-slate-500">
              Subject restriction (optional)
            </span>
            <select
              name="subject_restriction"
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
              defaultValue=""
            >
              <option value="">All subjects</option>
              {subjects.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-slate-500">
              Image (PNG, SVG or WebP, max 2MB)
            </span>
            <Input
              name="file"
              type="file"
              accept="image/png,image/svg+xml,image/webp"
              required
            />
          </label>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Uploading…" : "Upload stamp"}
        </Button>
      </form>

      <ul className="space-y-3">
        {stamps.map((stamp, index) => (
          <li
            key={stamp.id}
            className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-100 px-4 py-3"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50">
              <StampImage
                storagePath={stamp.storage_path}
                alt={stamp.accessible_label}
                className="max-h-10 max-w-10 object-contain"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-900">
                {stamp.name}
                {stamp.archived_at ? (
                  <span className="ml-2 text-xs text-amber-700">(archived)</span>
                ) : null}
              </p>
              <p className="text-xs text-slate-500">
                {stamp.accessible_label} · {stamp.category}
                {stamp.subject_restriction
                  ? ` · ${stamp.subject_restriction}`
                  : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={index === 0}
                onClick={() =>
                  startTransition(async () => {
                    await reorderMarkingStampAction(stamp.id, "up");
                    setStamps((prev) => {
                      const next = [...prev];
                      const i = next.findIndex((s) => s.id === stamp.id);
                      if (i <= 0) return prev;
                      [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
                      return next;
                    });
                  })
                }
              >
                Up
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={index === stamps.length - 1}
                onClick={() =>
                  startTransition(async () => {
                    await reorderMarkingStampAction(stamp.id, "down");
                    setStamps((prev) => {
                      const next = [...prev];
                      const i = next.findIndex((s) => s.id === stamp.id);
                      if (i < 0 || i >= next.length - 1) return prev;
                      [next[i], next[i + 1]] = [next[i + 1]!, next[i]!];
                      return next;
                    });
                  })
                }
              >
                Down
              </Button>
              {!stamp.archived_at ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    startTransition(async () => {
                      await archiveMarkingStampAction(stamp.id);
                      setStamps((prev) =>
                        prev.map((s) =>
                          s.id === stamp.id
                            ? {
                                ...s,
                                is_active: false,
                                archived_at: new Date().toISOString(),
                              }
                            : s,
                        ),
                      );
                    })
                  }
                >
                  Archive
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    startTransition(async () => {
                      await updateMarkingStampAction(stamp.id, {
                        is_active: true,
                        archived_at: null,
                      });
                      setStamps((prev) =>
                        prev.map((s) =>
                          s.id === stamp.id
                            ? { ...s, is_active: true, archived_at: null }
                            : s,
                        ),
                      );
                    })
                  }
                >
                  Activate
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  startTransition(async () => {
                    const result = await deleteUnusedMarkingStampAction(stamp.id);
                    if (result.error) {
                      window.alert(result.error);
                      return;
                    }
                    setStamps((prev) => prev.filter((s) => s.id !== stamp.id));
                  })
                }
              >
                Delete if unused
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
