"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { SubmissionNavItem } from "@/lib/marking/types";

/**
 * Prev/next navigation between submissions for the same assignment.
 * Avoids shortcuts while focus is in inputs/textareas.
 */
export function MarkingSubmissionNav({
  assignmentId,
  classId,
  currentId,
  items,
  index,
  total,
  studentName,
  submittedAt,
  status,
  unmarkedOnly = false,
}: {
  assignmentId: string;
  classId: string;
  currentId: string;
  items: SubmissionNavItem[];
  index: number;
  total: number;
  studentName: string;
  submittedAt: string | null;
  status: string;
  unmarkedOnly?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const previousId = index > 0 ? items[index - 1]?.submissionId : null;
  const nextId = index >= 0 && index < total - 1 ? items[index + 1]?.submissionId : null;

  function go(id: string | null | undefined) {
    if (!id || pending) return;
    startTransition(async () => {
      // Ask the feedback form to save a draft before leaving this submission.
      window.dispatchEvent(new Event("marking:save-before-nav"));
      await new Promise((r) => setTimeout(r, 350));
      const qs = unmarkedOnly ? "?filter=unmarked" : "";
      router.push(`/teacher/marking/submissions/${id}${qs}`);
    });
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft" && (e.altKey || e.metaKey)) {
        e.preventDefault();
        if (previousId) go(previousId);
      }
      if (e.key === "ArrowRight" && (e.altKey || e.metaKey)) {
        e.preventDefault();
        if (nextId) go(nextId);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // Intentionally depends on adjacent IDs only; go closes over current filter.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- navigation ids
  }, [previousId, nextId, unmarkedOnly]);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">
          {studentName}
        </p>
        <p className="text-xs text-slate-500">
          {index >= 0 ? `${index + 1} of ${total}` : "—"}
          {submittedAt
            ? ` · submitted ${new Date(submittedAt).toLocaleString("en-GB")}`
            : ""}
          {` · ${status}`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-9 max-w-[12rem] rounded-xl border border-slate-200 bg-white px-2 text-xs"
          value={currentId}
          onChange={(e) => go(e.target.value)}
          aria-label="Select student submission"
        >
          {items.map((item) => (
            <option key={item.submissionId} value={item.submissionId}>
              {item.studentName}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!previousId || pending}
          onClick={() => go(previousId)}
        >
          Previous
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!nextId || pending}
          onClick={() => go(nextId)}
        >
          Next
        </Button>
        <Link
          href={`/teacher/marking/classes/${classId}/assignments/${assignmentId}`}
        >
          <Button type="button" size="sm" variant="secondary">
            Back to assignment
          </Button>
        </Link>
      </div>
    </div>
  );
}
