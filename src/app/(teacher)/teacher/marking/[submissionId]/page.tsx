import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FeedbackForm } from "@/components/teacher/feedback-form";
import { DownloadButton } from "@/components/shared/download-button";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import type { Feedback } from "@/lib/types";

export default async function MarkSubmissionPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const profile = await requireProfile(["teacher", "admin"]);
  const { submissionId } = await params;
  const supabase = await createClient();

  const { data: submission } = await supabase
    .from("submissions")
    .select(
      "*, student:profiles!submissions_student_id_fkey(display_name, email), assignments!inner(id, title, maximum_mark, teacher_id, instructions)",
    )
    .eq("id", submissionId)
    .maybeSingle();

  const assignment = Array.isArray(submission?.assignments)
    ? submission?.assignments[0]
    : submission?.assignments;
  if (!submission || !assignment || assignment.teacher_id !== profile.id) {
    notFound();
  }

  const { data: feedback } = await supabase
    .from("feedback")
    .select("*")
    .eq("submission_id", submissionId)
    .maybeSingle();

  const student = Array.isArray(submission.student)
    ? submission.student[0]
    : submission.student;

  return (
    <div className="space-y-6">
      <PageHeader
        title={student?.display_name ?? "Student work"}
        description={assignment.title}
        action={
          <Link href="/teacher/marking">
            <Button variant="outline">Back to queue</Button>
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Badge>{submission.status}</Badge>
        {submission.submitted_at ? (
          <Badge tone="neutral">
            Submitted {new Date(submission.submitted_at).toLocaleString("en-GB")}
          </Badge>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardTitle className="mb-2">Written response</CardTitle>
            <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
              {submission.written_response || "No written response."}
            </p>
          </Card>
          <Card>
            <CardTitle className="mb-3">Uploaded file</CardTitle>
            {submission.storage_path && submission.file_name ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm">{submission.file_name}</p>
                <DownloadButton
                  bucket="student-submissions"
                  path={submission.storage_path}
                />
              </div>
            ) : (
              <p className="text-sm text-slate-500">No file uploaded</p>
            )}
          </Card>
        </div>
        <Card>
          <CardTitle className="mb-4">Teacher feedback</CardTitle>
          <FeedbackForm
            submissionId={submissionId}
            maximumMark={Number(assignment.maximum_mark)}
            feedback={(feedback as Feedback | null) ?? null}
          />
        </Card>
      </div>
    </div>
  );
}
