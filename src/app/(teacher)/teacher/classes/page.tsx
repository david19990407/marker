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
  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, subject, year_group, join_code, archived")
    .eq("teacher_id", profile.id)
    .order("created_at", { ascending: false });

  const classIds = (classes ?? []).map((c) => c.id);
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
                <Badge tone={c.archived ? "neutral" : "success"}>
                  {c.archived ? "Archived" : "Active"}
                </Badge>
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
