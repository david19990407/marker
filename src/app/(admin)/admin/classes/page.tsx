import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateClassForm } from "@/components/admin/create-class-form";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/get-profile";

export default async function AdminClassesPage() {
  await requireProfile(["admin"]);
  const supabase = await createClient();

  const [{ data: classes }, { data: teachers }, { data: members }] =
    await Promise.all([
      supabase
        .from("classes")
        .select("*, teacher:profiles!classes_teacher_id_fkey(display_name)")
        .order("created_at", { ascending: false }),
      supabase
        .from("profiles")
        .select("id, display_name")
        .eq("role", "teacher")
        .eq("is_active", true)
        .order("display_name"),
      supabase.from("class_members").select("class_id"),
    ]);

  const memberCounts = new Map<string, number>();
  (members ?? []).forEach((m) => {
    memberCounts.set(m.class_id, (memberCounts.get(m.class_id) ?? 0) + 1);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Classes"
        description="Create classes, assign teachers and review membership counts."
      />

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardTitle className="mb-4">Create class</CardTitle>
          <CreateClassForm teachers={teachers ?? []} />
        </Card>

        <Card>
          <CardTitle className="mb-4">All classes</CardTitle>
          {!classes?.length ? (
            <p className="text-sm text-slate-500">No classes yet</p>
          ) : (
            <ul className="space-y-3">
              {classes.map((c) => {
                const teacher = c.teacher as
                  | { display_name: string }
                  | { display_name: string }[]
                  | null;
                const teacherName = Array.isArray(teacher)
                  ? teacher[0]?.display_name
                  : teacher?.display_name;
                return (
                  <li
                    key={c.id}
                    className="rounded-2xl border border-slate-100 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-slate-900">{c.name}</p>
                        <p className="text-sm text-slate-500">
                          {c.subject}
                          {c.year_group ? ` · ${c.year_group}` : ""} · Teacher:{" "}
                          {teacherName ?? "—"}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          Join code: {c.join_code} ·{" "}
                          {memberCounts.get(c.id) ?? 0} students
                        </p>
                      </div>
                      <Badge tone={c.archived ? "neutral" : "success"}>
                        {c.archived ? "Archived" : "Active"}
                      </Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
