import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SubjectIcon } from "@/components/shared/subject-icon";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/get-profile";
import { getBranding } from "@/lib/school/branding";
import { loadMarkingDashboard } from "@/lib/marking/queries";

export default async function TeacherDashboardPage() {
  const [profile, branding] = await Promise.all([
    requireProfile(["teacher", "admin"]),
    getBranding(),
  ]);
  const supabase = await createClient();

  const [{ count: classCount }, { count: assignmentCount }, classSummaries] =
    await Promise.all([
      supabase
        .from("classes")
        .select("*", { count: "exact", head: true })
        .eq("teacher_id", profile.id)
        .eq("archived", false),
      supabase
        .from("assignments")
        .select("*", { count: "exact", head: true })
        .eq("teacher_id", profile.id)
        .neq("status", "archived"),
      loadMarkingDashboard(supabase, profile, "oldest"),
    ]);

  const unmarkedTotal = classSummaries.reduce(
    (sum, c) => sum + c.unmarkedCount,
    0,
  );
  const waitingClasses = classSummaries
    .filter((c) => c.unmarkedCount > 0)
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${profile.first_name}`}
        description={
          branding.schoolName
            ? `${branding.schoolName} — overview of classes, assignments and marking.`
            : "Overview of classes, assignments and marking."
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-500">My classes</p>
          <p className="mt-2 text-3xl font-semibold">{classCount ?? 0}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Assignments</p>
          <p className="mt-2 text-3xl font-semibold">{assignmentCount ?? 0}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Unmarked submissions</p>
          <p className="mt-2 text-3xl font-semibold">{unmarkedTotal}</p>
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
          <Button variant="outline">Open marking</Button>
        </Link>
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Classes needing marking</h2>
          <Link
            href="/teacher/marking"
            className="text-sm text-brand-700 hover:underline"
          >
            View all
          </Link>
        </div>
        {!waitingClasses.length ? (
          <p className="text-sm text-slate-500">No unmarked work right now</p>
        ) : (
          <ul className="space-y-3">
            {waitingClasses.map((cls) => (
              <li
                key={cls.classId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 px-4 py-3"
              >
                <div className="flex items-start gap-3">
                  <SubjectIcon
                    name={cls.subject}
                    iconType={cls.subjectIconType}
                    iconValue={cls.subjectIconValue}
                    colour={cls.subjectColour}
                    size="sm"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {cls.className}
                    </p>
                    <p className="text-xs text-slate-500">
                      {cls.unmarkedCount} unmarked ·{" "}
                      {cls.assignmentsWithUnmarked} assignment
                      {cls.assignmentsWithUnmarked === 1 ? "" : "s"}
                      {cls.oldestUnmarkedAt
                        ? ` · oldest ${new Date(cls.oldestUnmarkedAt).toLocaleString("en-GB")}`
                        : ""}
                    </p>
                  </div>
                </div>
                <Link href={`/teacher/marking/classes/${cls.classId}`}>
                  <Button size="sm">Open</Button>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
