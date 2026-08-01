import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import { CopyAssignmentButton } from "@/components/teacher/copy-assignment-button";
import {
  sortTeacherAssignments,
  teacherBucket,
} from "@/lib/homework/ordering";
import { currentTimeMs } from "@/lib/utils/time";

export default async function TeacherAssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const profile = await requireProfile(["teacher", "admin"]);
  const { filter } = await searchParams;
  const supabase = await createClient();

  const { data: ctRows } = await supabase
    .from("class_teachers")
    .select("class_id")
    .eq("teacher_id", profile.id);

  const classIdSet = new Set((ctRows ?? []).map((r) => r.class_id));

  const { data: legacyAssignments } = await supabase
    .from("assignments")
    .select(
      "id, title, status, due_at, release_at, updated_at, created_at, class_id, template_id, classes(name, subject, year_group)",
    )
    .eq("teacher_id", profile.id);

  let assignments = legacyAssignments ?? [];

  if (classIdSet.size > 0) {
    const { data: classBasedAssignments } = await supabase
      .from("assignments")
      .select(
        "id, title, status, due_at, release_at, updated_at, created_at, class_id, template_id, classes(name, subject, year_group)",
      )
      .in("class_id", Array.from(classIdSet));

    const merged = new Map<string, NonNullable<typeof classBasedAssignments>[number]>();
    for (const a of [...(classBasedAssignments ?? []), ...(legacyAssignments ?? [])]) {
      if (!merged.has(a.id)) merged.set(a.id, a);
    }
    assignments = Array.from(merged.values());
  }

  const nowMs = currentTimeMs();
  let ordered = sortTeacherAssignments(assignments, nowMs);

  if (filter && filter !== "all") {
    ordered = ordered.filter((a) => teacherBucket(a, nowMs) === filter);
  } else {
    ordered = ordered.filter((a) => teacherBucket(a, nowMs) !== "archived");
  }

  const ids = ordered.map((a) => a.id);
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

  const filters = [
    { id: "all", label: "Active lists" },
    { id: "draft", label: "Draft" },
    { id: "scheduled", label: "Scheduled" },
    { id: "active", label: "Active" },
    { id: "closed", label: "Closed" },
    { id: "archived", label: "Archived" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Homework"
        description="Create, publish and track homework for your classes."
        action={
          <Link href="/teacher/assignments/new">
            <Button>Create and build homework</Button>
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link key={f.id} href={`/teacher/assignments?filter=${f.id}`}>
            <Badge
              tone={
                (!filter && f.id === "all") || filter === f.id
                  ? "brand"
                  : "neutral"
              }
            >
              {f.label}
            </Badge>
          </Link>
        ))}
      </div>

      {!ordered.length ? (
        <Card>
          <p className="text-sm text-slate-500">No homework matches this filter</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {ordered.map((a) => {
            const classObj = Array.isArray(a.classes) ? a.classes[0] : a.classes;
            const className = classObj?.name;
            const bucket = teacherBucket(a, nowMs);
            const count = counts.get(a.id);
            return (
              <Card
                key={a.id}
                className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="mb-1 flex flex-wrap gap-2">
                    <Badge tone="neutral">{className ?? "Class"}</Badge>
                    <Badge>{bucket}</Badge>
                    <Badge tone="neutral">{a.status}</Badge>
                  </div>
                  <h2 className="font-semibold text-slate-900">{a.title}</h2>
                  <p className="text-xs text-slate-500">
                    Release{" "}
                    {a.release_at
                      ? new Date(a.release_at).toLocaleString("en-GB")
                      : "—"}
                    {" · Due "}
                    {a.due_at
                      ? new Date(a.due_at).toLocaleString("en-GB")
                      : "—"}
                    {count
                      ? ` · ${count.total} submissions · ${count.unmarked} to mark`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/teacher/assignments/${a.id}/builder`}>
                    <Button size="sm">Builder</Button>
                  </Link>
                  <Link href={`/teacher/assignments/${a.id}`}>
                    <Button size="sm" variant="secondary">
                      Open
                    </Button>
                  </Link>
                  <CopyAssignmentButton assignmentId={a.id} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
