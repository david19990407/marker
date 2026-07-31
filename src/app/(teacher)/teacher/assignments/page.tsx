import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";

export default async function TeacherAssignmentsPage() {
  const profile = await requireProfile(["teacher", "admin"]);
  const supabase = await createClient();

  const { data: assignments } = await supabase
    .from("assignments")
    .select("id, title, status, due_at, class_id, classes(name)")
    .eq("teacher_id", profile.id)
    .order("created_at", { ascending: false });

  const ids = (assignments ?? []).map((a) => a.id);
  const { data: submissions } = ids.length
    ? await supabase
        .from("submissions")
        .select("assignment_id, status")
        .in("assignment_id", ids)
    : { data: [] as { assignment_id: string; status: string }[] };

  const counts = new Map<string, { total: number; unmarked: number }>();
  (submissions ?? []).forEach((s) => {
    const current = counts.get(s.assignment_id) ?? { total: 0, unmarked: 0 };
    current.total += 1;
    if (s.status === "submitted" || s.status === "late") current.unmarked += 1;
    counts.set(s.assignment_id, current);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assignments"
        description="Create, publish and track homework for your classes."
        action={
          <Link href="/teacher/assignments/new">
            <Button>New assignment</Button>
          </Link>
        }
      />
      {!assignments?.length ? (
        <Card>
          <p className="text-sm text-slate-500">No assignments have been created</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => {
            const className = Array.isArray(a.classes)
              ? a.classes[0]?.name
              : (a.classes as { name: string } | null)?.name;
            const c = counts.get(a.id) ?? { total: 0, unmarked: 0 };
            return (
              <Card
                key={a.id}
                className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="mb-1 flex flex-wrap gap-2">
                    <Badge
                      tone={
                        a.status === "published"
                          ? "success"
                          : a.status === "draft"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {a.status}
                    </Badge>
                    <Badge tone="neutral">{className ?? "Class"}</Badge>
                  </div>
                  <h2 className="font-semibold text-slate-900">{a.title}</h2>
                  <p className="text-xs text-slate-500">
                    Due{" "}
                    {a.due_at
                      ? new Date(a.due_at).toLocaleString("en-GB")
                      : "—"}{" "}
                    · {c.total} submissions · {c.unmarked} unmarked
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link href={`/teacher/assignments/${a.id}`}>
                    <Button size="sm" variant="secondary">
                      Open
                    </Button>
                  </Link>
                  <Link href={`/teacher/assignments/${a.id}/export`}>
                    <Button size="sm" variant="outline">
                      Export CSV
                    </Button>
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
