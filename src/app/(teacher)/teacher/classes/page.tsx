import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";

export default async function TeacherClassesPage() {
  const profile = await requireProfile(["teacher", "admin"]);
  const supabase = await createClient();

  // Include classes where this teacher is a member via class_teachers
  const { data: ctRows } = await supabase
    .from("class_teachers")
    .select(
      "membership_role, classes(id, name, subject, year_group, join_code, archived, created_at)",
    )
    .eq("teacher_id", profile.id);

  // Deduplicate and flatten; fall back to empty if class_teachers not available
  const classesByIdMap = new Map<
    string,
    { id: string; name: string; subject: string; year_group: string | null; join_code: string; archived: boolean; created_at: string; membership_role: string }
  >();
  for (const row of ctRows ?? []) {
    const c = Array.isArray(row.classes) ? row.classes[0] : row.classes;
    if (c && !classesByIdMap.has(c.id)) {
      classesByIdMap.set(c.id, { ...c, membership_role: row.membership_role });
    }
  }

  // Also include legacy classes where teacher_id = profile.id but not yet in class_teachers
  const { data: legacyClasses } = await supabase
    .from("classes")
    .select("id, name, subject, year_group, join_code, archived, created_at")
    .eq("teacher_id", profile.id);

  for (const c of legacyClasses ?? []) {
    if (!classesByIdMap.has(c.id)) {
      classesByIdMap.set(c.id, { ...c, membership_role: "lead_teacher" });
    }
  }

  const classes = Array.from(classesByIdMap.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const classIds = classes.map((c) => c.id);
  const { data: members } = classIds.length
    ? await supabase.from("class_members").select("class_id").in("class_id", classIds)
    : { data: [] as { class_id: string }[] };

  const counts = new Map<string, number>();
  (members ?? []).forEach((m) => {
    counts.set(m.class_id, (counts.get(m.class_id) ?? 0) + 1);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Classes"
        description="Create classes, share join codes and manage members."
        action={
          <Link href="/teacher/classes/new">
            <Button>New class</Button>
          </Link>
        }
      />
      {!classes?.length ? (
        <Card>
          <p className="text-sm text-slate-500">No classes yet</p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {classes.map((c) => (
            <Card key={c.id}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <h2 className="font-semibold text-slate-900">{c.name}</h2>
                <div className="flex gap-1.5">
                  {c.membership_role !== "lead_teacher" ? (
                    <Badge tone="neutral" className="capitalize">
                      {c.membership_role.replace(/_/g, " ")}
                    </Badge>
                  ) : null}
                  <Badge tone={c.archived ? "neutral" : "success"}>
                    {c.archived ? "Archived" : "Active"}
                  </Badge>
                </div>
              </div>
              <p className="text-sm text-slate-500">
                {c.subject}
                {c.year_group ? ` · ${c.year_group}` : ""}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                Join code: {c.join_code} · {counts.get(c.id) ?? 0} students
              </p>
              <Link href={`/teacher/classes/${c.id}`} className="mt-4 inline-block">
                <Button size="sm" variant="secondary">
                  Open
                </Button>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
