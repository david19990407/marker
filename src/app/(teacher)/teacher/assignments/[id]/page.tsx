import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ResourceUploader } from "@/components/teacher/resource-uploader";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";

export default async function TeacherAssignmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireProfile(["teacher", "admin"]);
  const { id } = await params;
  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("assignments")
    .select("*, classes(name)")
    .eq("id", id)
    .eq("teacher_id", profile.id)
    .maybeSingle();
  if (!assignment) notFound();

  const [{ data: resources }, { data: submissions }] = await Promise.all([
    supabase
      .from("assignment_resources")
      .select("id, file_name, storage_path, file_type")
      .eq("assignment_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("submissions")
      .select(
        "id, status, submitted_at, student:profiles!submissions_student_id_fkey(display_name)",
      )
      .eq("assignment_id", id)
      .order("submitted_at", { ascending: true }),
  ]);

  const className = Array.isArray(assignment.classes)
    ? assignment.classes[0]?.name
    : assignment.classes?.name;

  return (
    <div className="space-y-6">
      <PageHeader
        title={assignment.title}
        description={className ?? "Assignment"}
        action={
          <div className="flex gap-2">
            <Link href={`/teacher/assignments/${id}/edit`}>
              <Button variant="secondary">Edit</Button>
            </Link>
            <Link href={`/teacher/assignments/${id}/export`}>
              <Button variant="outline">Export CSV</Button>
            </Link>
            <Link href="/teacher/assignments">
              <Button variant="outline">Back</Button>
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Badge>{assignment.status}</Badge>
        <Badge tone="neutral">Max {assignment.maximum_mark}</Badge>
        <Badge tone="neutral">
          Due{" "}
          {assignment.due_at
            ? new Date(assignment.due_at).toLocaleString("en-GB")
            : "—"}
        </Badge>
      </div>

      <Card>
        <CardTitle className="mb-2">Instructions</CardTitle>
        <p className="whitespace-pre-wrap text-sm leading-7 text-slate-600">
          {assignment.instructions || "No instructions provided."}
        </p>
      </Card>

      <Card>
        <CardTitle className="mb-4">Resources</CardTitle>
        <ResourceUploader assignmentId={id} resources={resources ?? []} />
      </Card>

      <Card>
        <CardTitle className="mb-4">Submissions</CardTitle>
        {!submissions?.length ? (
          <p className="text-sm text-slate-500">No submissions to mark</p>
        ) : (
          <ul className="space-y-2">
            {submissions.map((s) => {
              const student = Array.isArray(s.student) ? s.student[0] : s.student;
              return (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {student?.display_name ?? "Student"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {s.status}
                      {s.submitted_at
                        ? ` · ${new Date(s.submitted_at).toLocaleString("en-GB")}`
                        : ""}
                    </p>
                  </div>
                  <Link href={`/teacher/marking/${s.id}`}>
                    <Button size="sm">Review</Button>
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
