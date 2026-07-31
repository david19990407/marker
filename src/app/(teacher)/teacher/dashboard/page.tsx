import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/get-profile";

export default async function TeacherDashboardPage() {
  const profile = await requireProfile(["teacher", "admin"]);
  const supabase = await createClient();

  const teacherId = profile.role === "teacher" ? profile.id : profile.id;

  const [{ count: classCount }, { data: classes }] = await Promise.all([
    supabase
      .from("classes")
      .select("*", { count: "exact", head: true })
      .eq("teacher_id", teacherId)
      .eq("archived", false),
    supabase
      .from("classes")
      .select("id")
      .eq("teacher_id", teacherId)
      .eq("archived", false),
  ]);

  const classIds = (classes ?? []).map((c) => c.id);

  let assignmentCount = 0;
  let unmarkedCount = 0;

  if (classIds.length) {
    const [{ count: aCount }, { data: assignmentRows }] = await Promise.all([
      supabase
        .from("assignments")
        .select("*", { count: "exact", head: true })
        .eq("teacher_id", teacherId)
        .neq("status", "archived"),
      supabase
        .from("assignments")
        .select("id")
        .eq("teacher_id", teacherId),
    ]);
    assignmentCount = aCount ?? 0;
    const assignmentIds = (assignmentRows ?? []).map((a) => a.id);
    if (assignmentIds.length) {
      const { count } = await supabase
        .from("submissions")
        .select("*", { count: "exact", head: true })
        .in("assignment_id", assignmentIds)
        .in("status", ["submitted", "late"]);
      unmarkedCount = count ?? 0;
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${profile.first_name}`}
        description="Your classes, assignments and marking queue will appear here as you create them."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-500">My classes</p>
          <p className="mt-2 text-3xl font-semibold">{classCount ?? 0}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Assignments</p>
          <p className="mt-2 text-3xl font-semibold">{assignmentCount}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Unmarked submissions</p>
          <p className="mt-2 text-3xl font-semibold">{unmarkedCount}</p>
        </Card>
      </div>

      <Card>
        <h2 className="font-semibold text-slate-900">Marking queue</h2>
        {unmarkedCount === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No submissions to mark</p>
        ) : (
          <p className="mt-3 text-sm text-slate-600">
            You have {unmarkedCount} unmarked submission
            {unmarkedCount === 1 ? "" : "s"}. Full marking tools arrive in Phase
            4.
          </p>
        )}
      </Card>
    </div>
  );
}
