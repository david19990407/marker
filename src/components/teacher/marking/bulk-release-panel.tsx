"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { bulkReleaseFeedbackAction } from "@/lib/actions/feedback-release";
import type { AssignmentSubmissionRow } from "@/lib/marking/types";

function releaseLabel(row: AssignmentSubmissionRow) {
  if (!row.submissionId) return "Not submitted";
  if (row.feedbackStatus === "released") {
    if (row.status === "marked" || row.status === "returned") {
      return row.updatedSinceRelease ? "Updated since release" : "Released";
    }
    return "Released";
  }
  if (row.status === "draft") return "Not submitted";
  if (row.markingReady) return "Ready to release";
  if (row.status === "submitted" || row.status === "late") return "Marking";
  if (row.status === "marked" || row.status === "returned") return "Marking";
  return row.status;
}

export function BulkReleasePanel({
  assignmentId,
  rows,
}: {
  assignmentId: string;
  rows: AssignmentSubmissionRow[];
}) {
  const readyIds = useMemo(
    () =>
      rows
        .filter(
          (r) =>
            r.submissionId &&
            r.markingReady &&
            r.feedbackStatus !== "released",
        )
        .map((r) => r.submissionId!) ,
    [rows],
  );
  const [selected, setSelected] = useState<Set<string>>(() => new Set(readyIds));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [results, setResults] = useState<
    Array<{ submissionId: string; ok: boolean; message: string }>
  >([]);

  const released = rows.filter((r) => r.feedbackStatus === "released").length;
  const incomplete = rows.filter(
    (r) => r.submissionId && !r.markingReady && r.feedbackStatus !== "released",
  ).length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runRelease(ids: string[]) {
    if (!ids.length) {
      setMessage("No ready submissions selected.");
      return;
    }
    if (
      !window.confirm(
        `Release feedback for ${ids.length} student${ids.length === 1 ? "" : "s"}? Incomplete submissions will be skipped.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await bulkReleaseFeedbackAction(assignmentId, ids);
      setMessage(result.error ?? result.success ?? null);
      setResults(result.results ?? []);
    });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            Release feedback to students
          </p>
          <p className="text-xs text-slate-500">
            {readyIds.length} ready · {incomplete} incomplete · {released} already
            released
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setSelected(new Set(readyIds))}
          >
            Select all ready
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => runRelease(readyIds)}
          >
            Release all ready
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pending || selected.size === 0}
            onClick={() => runRelease([...selected])}
          >
            Release selected
          </Button>
        </div>
      </div>

      {message ? (
        <p className="text-xs text-slate-600">{message}</p>
      ) : null}

      <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
        {rows
          .filter((r) => r.submissionId)
          .map((row) => {
            const id = row.submissionId!;
            const ready = Boolean(row.markingReady);
            return (
              <li
                key={id}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-slate-50"
              >
                <label className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={!ready && row.feedbackStatus !== "released"}
                    checked={selected.has(id)}
                    onChange={() => toggle(id)}
                  />
                  <span className="truncate font-medium text-slate-800">
                    {row.studentName}
                  </span>
                </label>
                <span className="shrink-0 text-slate-500">{releaseLabel(row)}</span>
              </li>
            );
          })}
      </ul>

      {results.length ? (
        <ul className="space-y-1 text-xs">
          {results.map((r) => (
            <li
              key={r.submissionId}
              className={r.ok ? "text-emerald-700" : "text-rose-700"}
            >
              {r.submissionId.slice(0, 8)}… — {r.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
