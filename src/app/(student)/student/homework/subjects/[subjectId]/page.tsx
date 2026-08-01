import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubjectIcon } from "@/components/shared/subject-icon";
import { requireProfile } from "@/lib/auth/get-profile";
import { loadStudentSubjectAssignments } from "@/lib/student-homework/queries";
import type { StudentAssignmentSection } from "@/lib/student-homework/types";
import { createClient } from "@/lib/supabase/server";

const SECTION_LABELS: Record<StudentAssignmentSection, string> = {
  overdue: "Overdue",
  due_soon: "Due soon",
  upcoming: "Upcoming",
  submitted: "Submitted",
  returned: "Marked and returned",
};

const SECTION_ORDER: StudentAssignmentSection[] = [
  "overdue",
  "due_soon",
  "upcoming",
  "submitted",
  "returned",
];

export default async function StudentSubjectHomeworkPage({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  const profile = await requireProfile(["student"]);
  const { subjectId: rawId } = await params;
  const subjectId = decodeURIComponent(rawId);
  const supabase = await createClient();
  const data = await loadStudentSubjectAssignments(
    supabase,
    profile.id,
    subjectId,
  );
  if (!data?.subject) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.subject.subjectName}
        description="Assignments for this subject"
        action={
          <Link href="/student/homework">
            <Button variant="outline">All subjects</Button>
          </Link>
        }
      />

      <div className="flex items-center gap-3">
        <SubjectIcon
          name={data.subject.subjectName}
          iconType={data.subject.iconType}
          iconValue={data.subject.iconValue}
          colour={data.subject.colour}
          size="md"
        />
        <p className="text-sm text-slate-500">
          {data.subject.dueCount} due · {data.subject.overdueCount} overdue ·{" "}
          {data.subject.submittedCount} submitted
        </p>
      </div>

      {SECTION_ORDER.map((section) => {
        const cards = data.sections[section];
        if (!cards.length) return null;
        return (
          <section key={section} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {SECTION_LABELS[section]}
            </h2>
            {cards.map((a) => (
              <Card
                key={a.assignmentId}
                className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="mb-1 flex flex-wrap gap-2">
                    <Badge tone="neutral">{a.className}</Badge>
                    <Badge
                      tone={
                        section === "overdue"
                          ? "danger"
                          : section === "returned"
                            ? "success"
                            : "brand"
                      }
                    >
                      {a.submissionStatus ?? "not submitted"}
                    </Badge>
                  </div>
                  <h3 className="font-semibold text-slate-900">{a.title}</h3>
                  <p className="text-xs text-slate-500">
                    Due{" "}
                    {a.dueAt
                      ? new Date(a.dueAt).toLocaleString("en-GB")
                      : "—"}
                    {a.submittedAt
                      ? ` · Submitted ${new Date(a.submittedAt).toLocaleString("en-GB")}`
                      : ""}
                    {a.feedbackReleased && a.mark != null
                      ? ` · Mark ${a.mark}`
                      : a.feedbackReleased
                        ? " · Feedback released"
                        : ""}
                  </p>
                </div>
                <Link href={`/student/homework/assignments/${a.assignmentId}`}>
                  <Button size="sm">Open</Button>
                </Link>
              </Card>
            ))}
          </section>
        );
      })}

      {!data.cards.length ? (
        <Card>
          <p className="text-sm text-slate-500">No assignments in this subject</p>
        </Card>
      ) : null}
    </div>
  );
}
