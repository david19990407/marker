import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClassMembersPanel } from "@/components/admin/class-members-panel";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";

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
    .select("*, teacher:profiles!classes_teacher_id_fkey(display_name, email)")
    .eq("id", id)
    .maybeSingle();
  if (!classRow) notFound();

  const [{ data: memberships }, { data: students }] = await Promise.all([
    supabase
      .from("class_members")
      .select("student_id, student:profiles!class_members_student_id_fkey(id, display_name, email)")
      .eq("class_id", id),
    supabase
      .from("profiles")
      .select("id, display_name, email")
      .eq("role", "student")
      .eq("is_active", true)
      .order("display_name"),
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
  const teacher = Array.isArray(classRow.teacher)
    ? classRow.teacher[0]
    : classRow.teacher;

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

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-500">Teacher</p>
          <p className="mt-1 font-medium">{teacher?.display_name ?? "—"}</p>
          <p className="text-xs text-slate-400">{teacher?.email}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Join code</p>
          <p className="mt-1 font-mono text-lg font-semibold">{classRow.join_code}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Status</p>
          <div className="mt-2">
            <Badge tone={classRow.archived ? "neutral" : "success"}>
              {classRow.archived ? "Archived" : "Active"}
            </Badge>
          </div>
        </Card>
      </div>

      <Card>
        <CardTitle className="mb-4">Class members</CardTitle>
        <ClassMembersPanel
          classId={id}
          members={members}
          availableStudents={available}
        />
      </Card>
    </div>
  );
}
