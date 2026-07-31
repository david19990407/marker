import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClassMembersPanel } from "@/components/admin/class-members-panel";
import { AdminClassConfigForm } from "@/components/admin/admin-class-config-form";
import { AdminClassTeachersPanel } from "@/components/admin/admin-class-teachers-panel";
import { AdminJoinCodePanel } from "@/components/admin/admin-join-code-panel";
import { SubjectIcon } from "@/components/shared/subject-icon";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import {
  getActiveColours,
  getActiveSubjects,
  getActiveYearGroups,
} from "@/lib/school/settings";
import type { ClassTeacherRole } from "@/lib/types";

export default async function AdminClassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireProfile(["admin"]);
  const { id } = await params;
  const supabase = await createClient();

  const { data: classRow } = await supabase
    .from("classes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!classRow) notFound();

  const [
    { data: memberships },
    { data: students },
    { data: classTeachers },
    { data: teacherProfiles },
    { data: assignments },
    { data: subjectRow },
    subjects,
    yearGroups,
    colours,
  ] = await Promise.all([
    supabase
      .from("class_members")
      .select(
        "student_id, student:profiles!class_members_student_id_fkey(id, display_name, email)",
      )
      .eq("class_id", id),
    supabase
      .from("profiles")
      .select("id, display_name, email")
      .eq("role", "student")
      .eq("is_active", true)
      .order("display_name"),
    supabase
      .from("class_teachers")
      .select(
        "id, teacher_id, membership_role, teacher:profiles!class_teachers_teacher_id_fkey(id, display_name, email)",
      )
      .eq("class_id", id),
    supabase
      .from("profiles")
      .select("id, display_name")
      .in("role", ["teacher", "admin"])
      .eq("is_active", true)
      .order("display_name"),
    supabase
      .from("assignments")
      .select("id, title, status, due_at")
      .eq("class_id", id)
      .order("created_at", { ascending: false })
      .limit(8),
    classRow.subject_id
      ? supabase
          .from("school_subjects")
          .select("id, name, icon_type, icon_value, colour, icon_key, icon_storage_path")
          .eq("id", classRow.subject_id)
          .maybeSingle()
      : supabase
          .from("school_subjects")
          .select("id, name, icon_type, icon_value, colour, icon_key, icon_storage_path")
          .ilike("name", classRow.subject)
          .limit(1)
          .maybeSingle(),
    getActiveSubjects(),
    getActiveYearGroups(),
    getActiveColours(),
  ]);

  const members = (memberships ?? []).map((m) => {
    const student = Array.isArray(m.student) ? m.student[0] : m.student;
    return {
      id: student?.id ?? m.student_id,
      display_name: student?.display_name ?? "Student",
      email: student?.email ?? "",
    };
  });
  const memberIds = new Set(members.map((m) => m.id));
  const available = (students ?? []).filter((s) => !memberIds.has(s.id));

  const teachers = (classTeachers ?? []).map((ct) => {
    const teacher = Array.isArray(ct.teacher) ? ct.teacher[0] : ct.teacher;
    return {
      id: ct.id,
      teacher_id: ct.teacher_id,
      display_name: teacher?.display_name ?? "Teacher",
      email: teacher?.email ?? "",
      membership_role: ct.membership_role as ClassTeacherRole,
    };
  });

  const subjectRel = subjectRow;
  const colour =
    subjectRel?.colour || classRow.colour_hex || colours[0]?.hex || "#7C3AED";

  return (
    <div className="space-y-6">
      <PageHeader
        title={classRow.name}
        description={`${classRow.subject}${classRow.year_group ? ` · ${classRow.year_group}` : ""}`}
        action={
          <Link href="/admin/classes">
            <Button variant="outline">Back</Button>
          </Link>
        }
      />

      <div className="flex items-center gap-3">
        <SubjectIcon
          name={classRow.subject}
          iconType={subjectRel?.icon_type}
          iconValue={
            subjectRel?.icon_value ||
            subjectRel?.icon_storage_path ||
            subjectRel?.icon_key
          }
          colour={colour}
          size="lg"
        />
        <Badge tone={classRow.archived ? "neutral" : "success"}>
          {classRow.archived ? "Archived" : "Active"}
        </Badge>
        <Badge tone="neutral">{members.length} students</Badge>
        <Badge tone="neutral">{teachers.length} teachers</Badge>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardTitle className="mb-4">Class configuration</CardTitle>
          <AdminClassConfigForm
            classId={id}
            archived={classRow.archived}
            defaults={{
              name: classRow.name,
              subject: classRow.subject,
              year_group: classRow.year_group,
              colour_hex: classRow.colour_hex,
              teacher_id: classRow.teacher_id,
            }}
            subjects={subjects}
            yearGroups={yearGroups}
            colours={colours}
            teachers={teacherProfiles ?? []}
          />
        </Card>

        <Card>
          <CardTitle className="mb-4">Join code</CardTitle>
          <AdminJoinCodePanel
            classId={id}
            joinCode={classRow.join_code}
            archived={classRow.archived}
          />
        </Card>

        <Card>
          <CardTitle className="mb-4">Teachers</CardTitle>
          <AdminClassTeachersPanel classId={id} teachers={teachers} />
        </Card>

        <Card>
          <CardTitle className="mb-4">Students</CardTitle>
          <ClassMembersPanel
            classId={id}
            members={members}
            availableStudents={available}
          />
        </Card>
      </div>

      <Card>
        <CardTitle className="mb-4">Recent assignments</CardTitle>
        {!assignments?.length ? (
          <p className="text-sm text-slate-500">No assignments for this class yet.</p>
        ) : (
          <ul className="space-y-2">
            {assignments.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-slate-900">{a.title}</p>
                  <p className="text-xs text-slate-500 capitalize">{a.status}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
