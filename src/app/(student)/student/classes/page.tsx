import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JoinClassForm } from "@/components/student/join-class-form";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";

export default async function StudentClassesPage() {
  const profile = await requireProfile(["student"]);
  const supabase = await createClient();

  const { data: memberships } = await supabase
    .from("class_members")
    .select(
      "joined_at, class:classes!class_members_class_id_fkey(id, name, subject, year_group, archived)",
    )
    .eq("student_id", profile.id);

  const classes = (memberships ?? [])
    .map((m) => {
      const c = Array.isArray(m.class) ? m.class[0] : m.class;
      return c ? { ...c, joined_at: m.joined_at } : null;
    })
    .filter(Boolean) as {
    id: string;
    name: string;
    subject: string;
    year_group: string | null;
    archived: boolean;
    joined_at: string;
  }[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Classes"
        description="Join a class with a code from your teacher."
      />

      <Card>
        <CardTitle className="mb-4">Join a class</CardTitle>
        <JoinClassForm />
      </Card>

      <Card>
        <CardTitle className="mb-4">Enrolled classes</CardTitle>
        {!classes.length ? (
          <p className="text-sm text-slate-500">No classes yet</p>
        ) : (
          <ul className="space-y-3">
            {classes.map((c) => (
              <li
                key={c.id}
                className="rounded-2xl border border-slate-100 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{c.name}</p>
                    <p className="text-sm text-slate-500">
                      {c.subject}
                      {c.year_group ? ` · ${c.year_group}` : ""}
                    </p>
                  </div>
                  <Badge tone={c.archived ? "neutral" : "success"}>
                    {c.archived ? "Archived" : "Active"}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
