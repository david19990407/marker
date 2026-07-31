import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TeacherClassForm } from "@/components/teacher/class-form";
import { ClassDetailActions } from "@/components/teacher/class-detail-actions";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";

export default async function TeacherClassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireProfile(["teacher", "admin"]);
  const { id } = await params;
  const supabase = await createClient();

  const { data: classRow } = await supabase
    .from("classes")
    .select("*")
    .eq("id", id)
    .eq("teacher_id", profile.id)
    .maybeSingle();
  if (!classRow) notFound();

  const { data: memberships } = await supabase
    .from("class_members")
    .select(
      "student_id, student:profiles!class_members_student_id_fkey(id, display_name, email)",
    )
    .eq("class_id", id);

  const members = (memberships ?? []).map((m) => {
    const student = Array.isArray(m.student) ? m.student[0] : m.student;
    return {
      id: student?.id ?? m.student_id,
      display_name: student?.display_name ?? "Student",
      email: student?.email ?? "",
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={classRow.name}
        description={`Join code: ${classRow.join_code}`}
        action={
          <Link href="/teacher/classes">
            <Button variant="outline">Back</Button>
          </Link>
        }
      />
      <Badge tone={classRow.archived ? "neutral" : "success"}>
        {classRow.archived ? "Archived" : "Active"}
      </Badge>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardTitle className="mb-4">Class details</CardTitle>
          <TeacherClassForm
            classId={id}
            defaults={{
              name: classRow.name,
              subject: classRow.subject,
              year_group: classRow.year_group,
            }}
          />
        </Card>
        <Card>
          <CardTitle className="mb-4">Members</CardTitle>
          <ClassDetailActions classId={id} members={members} />
        </Card>
      </div>
    </div>
  );
}
