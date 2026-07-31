import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/get-profile";

export default async function TeacherDashboardPage() {
  const profile = await requireProfile(["teacher", "admin"]);
  const supabase = await createClient();
  const teacherId = profile.id;

  const [{ count: classCount }, { data: assignmentRows }] = await Promise.all([
    supabase
      .from("classes")
      .select("*", { count: "exact", head: true })
      .eq("teacher_id", teacherId)
      .eq("archived", false),
    supabase.from("assignments").select("id, title").eq("teacher_id", teacherId),
  ]);

  const assignmentIds = (assignmentRows ?? []).map((a) => a.id);
  let unmarked: {
    id: string;
    submitted_at: string | null;
    status: string;
    student?: { display_name: string } | { display_name: string }[] | null;
    assignments?: { title: string } | { title: string }[] | null;
  }[] = [];

  if (assignmentIds.length) {
    const { data } = await supabase
      .from("submissions")
      .select(
        "id, submitted_at, status, student:profiles!submissions_student_id_fkey(display_name), assignments!inner(title)",
      )
      .in("assignment_id", assignmentIds)
      .in("status", ["submitted", "late"])
      .order("submitted_at", { ascending: true })
      .limit(8);
    unmarked = data ?? [];
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${profile.first_name}`}
        description="Live overview of your classes, assignments and marking queue."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-500">My classes</p>
          <p className="mt-2 text-3xl font-semibold">{classCount ?? 0}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Assignments</p>
          <p className="mt-2 text-3xl font-semibold">
            {assignmentRows?.length ?? 0}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Unmarked submissions</p>
          <p className="mt-2 text-3xl font-semibold">{unmarked.length}</p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/teacher/classes/new">
          <Button>New class</Button>
        </Link>
        <Link href="/teacher/assignments/new">
          <Button variant="secondary">New assignment</Button>
        </Link>
        <Link href="/teacher/marking">
          <Button variant="outline">Open marking queue</Button>
        </Link>
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Marking queue</h2>
          <Link
            href="/teacher/marking"
            className="text-sm text-brand-700 hover:underline"
          >
            View all
          </Link>
        </div>
        {!unmarked.length ? (
          <p className="text-sm text-slate-500">No submissions to mark</p>
        ) : (
          <ul className="space-y-3">
            {unmarked.map((item) => {
              const student = Array.isArray(item.student)
                ? item.student[0]
                : item.student;
              const assignment = Array.isArray(item.assignments)
                ? item.assignments[0]
                : item.assignments;
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 px-4 py-3"
                >
                  <div>
                    <div className="mb-1">
                      <Badge tone={item.status === "late" ? "danger" : "brand"}>
                        {item.status}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium">
                      {student?.display_name ?? "Student"} ·{" "}
                      {assignment?.title ?? "Assignment"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {item.submitted_at
                        ? new Date(item.submitted_at).toLocaleString("en-GB")
                        : ""}
                    </p>
                  </div>
                  <Link href={`/teacher/marking/${item.id}`}>
                    <Button size="sm">Mark</Button>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
