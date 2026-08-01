import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubjectIcon } from "@/components/shared/subject-icon";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/get-profile";
import { getBranding } from "@/lib/school/branding";
import {
  loadStudentSubjectAssignments,
  loadStudentSubjectSummaries,
} from "@/lib/student-homework/queries";
import { currentTimeMs } from "@/lib/utils/time";

export default async function StudentDashboardPage() {
  const [profile, branding] = await Promise.all([
    requireProfile(["student"]),
    getBranding(),
  ]);
  const supabase = await createClient();
  const subjects = await loadStudentSubjectSummaries(supabase, profile.id);
  const nowMs = currentTimeMs();

  // Pull a light slice of cards across subjects for deadline / feedback panels.
  const subjectDetails = await Promise.all(
    subjects.slice(0, 8).map((s) =>
      loadStudentSubjectAssignments(supabase, profile.id, s.subjectId),
    ),
  );
  const allCards = subjectDetails.flatMap((d) => d?.cards ?? []);
  const overdue = allCards.filter((c) => c.section === "overdue").slice(0, 5);
  const nearest = allCards
    .filter((c) => c.section === "due_soon" || c.section === "upcoming")
    .slice(0, 5);
  const returned = allCards
    .filter((c) => c.section === "returned")
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${profile.first_name}`}
        description={
          branding.schoolName
            ? `${branding.schoolName} — your subjects, deadlines and feedback.`
            : "Your subjects, deadlines and feedback."
        }
        action={
          <Link href="/student/classes">
            <Button variant="outline">Join a class</Button>
          </Link>
        }
      />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Subjects
          </h2>
          <Link href="/student/homework">
            <Button size="sm" variant="secondary">
              All homework
            </Button>
          </Link>
        </div>
        {!subjects.length ? (
          <Card>
            <p className="text-sm text-slate-500">
              You are not enrolled in any classes yet.
            </p>
            <Link href="/student/classes" className="mt-3 inline-block">
              <Button size="sm">Join with a code</Button>
            </Link>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {subjects.map((subject) => (
              <Card
                key={subject.subjectId}
                className="flex items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <SubjectIcon
                    name={subject.subjectName}
                    iconType={subject.iconType}
                    iconValue={subject.iconValue}
                    colour={subject.colour}
                    size="md"
                  />
                  <div>
                    <p className="font-semibold text-slate-900">
                      {subject.subjectName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {subject.dueCount} due · {subject.overdueCount} overdue
                    </p>
                    <p className="text-xs text-slate-500">
                      Next{" "}
                      {subject.nextDeadline
                        ? new Date(subject.nextDeadline).toLocaleString("en-GB")
                        : "—"}
                    </p>
                  </div>
                </div>
                <Link
                  href={`/student/homework/subjects/${encodeURIComponent(subject.subjectId)}`}
                >
                  <Button size="sm" variant="outline">
                    Open
                  </Button>
                </Link>
              </Card>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-3">
          <h2 className="font-semibold text-slate-900">Nearest deadlines</h2>
          {!nearest.length ? (
            <p className="text-sm text-slate-500">No upcoming deadlines</p>
          ) : (
            <ul className="space-y-2">
              {nearest.map((a) => (
                <li key={a.assignmentId}>
                  <Link
                    href={`/student/homework/assignments/${a.assignmentId}`}
                    className="block rounded-xl border border-slate-100 px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    <p className="font-medium text-slate-900">{a.title}</p>
                    <p className="text-xs text-slate-500">
                      {a.dueAt
                        ? new Date(a.dueAt).toLocaleString("en-GB")
                        : "—"}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="space-y-3">
          <h2 className="font-semibold text-slate-900">Overdue work</h2>
          {!overdue.length ? (
            <p className="text-sm text-slate-500">Nothing overdue</p>
          ) : (
            <ul className="space-y-2">
              {overdue.map((a) => (
                <li key={a.assignmentId}>
                  <Link
                    href={`/student/homework/assignments/${a.assignmentId}`}
                    className="flex items-center justify-between rounded-xl border border-rose-100 px-3 py-2 text-sm hover:bg-rose-50/40"
                  >
                    <span className="font-medium text-slate-900">{a.title}</span>
                    <Badge tone="danger">Overdue</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="space-y-3">
          <h2 className="font-semibold text-slate-900">Recently returned</h2>
          {!returned.length ? (
            <p className="text-sm text-slate-500">No released feedback yet</p>
          ) : (
            <ul className="space-y-2">
              {returned.map((a) => (
                <li key={a.assignmentId}>
                  <Link
                    href={`/student/homework/assignments/${a.assignmentId}`}
                    className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    <span className="font-medium text-slate-900">{a.title}</span>
                    <Badge tone="success">
                      {a.mark != null ? `Mark ${a.mark}` : "Feedback"}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <p className="text-xs text-slate-400">
        Updated {new Date(nowMs).toLocaleString("en-GB")}
      </p>
    </div>
  );
}
