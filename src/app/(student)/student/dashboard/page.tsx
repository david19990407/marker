import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/get-profile";

export default async function StudentDashboardPage() {
  const profile = await requireProfile(["student"]);
  const supabase = await createClient();

  const { data: memberships } = await supabase
    .from("class_members")
    .select("class_id")
    .eq("student_id", profile.id);
  const classIds = (memberships ?? []).map((m) => m.class_id);

  const { data: assignments } = classIds.length
    ? await supabase
        .from("assignments")
        .select("id, title, due_at")
        .in("class_id", classIds)
        .eq("status", "published")
        .order("due_at", { ascending: true })
    : { data: [] as { id: string; title: string; due_at: string | null }[] };

  const assignmentIds = (assignments ?? []).map((a) => a.id);
  const { data: submissions } = assignmentIds.length
    ? await supabase
        .from("submissions")
        .select("id, assignment_id, status, submitted_at, returned_at")
        .eq("student_id", profile.id)
        .in("assignment_id", assignmentIds)
    : {
        data: [] as {
          id: string;
          assignment_id: string;
          status: string;
          submitted_at: string | null;
          returned_at: string | null;
        }[],
      };

  const submissionByAssignment = new Map(
    (submissions ?? []).map((s) => [s.assignment_id, s]),
  );

  const releasedIds = (submissions ?? [])
    .filter((s) => s.status === "returned" || s.status === "marked")
    .map((s) => s.id);

  const { data: feedbackRows } = releasedIds.length
    ? await supabase
        .from("feedback")
        .select("submission_id, mark, status, released_at")
        .in("submission_id", releasedIds)
        .eq("status", "released")
    : {
        data: [] as {
          submission_id: string;
          mark: number | null;
          status: string;
          released_at: string | null;
        }[],
      };

  const feedbackBySubmission = new Map(
    (feedbackRows ?? []).map((f) => [f.submission_id, f]),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${profile.first_name}`}
        description="Assigned homework, submission status and released feedback."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-500">My classes</p>
          <p className="mt-2 text-3xl font-semibold">{classIds.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Assigned homework</p>
          <p className="mt-2 text-3xl font-semibold">
            {assignments?.length ?? 0}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Released feedback</p>
          <p className="mt-2 text-3xl font-semibold">
            {feedbackRows?.length ?? 0}
          </p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/student/classes">
          <Button variant="secondary">Join a class</Button>
        </Link>
        <Link href="/student/homework">
          <Button>View homework</Button>
        </Link>
      </div>

      <Card>
        <h2 className="mb-4 font-semibold text-slate-900">Assigned homework</h2>
        {!assignments?.length ? (
          <p className="text-sm text-slate-500">
            No assignments have been published
          </p>
        ) : (
          <ul className="space-y-3">
            {assignments.map((assignment) => {
              const submission = submissionByAssignment.get(assignment.id);
              const feedback = submission
                ? feedbackBySubmission.get(submission.id)
                : undefined;
              return (
                <li
                  key={assignment.id}
                  className="rounded-2xl border border-slate-100 px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900">
                        {assignment.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        Due{" "}
                        {assignment.due_at
                          ? new Date(assignment.due_at).toLocaleString("en-GB")
                          : "—"}
                      </p>
                    </div>
                    <Badge tone="neutral">
                      {submission?.status ?? "not submitted"}
                    </Badge>
                  </div>
                  {feedback ? (
                    <p className="mt-2 text-sm text-slate-600">
                      Mark: {feedback.mark ?? "—"}
                      {feedback.released_at
                        ? ` · Returned ${new Date(feedback.released_at).toLocaleDateString("en-GB")}`
                        : ""}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-slate-400">
                      No feedback released yet
                    </p>
                  )}
                  <Link
                    href={`/student/homework/${assignment.id}`}
                    className="mt-3 inline-block"
                  >
                    <Button size="sm" variant="outline">
                      Open
                    </Button>
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
