import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth/get-profile";
import { loadClassMarkingAssignments } from "@/lib/marking/queries";
import type { MarkingAssignmentFilter } from "@/lib/marking/types";
import { createClient } from "@/lib/supabase/server";

export default async function ClassMarkingPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const profile = await requireProfile(["teacher", "admin"]);
  const { classId } = await params;
  const { filter: rawFilter } = await searchParams;
  const filter = (rawFilter as MarkingAssignmentFilter) || "all";
  const supabase = await createClient();
  const data = await loadClassMarkingAssignments(
    supabase,
    profile,
    classId,
    filter,
  );
  if (!data) notFound();

  const filters: Array<{ id: MarkingAssignmentFilter; label: string }> = [
    { id: "all", label: "All" },
    { id: "unmarked", label: "Unmarked" },
    { id: "partial", label: "Partially marked" },
    { id: "completed", label: "Completed" },
    { id: "overdue", label: "Overdue submissions" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.className}
        description="Assignments for this class"
        action={
          <Link href="/teacher/marking">
            <Button variant="outline">Back to classes</Button>
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link
            key={f.id}
            href={
              f.id === "all"
                ? `/teacher/marking/classes/${classId}`
                : `/teacher/marking/classes/${classId}?filter=${f.id}`
            }
          >
            <Badge tone={filter === f.id ? "brand" : "neutral"}>{f.label}</Badge>
          </Link>
        ))}
      </div>

      {!data.assignments.length ? (
        <Card>
          <p className="text-sm text-slate-500">No assignments in this filter</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.assignments.map((a) => (
            <Card
              key={a.assignmentId}
              className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <div className="mb-1 flex flex-wrap gap-2">
                  <Badge tone={a.unmarkedCount > 0 ? "warning" : "neutral"}>
                    {a.unmarkedCount > 0 ? "Needs marking" : a.status}
                  </Badge>
                </div>
                <h2 className="font-semibold text-slate-900">{a.title}</h2>
                <p className="text-xs text-slate-500">
                  Due{" "}
                  {a.dueAt
                    ? new Date(a.dueAt).toLocaleString("en-GB")
                    : "—"}
                  {" · "}
                  {a.submittedCount} submitted · {a.unmarkedCount} unmarked ·{" "}
                  {a.markedCount + a.returnedCount} marked
                  {a.oldestUnmarkedAt
                    ? ` · oldest unmarked ${new Date(a.oldestUnmarkedAt).toLocaleString("en-GB")}`
                    : ""}
                </p>
              </div>
              <Link
                href={`/teacher/marking/classes/${classId}/assignments/${a.assignmentId}`}
              >
                <Button size="sm">Open marking</Button>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
