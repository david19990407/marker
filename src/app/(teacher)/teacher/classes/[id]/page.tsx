import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClassSummary } from "@/components/shared/class-summary";
import { ClassDetailActions } from "@/components/teacher/class-detail-actions";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import type { ClassTeacherRole } from "@/lib/types";

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
    .maybeSingle();

  if (!classRow) notFound();

  const { data: membership } = await supabase
    .from("class_teachers")
    .select("membership_role, can_manage_members")
    .eq("class_id", id)
    .eq("teacher_id", profile.id)
    .maybeSingle();

  const hasAccess =
    membership !== null ||
    classRow.teacher_id === profile.id ||
    profile.role === "admin";
  if (!hasAccess) notFound();

  const canManageStudents =
    profile.role === "admin" ||
    membership?.can_manage_members === true ||
    membership?.membership_role === "lead_teacher" ||
    classRow.teacher_id === profile.id;

  const [
    { data: memberships },
    { data: classTeachers },
    { data: subjectRow },
    { data: assignments },
  ] = await Promise.all([
    supabase
      .from("class_members")
      .select(
        "student_id, student:profiles!class_members_student_id_fkey(id, display_name, email)",
      )
      .eq("class_id", id),
    supabase
      .from("class_teachers")
      .select(
        "id, teacher_id, membership_role, teacher:profiles!class_teachers_teacher_id_fkey(id, display_name, email)",
      )
      .eq("class_id", id),
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
    supabase
      .from("assignments")
      .select("id, title, status")
      .eq("class_id", id)
      .order("created_at", { ascending: false })
      .limit(6),
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
      membership_role: ct.membership_role as ClassTeacherRole,
    };
  });

  const colour =
    subjectRow?.colour || classRow.colour_hex || "#7C3AED";

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
          <ClassSummary
            name={classRow.name}
            subject={classRow.subject}
            yearGroup={classRow.year_group}
            colourHex={classRow.colour_hex}
            subjectIconType={subjectRow?.icon_type}
            subjectIconValue={
              subjectRow?.icon_value ||
              subjectRow?.icon_storage_path ||
              subjectRow?.icon_key
            }
            subjectColour={colour}
            archived={classRow.archived}
          />
        </Card>
        <Card>
          <CardTitle className="mb-4">Join code & students</CardTitle>
          <ClassDetailActions
            classId={id}
            members={members}
            joinCode={classRow.join_code}
            archived={classRow.archived}
            canManageStudents={canManageStudents}
            canRegenerateJoinCode
          />
        </Card>
      </div>

      <Card>
        <CardTitle className="mb-4">Teachers</CardTitle>
        <ul className="space-y-2">
          {teachers.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium text-slate-900">
                  {t.display_name}
                  {t.teacher_id === profile.id ? (
                    <span className="ml-2 text-xs text-slate-400">(you)</span>
                  ) : null}
                </p>
                <p className="text-xs text-slate-500">{t.email}</p>
              </div>
              <Badge tone="brand" className="capitalize">
                {t.membership_role.replace(/_/g, " ")}
              </Badge>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Teacher membership is managed by an administrator.
        </p>
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <CardTitle>Assignments</CardTitle>
          <Link href="/teacher/assignments/new">
            <Button size="sm">New assignment</Button>
          </Link>
        </div>
        {!assignments?.length ? (
          <p className="text-sm text-slate-500">No assignments yet.</p>
        ) : (
          <ul className="space-y-2">
            {assignments.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/teacher/assignments/${a.id}`}
                  className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3 text-sm hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-900">{a.title}</span>
                  <Badge tone="neutral" className="capitalize">
                    {a.status}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
