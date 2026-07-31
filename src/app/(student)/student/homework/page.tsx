import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";

export default async function StudentHomeworkPage() {
  const profile = await requireProfile(["student"]);
  const supabase = await createClient();

  const { data: memberships } = await supabase
    .from("class_members")
    .select("class_id")
    .eq("student_id", profile.id);
  const classIds = (memberships ?? []).map((m) => m.class_id);

  const { data: assignments } = classIds.length
    ? await supabase
        .from("assignments")
        .select("id, title, due_at, class_id, classes(name)")
        .in("class_id", classIds)
        .eq("status", "published")
        .order("due_at", { ascending: true })
    : { data: [] as { id: string; title: string; due_at: string | null; class_id: string; classes: { name: string } | { name: string }[] | null }[] };

  const ids = (assignments ?? []).map((a) => a.id);
  const { data: submissions } = ids.length
    ? await supabase
        .from("submissions")
        .select("assignment_id, status, returned_at")
        .eq("student_id", profile.id)
        .in("assignment_id", ids)
    : { data: [] as { assignment_id: string; status: string; returned_at: string | null }[] };

  const byAssignment = new Map(
    (submissions ?? []).map((s) => [s.assignment_id, s]),
  );
  const { currentTimeMs } = await import("@/lib/utils/time");
  const nowMs = currentTimeMs();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Homework"
        description="Published assignments for your classes."
      />
      {!assignments?.length ? (
        <Card>
          <p className="text-sm text-slate-500">
            No assignments have been published
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => {
            const submission = byAssignment.get(a.id);
            const className = Array.isArray(a.classes)
              ? a.classes[0]?.name
              : a.classes?.name;
            const late =
              a.due_at &&
              new Date(a.due_at).getTime() < nowMs &&
              (!submission ||
                ["draft", "returned"].includes(submission.status));
            return (
              <Card
                key={a.id}
                className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="mb-1 flex flex-wrap gap-2">
                    <Badge tone="neutral">{className ?? "Class"}</Badge>
                    <Badge tone={late ? "danger" : "brand"}>
                      {submission?.status ?? "not submitted"}
                    </Badge>
                    {late ? <Badge tone="warning">Past due</Badge> : null}
                  </div>
                  <h2 className="font-semibold text-slate-900">{a.title}</h2>
                  <p className="text-xs text-slate-500">
                    Due{" "}
                    {a.due_at
                      ? new Date(a.due_at).toLocaleString("en-GB")
                      : "—"}
                    {submission?.returned_at
                      ? ` · Returned ${new Date(submission.returned_at).toLocaleDateString("en-GB")}`
                      : ""}
                  </p>
                </div>
                <Link href={`/student/homework/${a.id}`}>
                  <Button size="sm">Open</Button>
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
