import type { SubmissionStatus } from "@/lib/types";

export function formatSubmittedOn(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SubmissionStatusBanner({
  status,
  submittedAt,
  answeredCount,
  assessableCount,
}: {
  status?: SubmissionStatus | string | null;
  submittedAt?: string | null;
  answeredCount?: number;
  assessableCount?: number;
}) {
  const reopened =
    status === "returned" || (status === "draft" && Boolean(submittedAt));
  const submittedLocked =
    status === "submitted" || status === "late" || status === "marked";

  if (reopened) {
    return (
      <div
        className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
        role="status"
      >
        <p className="font-medium text-slate-900">Homework reopened</p>
        <p className="mt-1">This homework is available for editing again.</p>
        <p className="mt-1">Submit it again when you have finished.</p>
      </div>
    );
  }

  if (!submittedLocked) return null;

  return (
    <div
      className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
      role="status"
    >
      <p className="font-medium text-slate-900">Homework submitted</p>
      {submittedAt ? (
        <p className="mt-1">Submitted on {formatSubmittedOn(submittedAt)}.</p>
      ) : null}
      <p className="mt-1">This submission is now read-only.</p>
      {typeof answeredCount === "number" &&
      typeof assessableCount === "number" &&
      assessableCount > 0 ? (
        <p className="mt-1 text-slate-500">
          {answeredCount} of {assessableCount} questions answered.
        </p>
      ) : null}
    </div>
  );
}
