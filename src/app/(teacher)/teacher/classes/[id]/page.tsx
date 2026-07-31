import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TeacherClassForm } from "@/components/teacher/class-form";
import { ClassDetailActions } from "@/components/teacher/class-detail-actions";
import { CoTeachersPanel } from "@/components/teacher/co-teachers-panel";
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

  // Look up via class_teachers membership OR legacy teacher_id
  const { data: classRow } = await supabase
    .from("classes")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!classRow) notFound();

  // Verify access: check class_teachers or legacy teacher_id
  const { data: membership } = await supabase
    .from("class_teachers")
    .select("membership_role")
    .eq("class_id", id)
    .eq("teacher_id", profile.id)
    .maybeSingle();

  const isLead =
    membership?.membership_role === "lead_teacher" ||
    classRow.teacher_id === profile.id;

  const hasAccess = membership !== null || classRow.teacher_id === profile.id;
  if (!hasAccess) notFound();

  const [{ data: memberships }, { data: classTeachers }] = await Promise.all([
    supabase
      .from("class_members")
      .select(
        "student_id, student:profiles!class_members_student_id_fkey(id, display_name, email)",
      )
      .eq("class_id", id),
    supabase
      .from("class_teachers")
      .select(
        "id, teacher_id, membership_role, can_create_assignments, can_mark_submissions, can_manage_members, teacher:profiles!class_teachers_teacher_id_fkey(id, display_name, email)",
      )
      .eq("class_id", id),
  ]);

  const members = (memberships ?? []).map((m) => {
    const student = Array.isArray(m.student) ? m.student[0] : m.student;
    return {
      id: student?.id ?? m.student_id,
      display_name: student?.display_name ?? "Student",
      email: student?.email ?? "",
    };
  });

  const teachers = (classTeachers ?? []).map((ct) => {
    const teacher = Array.isArray(ct.teacher) ? ct.teacher[0] : ct.teacher;
    return {
      id: ct.id,
      teacher_id: ct.teacher_id,
      display_name: teacher?.display_name ?? "Teacher",
      email: teacher?.email ?? "",
      membership_role: ct.membership_role,
      can_create_assignments: ct.can_create_assignments,
      can_mark_submissions: ct.can_mark_submissions,
      can_manage_members: ct.can_manage_members,
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
          <CardTitle className="mb-4">Students</CardTitle>
          <ClassDetailActions classId={id} members={members} />
        </Card>
      </div>

      <Card>
        <CardTitle className="mb-4">Teachers</CardTitle>
        <CoTeachersPanel
          classId={id}
          teachers={teachers}
          currentTeacherId={profile.id}
          isLead={isLead}
        />
      </Card>
    </div>
  );
}
