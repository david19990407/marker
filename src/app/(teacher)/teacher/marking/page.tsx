import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubjectIcon } from "@/components/shared/subject-icon";
import { requireProfile } from "@/lib/auth/get-profile";
import { loadMarkingDashboard } from "@/lib/marking/queries";
import type { MarkingClassSort } from "@/lib/marking/types";
import { createClient } from "@/lib/supabase/server";

export default async function MarkingDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const profile = await requireProfile(["teacher", "admin"]);
  const params = await searchParams;
  const supabase = await createClient();
  const sort = (params.sort as MarkingClassSort) || "oldest";
  const classes = await loadMarkingDashboard(supabase, profile, sort);

  const sorts: Array<{ id: MarkingClassSort; label: string }> = [
    { id: "oldest", label: "Oldest waiting" },
    { id: "unmarked", label: "Most unmarked" },
    { id: "recent", label: "Most recent" },
    { id: "name", label: "Class name" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marking"
        description="Choose a class, then an assignment, then a student."
      />

      <div className="flex flex-wrap gap-2">
        {sorts.map((s) => (
          <Link key={s.id} href={`/teacher/marking?sort=${s.id}`}>
            <Badge tone={sort === s.id ? "brand" : "neutral"}>{s.label}</Badge>
          </Link>
        ))}
      </div>

      {!classes.length ? (
        <Card>
          <p className="text-sm text-slate-500">No classes with marking access</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {classes.map((cls) => (
            <Card
              key={cls.classId}
              className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex items-start gap-3">
                <SubjectIcon
                  name={cls.subject}
                  iconType={cls.subjectIconType}
                  iconValue={cls.subjectIconValue}
                  colour={cls.subjectColour}
                  size="md"
                />
                <div>
                  <h2 className="font-semibold text-slate-900">{cls.className}</h2>
                  <p className="text-sm text-slate-500">
                    {cls.subject}
                    {cls.yearGroup ? ` · ${cls.yearGroup}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {cls.assignmentsWithUnmarked} assignment
                    {cls.assignmentsWithUnmarked === 1 ? "" : "s"} with unmarked
                    work · {cls.unmarkedCount} unmarked
                    {cls.oldestUnmarkedAt
                      ? ` · oldest ${new Date(cls.oldestUnmarkedAt).toLocaleString("en-GB")}`
                      : ""}
                  </p>
                </div>
              </div>
              <Link href={`/teacher/marking/classes/${cls.classId}`}>
                <Button size="sm">Open class</Button>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
