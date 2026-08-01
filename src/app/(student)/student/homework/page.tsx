import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SubjectIcon } from "@/components/shared/subject-icon";
import { requireProfile } from "@/lib/auth/get-profile";
import { loadStudentSubjectSummaries } from "@/lib/student-homework/queries";
import { createClient } from "@/lib/supabase/server";

export default async function StudentHomeworkSubjectsPage() {
  const profile = await requireProfile(["student"]);
  const supabase = await createClient();
  const subjects = await loadStudentSubjectSummaries(supabase, profile.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Homework"
        description="Subjects with outstanding and upcoming work, ordered by nearest deadline."
      />

      {!subjects.length ? (
        <Card>
          <p className="text-sm text-slate-500">No homework subjects yet</p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {subjects.map((subject) => (
            <Card
              key={subject.subjectId}
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <SubjectIcon
                  name={subject.subjectName}
                  iconType={subject.iconType}
                  iconValue={subject.iconValue}
                  colour={subject.colour}
                  size="lg"
                />
                <div>
                  <h2 className="font-semibold text-slate-900">
                    {subject.subjectName}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {subject.dueCount} due · {subject.overdueCount} overdue ·{" "}
                    {subject.submittedCount} submitted
                  </p>
                  <p className="text-xs text-slate-500">
                    Next deadline{" "}
                    {subject.nextDeadline
                      ? new Date(subject.nextDeadline).toLocaleString("en-GB")
                      : "—"}
                  </p>
                </div>
              </div>
              <Link href={`/student/homework/subjects/${encodeURIComponent(subject.subjectId)}`}>
                <Button size="sm">Open</Button>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
