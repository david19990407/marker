import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BulkReleasePanel } from "@/components/teacher/marking/bulk-release-panel";
import { requireProfile } from "@/lib/auth/get-profile";
import { loadAssignmentSubmissionList } from "@/lib/marking/queries";
import type {
  MarkingSubmissionFilter,
  MarkingSubmissionSort,
} from "@/lib/marking/types";
import { createClient } from "@/lib/supabase/server";

export default async function AssignmentMarkingPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string; assignmentId: string }>;
  searchParams: Promise<{ filter?: string; sort?: string }>;
}) {
  const profile = await requireProfile(["teacher", "admin"]);
  const { classId, assignmentId } = await params;
  const sp = await searchParams;
  const filter = (sp.filter as MarkingSubmissionFilter) || "unmarked";
  const sort = (sp.sort as MarkingSubmissionSort) || "submitted_at";
  const supabase = await createClient();

  const data = await loadAssignmentSubmissionList(supabase, profile, assignmentId, {
    filter,
    sort,
  });
  if (!data || data.assignment.classId !== classId) notFound();

  const filters: Array<{ id: MarkingSubmissionFilter; label: string }> = [
    { id: "unmarked", label: "Unmarked" },
    { id: "marked", label: "Marked" },
    { id: "returned", label: "Returned" },
    { id: "late", label: "Late" },
    { id: "not_submitted", label: "Not submitted" },
    { id: "all", label: "All" },
  ];
  const sorts: Array<{ id: MarkingSubmissionSort; label: string }> = [
    { id: "submitted_at", label: "Submission time" },
    { id: "surname", label: "Surname" },
    { id: "status", label: "Status" },
    { id: "late", label: "Late" },
  ];

  const { progress } = data;
  const qs = (next: { filter?: string; sort?: string }) => {
    const p = new URLSearchParams();
    p.set("filter", next.filter ?? filter);
    p.set("sort", next.sort ?? sort);
    return `?${p.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.assignment.title}
        description={data.assignment.className}
        action={
          <Link href={`/teacher/marking/classes/${classId}`}>
            <Button variant="outline">Back to class</Button>
          </Link>
        }
      />

      <Card className="space-y-2">
        <p className="text-sm font-medium text-slate-900">
          {progress.marked + progress.returned} of {progress.submitted}{" "}
          submissions marked
        </p>
        <p className="text-xs text-slate-500">
          {progress.totalStudents} students · {progress.submitted} submitted ·{" "}
          {progress.unmarked} unmarked · {progress.marked} marked ·{" "}
          {progress.returned} returned · {progress.notSubmitted} not submitted
        </p>
      </Card>

      <BulkReleasePanel assignmentId={assignmentId} rows={data.rows} />

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link
            key={f.id}
            href={`/teacher/marking/classes/${classId}/assignments/${assignmentId}${qs({ filter: f.id })}`}
          >
            <Badge tone={filter === f.id ? "brand" : "neutral"}>{f.label}</Badge>
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {sorts.map((s) => (
          <Link
            key={s.id}
            href={`/teacher/marking/classes/${classId}/assignments/${assignmentId}${qs({ sort: s.id })}`}
          >
            <Badge tone={sort === s.id ? "brand" : "neutral"}>Sort: {s.label}</Badge>
          </Link>
        ))}
      </div>

      {!data.rows.length ? (
        <Card>
          <p className="text-sm text-slate-500">No students in this filter</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.rows.map((row) => (
            <Card
              key={`${row.studentId}-${row.submissionId ?? "none"}`}
              className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <div className="mb-1 flex flex-wrap gap-2">
                  <Badge
                    tone={
                      row.displayStatus === "Released"
                        ? "brand"
                        : row.displayStatus === "Ready to release"
                          ? "success"
                          : row.isLate
                            ? "danger"
                            : "neutral"
                    }
                  >
                    {row.displayStatus}
                  </Badge>
                  {row.mark != null ? (
                    <Badge tone="neutral">Mark {row.mark}</Badge>
                  ) : null}
                </div>
                <p className="font-semibold text-slate-900">{row.studentName}</p>
                <p className="text-xs text-slate-500">
                  {row.submittedAt
                    ? `Submitted ${new Date(row.submittedAt).toLocaleString("en-GB")}`
                    : "Not submitted"}
                  {row.releasedAt
                    ? ` · Released ${new Date(row.releasedAt).toLocaleString("en-GB")}`
                    : ""}
                </p>
              </div>
              {row.submissionId ? (
                <Link
                  href={`/teacher/marking/submissions/${row.submissionId}${
                    filter === "unmarked" ? "?filter=unmarked" : ""
                  }`}
                >
                  <Button size="sm">Open marking</Button>
                </Link>
              ) : (
                <Button size="sm" variant="outline" disabled>
                  No submission
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
