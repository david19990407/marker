import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";

export default async function MarkingQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; assignmentId?: string; status?: string }>;
}) {
  const profile = await requireProfile(["teacher", "admin"]);
  const params = await searchParams;
  const supabase = await createClient();

  const [{ data: classes }, { data: assignments }] = await Promise.all([
    supabase
      .from("classes")
      .select("id, name")
      .eq("teacher_id", profile.id)
      .eq("archived", false)
      .order("name"),
    supabase
      .from("assignments")
      .select("id, title, class_id")
      .eq("teacher_id", profile.id)
      .neq("status", "archived")
      .order("title"),
  ]);

  let assignmentQuery = supabase
    .from("assignments")
    .select("id")
    .eq("teacher_id", profile.id);
  if (params.classId) assignmentQuery = assignmentQuery.eq("class_id", params.classId);
  if (params.assignmentId) assignmentQuery = assignmentQuery.eq("id", params.assignmentId);
  const { data: scopedAssignments } = await assignmentQuery;
  const assignmentIds = (scopedAssignments ?? []).map((a) => a.id);

  let submissions: {
    id: string;
    status: string;
    submitted_at: string | null;
    assignment_id: string;
    student?: { display_name: string } | { display_name: string }[] | null;
    assignments?: { title: string } | { title: string }[] | null;
  }[] = [];

  if (assignmentIds.length) {
    let q = supabase
      .from("submissions")
      .select(
        "id, status, submitted_at, assignment_id, student:profiles!submissions_student_id_fkey(display_name), assignments!inner(title)",
      )
      .in("assignment_id", assignmentIds)
      .order("submitted_at", { ascending: true });

    const status = params.status || "unmarked";
    if (status === "unmarked") {
      q = q.in("status", ["submitted", "late"]);
    } else if (status !== "all") {
      q = q.eq("status", status);
    }

    const { data } = await q;
    submissions = data ?? [];
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marking queue"
        description="Unmarked student submissions, oldest first."
      />

      <Card>
        <form
          method="get"
          className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]"
        >
          <select
            name="classId"
            defaultValue={params.classId ?? ""}
            className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="">All classes</option>
            {(classes ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            name="assignmentId"
            defaultValue={params.assignmentId ?? ""}
            className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="">All assignments</option>
            {(assignments ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
          <select
            name="status"
            defaultValue={params.status ?? "unmarked"}
            className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="unmarked">Unmarked</option>
            <option value="submitted">Submitted</option>
            <option value="late">Late</option>
            <option value="marked">Marked</option>
            <option value="returned">Returned</option>
            <option value="all">All</option>
          </select>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
        </form>
      </Card>

      {!submissions.length ? (
        <Card>
          <p className="text-sm text-slate-500">No submissions to mark</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {submissions.map((s) => {
            const student = Array.isArray(s.student) ? s.student[0] : s.student;
            const assignment = Array.isArray(s.assignments)
              ? s.assignments[0]
              : s.assignments;
            return (
              <Card
                key={s.id}
                className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="mb-1 flex gap-2">
                    <Badge
                      tone={s.status === "late" ? "danger" : "brand"}
                    >
                      {s.status}
                    </Badge>
                  </div>
                  <p className="font-semibold text-slate-900">
                    {student?.display_name ?? "Student"}
                  </p>
                  <p className="text-sm text-slate-500">
                    {assignment?.title ?? "Assignment"}
                    {s.submitted_at
                      ? ` · submitted ${new Date(s.submitted_at).toLocaleString("en-GB")}`
                      : ""}
                  </p>
                </div>
                <Link href={`/teacher/marking/${s.id}`}>
                  <Button size="sm">Open</Button>
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
